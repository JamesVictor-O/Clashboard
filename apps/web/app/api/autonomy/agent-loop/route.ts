/**
 * Agent Autonomy Loop
 *
 * One tick of the autonomous agent lifecycle:
 *   1. Load stored preferences — bail immediately if mode is "off"
 *   2. Scan chain for open (WAITING) challenges
 *   3. Evaluate each challenge against the agent's rules
 *   4. Execute the best match via 1Shot (accept) or generate + issue a new challenge
 *   5. Return a structured LoopResult for the dashboard activity feed
 *
 * Called by the dashboard every 30 s when mode === "autonomous",
 * or on-demand when mode === "assisted" (dry-run, no execution).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { getStoredAutonomyPreferences } from "@/lib/autonomy/preference-store";
import { getArenaPermission } from "@/lib/autonomy/arena-permission-store";
import { evaluateBattleEntryPreference } from "@/lib/autonomy/preferences";
import { getExecutionLog, getLoopLog, pushLoopEntry } from "@/lib/autonomy/loop-store";

// GET — return loop log for an agent (no chain scan, no execution)
export async function GET(req: NextRequest) {
  const agentOwner = req.nextUrl.searchParams.get("agentOwner");
  if (!agentOwner || !/^0x[0-9a-fA-F]{40}$/.test(agentOwner)) {
    return NextResponse.json({ error: "Invalid agentOwner" }, { status: 400 });
  }
  return NextResponse.json({
    loopLog: getLoopLog(agentOwner),
    executionLog: getExecutionLog().filter((e) => e.agentOwner.toLowerCase() === agentOwner.toLowerCase()),
  });
}
import { fetchRooms, type Room } from "@/lib/challenges";
import { acceptChallengeWith1Shot, issueChallengeWith1Shot } from "@/lib/oneshot/execute";
import { acceptChallengeForOnChain, issueChallengeForOnChain } from "@/lib/chain";
import { complete } from "@/lib/venice";
import type { ResearchCategory } from "@/lib/types";

const BodySchema = z.object({
  agentOwner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  /** Win rate 0–1 for the agent (used for opponent rule evaluation) */
  agentWinRate: z.number().min(0).max(1).optional(),
});

// Map display category strings ("Sports") to ResearchCategory ("sports")
function normalizeCategory(raw: string): ResearchCategory {
  const lower = raw.toLowerCase();
  if (lower === "sports") return "sports";
  if (lower === "music") return "music";
  if (lower === "tech") return "tech";
  if (lower === "crypto") return "crypto";
  return "culture";
}

// Count battles entered today from the loop log (loop writes here, not executor log)
function battlesEnteredToday(agentOwner: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return getLoopLog(agentOwner).filter(
    (e) =>
      e.actionType === "ACCEPT_CHALLENGE" &&
      e.status === "success" &&
      new Date(e.timestamp).toISOString().slice(0, 10) === today
  ).length;
}

// Track rooms already acted on to avoid double-entering within a session
const actedRooms = new Set<string>();

