import { runJudge } from "@/lib/agents/judge";
import { ensureBattleRuntime } from "@/lib/battle-runtime";
import { settleBattleOnChain } from "@/lib/chain";

export interface BattleSettlementResult {
  judgeResult: Awaited<ReturnType<typeof runJudge>>;
  settleTxHash: string;
  winner: string;
  winnerSide: "A" | "B";
}

export async function settleBattleWithVenice(
  battleId: `0x${string}`
): Promise<BattleSettlementResult> {
  const stored = await ensureBattleRuntime(battleId);
  if (!stored) throw new Error("Battle not found");

  if (stored.phase !== "JUDGING_READY" && stored.phase !== "VERDICT") {
    throw new Error("Battle not ready for verdict");
  }

  if (stored.rounds.length === 0) {
    throw new Error(
      "Battle has no debate transcript yet. Funds remain locked until Venice debate is retried or the battle is cancelled on-chain."
    );
  }

  const judgeResult = await runJudge(stored.battle, stored.rounds);

  if (judgeResult.winner !== "A" && judgeResult.winner !== "B") {
    throw new Error(`Invalid Venice judge winner: "${judgeResult.winner}"`);
  }

  const settleTxHash = await settleBattleOnChain({
    battleId,
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

  stored.phase = "SETTLED";
  stored.battle.state = "SETTLED";
  stored.battle.winner =
    judgeResult.winner === "A"
      ? stored.battle.agentA.address
      : stored.battle.agentB.address;

  return {
    judgeResult,
    settleTxHash,
    winner: stored.battle.winner,
    winnerSide: judgeResult.winner,
  };
}
