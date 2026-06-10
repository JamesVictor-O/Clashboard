import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import {
  createBattleOnChain,
  commitRubricOnChain,
  buildRubricCommitment,
} from "@/lib/chain";
import { battleStore } from "@/lib/battle-store";
import type { Battle } from "@/lib/types";

const StartBattleSchema = z.object({
  topic: z.string().min(1).max(280),
  agentAAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  agentBAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  bettingDurationSeconds: z.number().int().min(120).max(3600).default(300),
  roundDurationSeconds: z.number().int().min(30).max(600).default(60),
  totalRounds: z.union([z.literal(2), z.literal(3)]).default(2),
  categoryHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = StartBattleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      topic,
      agentAAddress,
      agentBAddress,
      bettingDurationSeconds,
      roundDurationSeconds,
      totalRounds,
      categoryHash,
    } = parsed.data;

    const battleId = `0x${uuidv4().replace(/-/g, "")}` as `0x${string}`;

    // Build the judge rubric JSON. This is revealed at settlement to prove
    // the scoring criteria weren't changed after the battle started.
    const rubricJson = JSON.stringify({
      topic,
      criteria: ["accuracy", "wit", "rebuttal"],
      weights: [0.4, 0.3, 0.3],
      timestamp: Date.now(),
      battleId,
    });

    // Two-step commitment: preimage = keccak(rubricJson), hash = keccak(preimage).
    // The contract verifies: keccak256(abi.encode(preimage)) == committed hash.
    const { preimage: rubricPreimage, hash: rubricHash } =
      buildRubricCommitment(rubricJson);

    const resolvedCategoryHash =
      (categoryHash as `0x${string}`) ??
      (keccak256(
        encodeAbiParameters(parseAbiParameters("string"), ["general"])
      ) as `0x${string}`);
    const topicHash = keccak256(
      encodeAbiParameters(parseAbiParameters("string"), [topic])
    ) as `0x${string}`;

    let txHash: string | null = null;
    let commitTxHash: string | null = null;

    try {
      txHash = await createBattleOnChain({
        battleId,
        agentA: agentAAddress as `0x${string}`,
        agentB: agentBAddress as `0x${string}`,
        entryFee: 0n,
        bettingDuration: BigInt(bettingDurationSeconds),
        roundDuration: BigInt(roundDurationSeconds),
        maxResearch: 500_000n, // $0.50 USDC research cap
        topicHash,
        topic,
        categoryHash: resolvedCategoryHash,
        totalRounds,
      });

      commitTxHash = await commitRubricOnChain({
        battleId,
        rubricHash,
      });
    } catch (chainErr) {
      console.error("Chain call failed (non-fatal in dev):", chainErr);
    }

    const battle: Battle = {
      id: battleId,
      topic,
      agentA: {
        address: agentAAddress,
        name: "Agent A",
        personality: "Analyst",
        color: "#FFB800",
        winRate: 0,
        totalBattles: 0,
      },
      agentB: {
        address: agentBAddress,
        name: "Agent B",
        personality: "Historian",
        color: "#1A3FBE",
        winRate: 0,
        totalBattles: 0,
      },
      state: "OPEN",
      poolA: 0n,
      poolB: 0n,
      bettingDeadline: BigInt(
        Math.floor(Date.now() / 1000) + bettingDurationSeconds
      ),
      roundDuration: roundDurationSeconds,
      totalRounds,
      rubricHash,
      winner: null,
      bettorCount: 0,
      createdAt: Date.now(),
    };

    // rubricPreimage (bytes32 hex) is stored for settlement verification
    battleStore.set(battleId, {
      battle,
      rubricPreimage,
      rounds: [],
      bets: new Map(),
      phase: "BETTING",
    });

    return NextResponse.json({
      battleId,
      rubricHash,
      txHash,
      commitTxHash,
      bettingDeadline: battle.bettingDeadline.toString(),
      roundDuration: roundDurationSeconds,
      totalRounds,
    });
  } catch (err) {
    console.error("battle/start error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
