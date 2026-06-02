import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureBattleRuntime } from "@/lib/battle-runtime";
import { runJudge } from "@/lib/agents/judge";
import { settleBattleOnChain } from "@/lib/chain";

const VerdictSchema = z.object({
  battleId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = VerdictSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { battleId } = parsed.data;
    const stored = await ensureBattleRuntime(battleId as `0x${string}`);

    if (!stored) {
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    }

    if (stored.phase !== "JUDGING_READY" && stored.phase !== "VERDICT") {
      return NextResponse.json(
        { error: "Battle not ready for verdict" },
        { status: 409 }
      );
    }

    // Run AI judge
    const judgeResult = await runJudge(stored.battle, stored.rounds);

    // Settle on-chain — payouts are distributed by the contract.
    // rubricPreimage is the bytes32 stored at battle creation time.
    let settleTxHash: string | null = null;
    try {
      settleTxHash = await settleBattleOnChain({
        battleId: battleId as `0x${string}`,
        winnerSide: judgeResult.winner === "A" ? 1 : 2,
        rubricPreimage: stored.rubricPreimage as `0x${string}`,
        judgeScore: BigInt(
          Math.round(
            (judgeResult.scores.accuracy * 40 +
              judgeResult.scores.wit * 30 +
              judgeResult.scores.rebuttal * 30) / 100
          )
        ),
      });
    } catch (chainErr) {
      console.error("Chain settle failed:", chainErr);
    }

    // Update stored state
    stored.phase = "SETTLED";
    stored.battle.state = "SETTLED";
    stored.battle.winner =
      judgeResult.winner === "A"
        ? stored.battle.agentA.address
        : stored.battle.agentB.address;

    return NextResponse.json({
      judgeResult,
      settleTxHash,
      winner: stored.battle.winner,
      winnerSide: judgeResult.winner,
    });
  } catch (err) {
    console.error("verdict error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
