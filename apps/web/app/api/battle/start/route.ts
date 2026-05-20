import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";
import { createBattleOnChain } from "@/lib/chain";
import { battleStore } from "@/lib/battle-store";
import type { Battle } from "@/lib/types";

const StartBattleSchema = z.object({
  topic: z.string().min(1).max(280),
  agentAAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  agentBAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  bettingDurationSeconds: z.number().int().min(60).max(3600).default(300),
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

    const { topic, agentAAddress, agentBAddress, bettingDurationSeconds } =
      parsed.data;

    // Generate battle ID
    const battleId = `0x${uuidv4().replace(/-/g, "")}` as `0x${string}`;

    // Build rubric — the judge criteria committed before the battle starts
    // This prevents the platform from changing scoring criteria post-hoc
    const rubricPreimage = JSON.stringify({
      topic,
      criteria: ["accuracy", "wit", "rebuttal"],
      weights: [0.4, 0.3, 0.3],
      timestamp: Date.now(),
      battleId,
    });

    const rubricHash = keccak256(
      encodeAbiParameters(parseAbiParameters("string"), [rubricPreimage])
    );

    // Commit to chain
    let txHash: string | null = null;
    try {
      txHash = await createBattleOnChain({
        battleId: battleId as `0x${string}`,
        agentA: agentAAddress as `0x${string}`,
        agentB: agentBAddress as `0x${string}`,
        bettingDuration: BigInt(bettingDurationSeconds),
        rubricHash: rubricHash as `0x${string}`,
      });
    } catch (chainErr) {
      console.error("Chain commit failed (non-fatal in dev):", chainErr);
    }

    // Store in memory
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
      rubricHash,
      winner: null,
      bettorCount: 0,
      createdAt: Date.now(),
    };

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
      bettingDeadline: battle.bettingDeadline.toString(),
    });
  } catch (err) {
    console.error("battle/start error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
