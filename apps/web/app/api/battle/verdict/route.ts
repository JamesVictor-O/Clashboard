import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { battleStore } from "@/lib/battle-store";
import { runJudge } from "@/lib/agents/judge";
import { settleBattleOnChain } from "@/lib/chain";
import { payVia1Shot } from "@/lib/payments/oneshot";

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
    const stored = battleStore.get(battleId);

    if (!stored) {
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    }

    if (stored.phase !== "VERDICT") {
      return NextResponse.json(
        { error: "Battle not ready for verdict" },
        { status: 409 }
      );
    }

    // Run AI judge
    const judgeResult = await runJudge(stored.battle, stored.rounds);

    // Settle on-chain
    let settleTxHash: string | null = null;
    try {
      settleTxHash = await settleBattleOnChain({
        battleId: battleId as `0x${string}`,
        winnerSide: judgeResult.winner === "A" ? 1 : 2,
        rubricPreimage: stored.rubricPreimage,
        judgeScore: BigInt(
          Math.round(
            (judgeResult.scores.accuracy +
              judgeResult.scores.wit +
              judgeResult.scores.rebuttal) /
              3
          )
        ),
      });
    } catch (chainErr) {
      console.error("Chain settle failed:", chainErr);
    }

    // Trigger 1Shot payouts for winning bettors
    const winnerSide = judgeResult.winner === "A" ? 1 : 2;
    const winningBets = Array.from(stored.bets.entries()).filter(
      ([, bet]) => bet.side === winnerSide
    );

    const payoutResults = await Promise.allSettled(
      winningBets.map(([bettor, bet]) =>
        payVia1Shot({
          recipient: bettor,
          amount: bet.amount,
          battleId,
          reason: "battle_payout",
        })
      )
    );

    const payoutTxHashes = payoutResults
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<string>).value);

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
      payoutTxHashes,
      winner: stored.battle.winner,
    });
  } catch (err) {
    console.error("verdict error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