// Venice-generated debate topic for autonomous challenge creation
async function generateChallengeTopic(categories: ResearchCategory[]): Promise<{ topic: string; category: ResearchCategory }> {
  const cat = categories[Math.floor(Math.random() * categories.length)];
  const raw = await complete(
    [
      { role: "system", content: "You are a Clashboard AI agent creating a debate challenge. Output only valid JSON." },
      {
        role: "user",
        content: `Generate a sharp, debate-worthy topic in the "${cat}" category for two AI agents to argue about. ` +
          `Keep it provocative but factual. Respond ONLY with: {"topic":"<the topic in one sentence>"}`,
      },
    ],
    { maxTokens: 80, temperature: 0.9 }
  );
  try {
    const match = raw.match(/\{[\s\S]*?\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { topic?: string };
      if (parsed.topic) return { topic: parsed.topic, category: cat };
    }
  } catch { /* fall through */ }
  return { topic: `Is ${cat} culture more influential than ever?`, category: cat };
}

export interface LoopResult {
  action: "ACCEPTED" | "ISSUED" | "RECOMMEND_ACCEPT" | "RECOMMEND_ISSUE" | "SKIPPED" | "BLOCKED";
  reason?: string;
  room?: Pick<Room, "id" | "topic" | "stake" | "category" | "creatorAddress">;
  generatedTopic?: string;
  txHash?: string;
  battleId?: string;
  scanned: number;
  evaluated: number;
  timestamp: number;
}

export async function POST(req: NextRequest): Promise<NextResponse<LoopResult>> {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { action: "BLOCKED", reason: "Invalid request", scanned: 0, evaluated: 0, timestamp: Date.now() },
      { status: 400 }
    );
  }

  const agentOwner = parsed.data.agentOwner as `0x${string}`;
  const agentWinRate = parsed.data.agentWinRate ?? 0;

  // ── 1. Load preferences ───────────────────────────────────────────────────
  const prefs = getStoredAutonomyPreferences(agentOwner);
  console.log(`[AgentLoop] owner=${agentOwner} mode=${prefs.mode} autoAccept=${prefs.autoAcceptChallenges} maxStake=${prefs.maxArenaStakeUSDC} categories=${prefs.battleCategories.join(",")} dailyLimit=${prefs.dailyBattleLimit}`);

  if (prefs.mode === "off") {
    console.log(`[AgentLoop] SKIP — autonomy is off`);
    return NextResponse.json({ action: "SKIPPED", reason: "Autonomy is off.", scanned: 0, evaluated: 0, timestamp: Date.now() });
  }

  // ── 2. Scan chain for open challenges ─────────────────────────────────────
  let rooms: Room[] = [];
  try {
    rooms = await fetchRooms();
    console.log(`[AgentLoop] fetchRooms returned ${rooms.length} rooms total`);
    rooms.forEach((r, i) => console.log(`  [${i}] id=${r.id.slice(0,10)} state=${r.state} stake=${r.stake} category=${r.category} creator=${r.creatorAddress.slice(0,10)}`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Chain scan failed";
    console.error(`[AgentLoop] fetchRooms error: ${msg}`);
    return NextResponse.json({ action: "BLOCKED", reason: `Chain scan error: ${msg}`, scanned: 0, evaluated: 0, timestamp: Date.now() });
  }

  const open = rooms.filter(
    (r) =>
      r.state === "WAITING" &&
      r.creatorAddress.toLowerCase() !== agentOwner.toLowerCase() &&
      !actedRooms.has(r.id)
  );
  console.log(`[AgentLoop] ${open.length} open (WAITING, not own, not acted) out of ${rooms.length}`);
  rooms.filter(r => r.state !== "WAITING").forEach(r => console.log(`  filtered-state: ${r.id.slice(0,10)} state=${r.state}`));
  rooms.filter(r => r.creatorAddress.toLowerCase() === agentOwner.toLowerCase()).forEach(r => console.log(`  filtered-own: ${r.id.slice(0,10)}`));

  // ── 3. Evaluate each open challenge against preferences ───────────────────
  const todayCount = battlesEnteredToday(agentOwner);
  console.log(`[AgentLoop] battlesEnteredToday=${todayCount} limit=${prefs.dailyBattleLimit}`);
  let selectedRoom: Room | null = null;
  let evaluated = 0;
  const rejections: string[] = [];

  for (const room of open) {
    const category = normalizeCategory(room.category);
    evaluated++;
    const decision = evaluateBattleEntryPreference(
      prefs,
      {
        category,
        stakeUSDC: room.stake,
        opponentWinRate: null, // unknown from room data — skips min/max/rule checks
        agentWinRate,
        isOwnBattle: false,
        intent: "accept",
      },
      todayCount
    );
    console.log(`[AgentLoop] eval room=${room.id.slice(0,10)} category=${category} stake=${room.stake} → ok=${decision.ok}${!decision.ok ? ` reason="${decision.reason}"` : ""}`);
    if (!decision.ok) rejections.push(decision.reason);

    if (decision.ok) {
      selectedRoom = room;
      break;
    }
  }

  // ── 4a. Accept challenge ──────────────────────────────────────────────────
  if (selectedRoom) {
    const room = selectedRoom;

    if (prefs.mode === "assisted") {
      return NextResponse.json({
        action: "RECOMMEND_ACCEPT",
        reason: "Assisted mode — execute manually to confirm.",
        room: { id: room.id, topic: room.topic, stake: room.stake, category: room.category, creatorAddress: room.creatorAddress },
        scanned: open.length,
        evaluated,
        timestamp: Date.now(),
      });
    }

    // autonomous — need stored permission
    const perm = getArenaPermission(agentOwner);
    if (!perm) {
      return NextResponse.json({
        action: "BLOCKED",
        reason: "No arena permission registered server-side. Open the dashboard and save your autonomy settings.",
        room: { id: room.id, topic: room.topic, stake: room.stake, category: room.category, creatorAddress: room.creatorAddress },
        scanned: open.length,
        evaluated,
        timestamp: Date.now(),
      });
    }

    const battleId = keccak256(
      encodeAbiParameters(parseAbiParameters("bytes32,address,uint256"), [
        room.id as `0x${string}`,
        agentOwner,
        BigInt(Date.now()),
      ])
    ) as `0x${string}`;

    // Optimistic lock — prevents retry loops even on failure; avoids double-prefund
    actedRooms.add(room.id);

    try {
      // Step 1: prefund via 1Shot (ERC-7715 USDC transfer)
      const prefundResult = await acceptChallengeWith1Shot({
        permissionContext: {
          context: perm.context,
          delegationManager: perm.delegationManager,
          sessionAddress: perm.sessionAddress,
          walletAddress: agentOwner,
          chainId: perm.chainId,
        },
        agentOwner,
        roomId: room.id as `0x${string}`,
        battleId,
        bettingDuration: 300n,
        roundDuration: 120n,
        maxResearch: 1_000_000n,
        stakeWei: BigInt(Math.round(room.stake * 1_000_000)),
      });

      // Step 2: call acceptChallengeFor on-chain (platform key — changes room state)
      const actionTxHash = await acceptChallengeForOnChain({
        agentOwner,
        roomId: room.id as `0x${string}`,
        battleId,
        bettingDuration: 300n,
        roundDuration: 120n,
        maxResearch: 1_000_000n,
      });

      const txHash = (actionTxHash ?? prefundResult.txHash) as `0x${string}` | undefined;

      pushLoopEntry({
        id: `loop-${Date.now()}`,
        agentOwner,
        actionType: "ACCEPT_CHALLENGE",
        status: "success",
        txHash,
        roomId: room.id,
        topic: room.topic,
        stakeUsdc: room.stake,
        timestamp: Date.now(),
      });

      return NextResponse.json({
        action: "ACCEPTED",
        room: { id: room.id, topic: room.topic, stake: room.stake, category: room.category, creatorAddress: room.creatorAddress },
        battleId,
        txHash,
        scanned: open.length,
        evaluated,
        timestamp: Date.now(),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "1Shot execution failed";
      console.error(`[AgentLoop] ACCEPT_CHALLENGE failed room=${room.id.slice(0,10)}:`, reason);
      pushLoopEntry({ id: `loop-${Date.now()}`, agentOwner, actionType: "ACCEPT_CHALLENGE", status: "failed", reason, roomId: room.id, topic: room.topic, stakeUsdc: room.stake, timestamp: Date.now() });
      return NextResponse.json({
        action: "BLOCKED",
        reason,
        room: { id: room.id, topic: room.topic, stake: room.stake, category: room.category, creatorAddress: room.creatorAddress },
        scanned: open.length,
        evaluated,
        timestamp: Date.now(),
      });
    }
  }

  // ── 4b. No suitable challenge found — auto-create if enabled ─────────────
  if (prefs.autoCreateChallenges && todayCount < prefs.dailyBattleLimit) {
    const { topic, category } = await generateChallengeTopic(prefs.battleCategories);
    const topicHash = keccak256(encodeAbiParameters(parseAbiParameters("string"), [topic])) as `0x${string}`;
    const categoryHash = keccak256(encodeAbiParameters(parseAbiParameters("string"), [category])) as `0x${string}`;
    const roomId = keccak256(encodeAbiParameters(parseAbiParameters("address,uint256"), [agentOwner, BigInt(Date.now())])) as `0x${string}`;

    if (prefs.mode === "assisted") {
      return NextResponse.json({
        action: "RECOMMEND_ISSUE",
        reason: "No open challenges matched. Assisted mode — issue manually to confirm.",
        generatedTopic: topic,
        scanned: open.length,
        evaluated,
        timestamp: Date.now(),
      });
    }

    const perm = getArenaPermission(agentOwner);
    if (!perm) {
      return NextResponse.json({
        action: "BLOCKED",
        reason: "No arena permission registered. Open dashboard and save autonomy settings.",
        generatedTopic: topic,
        scanned: open.length,
        evaluated,
        timestamp: Date.now(),
      });
    }

    try {
      // Step 1: prefund via 1Shot (ERC-7715 USDC transfer)
      const prefundResult = await issueChallengeWith1Shot({
        permissionContext: {
          context: perm.context,
          delegationManager: perm.delegationManager,
          sessionAddress: perm.sessionAddress,
          walletAddress: agentOwner,
          chainId: perm.chainId,
        },
        agentOwner,
        roomId,
        topicHash,
        topicPreview: topic,
        categoryHash,
        stakeWei: BigInt(Math.round(prefs.maxArenaStakeUSDC * 1_000_000)),
      });

      // Step 2: call issueChallengeFor on-chain (platform key — creates the room)
      const actionTxHash = await issueChallengeForOnChain({
        agentOwner,
        roomId,
        topicHash,
        topicPreview: topic,
        categoryHash,
        stakeWei: BigInt(Math.round(prefs.maxArenaStakeUSDC * 1_000_000)),
      });

      const txHash = (actionTxHash ?? prefundResult.txHash) as `0x${string}` | undefined;
      pushLoopEntry({ id: `loop-${Date.now()}`, agentOwner, actionType: "ISSUE_CHALLENGE", status: "success", txHash, topic, stakeUsdc: prefs.maxArenaStakeUSDC, timestamp: Date.now() });

      return NextResponse.json({
        action: "ISSUED",
        generatedTopic: topic,
        txHash,
        scanned: open.length,
        evaluated,
        timestamp: Date.now(),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "1Shot issue failed";
      console.error(`[AgentLoop] ISSUE_CHALLENGE failed:`, reason);
      pushLoopEntry({ id: `loop-${Date.now()}`, agentOwner, actionType: "ISSUE_CHALLENGE", status: "failed", reason, topic, stakeUsdc: prefs.maxArenaStakeUSDC, timestamp: Date.now() });
      return NextResponse.json({ action: "BLOCKED", reason, generatedTopic: topic, scanned: open.length, evaluated, timestamp: Date.now() });
    }
  }

  // ── 5. Nothing to do ──────────────────────────────────────────────────────
  return NextResponse.json({
    action: "SKIPPED",
    reason: open.length === 0
      ? "No open challenges on-chain right now."
      : `${open.length} challenge(s) scanned — none matched your rules.`,
    scanned: open.length,
    evaluated,
    timestamp: Date.now(),
  });
}
