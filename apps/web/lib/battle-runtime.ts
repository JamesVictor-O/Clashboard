import {
  ARENA_ABI,
  REGISTRY_ABI,
  buildRubricCommitment,
  getPublicClient,
} from "@/lib/chain";
import { battleStore, type StoredBattle } from "@/lib/battle-store";
import { researchStore } from "@/lib/research-store";
import type { Agent, Battle, BattlePhase, PersonalityType } from "@/lib/types";
import { ARENA_CONTRACT, REGISTRY_CONTRACT } from "@/lib/contracts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type BattleTuple = readonly [
  number,
  `0x${string}`,
  `0x${string}`,
  `0x${string}`,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  number,
  number,
  number,
  bigint,
  bigint,
  bigint,
  bigint,
  `0x${string}`,
  bigint,
  `0x${string}`,
  string,
  `0x${string}`,
  boolean
];

function mapContractPhase(phase: number): BattlePhase {
  if (phase === 0) return "BETTING";
  if (phase === 1) return "PREPARING";
  if (phase === 2) return "ROUND_1";
  if (phase === 3) return "ROUND_2";
  if (phase === 4) return "ROUND_3";
  if (phase === 5) return "JUDGING_READY";
  if (phase === 6) return "SETTLED";
  if (phase === 7) return "CANCELLED";
  if (phase === 8) return "EXPIRED";
  return "SETTLED";
}

function mapContractState(state: number): Battle["state"] {
  if (state === 0) return "OPEN";
  if (state === 1) return "SETTLED";
  return "CANCELLED";
}

export function deterministicRubricJson(battleId: string, topic: string) {
  return JSON.stringify({
    battleId,
    topic,
    judge: "Venice AI",
    criteria: ["accuracy", "wit", "rebuttal"],
    weights: [0.4, 0.3, 0.3],
    version: "clashboard-hackathon-v1",
  });
}

async function getAgentDisplay(agentAddress: `0x${string}`, fallback: "A" | "B"): Promise<Agent> {
  const client = getPublicClient();
  const registryAddress = REGISTRY_CONTRACT;

  try {
    const [agent, rep] = (await client.readContract({
      address: registryAddress,
      abi: REGISTRY_ABI,
      functionName: "getAgent",
      args: [agentAddress],
    })) as unknown as [
      { name: string; exists: boolean },
      { wins: bigint; losses: bigint; totalBattles: bigint }
    ];

    const wins = Number(rep?.wins ?? 0n);
    const totalBattles = Number(rep?.totalBattles ?? 0n);

    return {
      address: agentAddress,
      name: agent?.exists && agent.name ? agent.name : `Agent ${fallback}`,
      personality: (fallback === "A" ? "Analyst" : "Historian") as PersonalityType,
      color: fallback === "A" ? "#FFB800" : "#1A3FBE",
      winRate: totalBattles > 0 ? wins / totalBattles : 0,
      totalBattles,
    };
  } catch {
    return {
      address: agentAddress,
      name: `Agent ${fallback}`,
      personality: (fallback === "A" ? "Analyst" : "Historian") as PersonalityType,
      color: fallback === "A" ? "#FFB800" : "#1A3FBE",
      winRate: 0,
      totalBattles: 0,
    };
  }
}

async function readOnChainBattle(battleId: `0x${string}`): Promise<{
  tuple: BattleTuple;
  phaseNum: number;
} | null> {
  const client = getPublicClient();
  const arenaAddress = ARENA_CONTRACT;

  try {
    const battleData = (await client.readContract({
      address: arenaAddress,
      abi: ARENA_ABI,
      functionName: "battles",
      args: [battleId],
    })) as unknown;

    const tuple = battleData as BattleTuple;
    if (!tuple[1] || tuple[1].toLowerCase() === ZERO_ADDRESS) return null;

    const phase = (await client.readContract({
      address: arenaAddress,
      abi: ARENA_ABI,
      functionName: "getBattlePhase",
      args: [battleId],
    })) as number;

    return { tuple, phaseNum: Number(phase) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Battle not found")) return null;
    throw err;
  }
}

export async function syncBattleRuntimeFromChain(battleId: `0x${string}`): Promise<StoredBattle | null> {
  const onChain = await readOnChainBattle(battleId);
  if (!onChain) return null;

  const existing = battleStore.get(battleId);
  const { tuple, phaseNum } = onChain;
  const topic = tuple[21];
  const rubricJson = deterministicRubricJson(battleId, topic);
  const { preimage: rubricPreimage, hash: deterministicRubricHash } =
    buildRubricCommitment(rubricJson);

  const rubricHash = tuple[23] ? tuple[18] : deterministicRubricHash;
  const stateNum = Number(tuple[0]);

  const [agentA, agentB] = await Promise.all([
    getAgentDisplay(tuple[1], "A"),
    getAgentDisplay(tuple[2], "B"),
  ]);

  const battle: Battle = {
    id: battleId,
    topic,
    agentA,
    agentB,
    state: mapContractState(stateNum),
    poolA: tuple[5] + tuple[7],
    poolB: tuple[6] + tuple[8],
    bettingDeadline: tuple[9],
    roundDuration: Number(tuple[10]),
    totalRounds: Number(tuple[11]),
    currentRound: Number(tuple[13] ?? 0),
    debateStartedAt: tuple[14],
    currentRoundDeadline: tuple[16],
    prepareDeadline: tuple[17],
    rubricHash,
    winner: tuple[3].toLowerCase() === ZERO_ADDRESS ? null : tuple[3],
    bettorCount: 0,
    createdAt: Number(tuple[9] - 300n) * 1000,
  };

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  let phase = mapContractPhase(phaseNum);
  if (phase === "BETTING" && nowSec >= battle.bettingDeadline) {
    phase = "PREPARING";
  }

  const existingRounds = existing?.rounds ?? [];
  const completedRoundCount =
    phase === "ROUND_2" ? 1 :
    phase === "ROUND_3" ? 2 :
    phase === "JUDGING_READY" || phase === "SETTLED" ? Number(battle.totalRounds ?? 2) :
    0;
  const restoredRounds =
    existingRounds.length >= completedRoundCount
      ? existingRounds
      : [
          ...existingRounds,
          ...Array.from({ length: completedRoundCount - existingRounds.length }, (_, index) => {
            const roundNumber = existingRounds.length + index + 1;
            return {
              index: roundNumber - 1,
              agentAText: `Round ${roundNumber} argument was already submitted on-chain before this runtime loaded.`,
              agentBText: `Round ${roundNumber} argument was already submitted on-chain before this runtime loaded.`,
              timestamp: Date.now(),
            };
          }),
        ];

  const stored: StoredBattle = {
    battle,
    rubricPreimage: existing?.rubricPreimage ?? rubricPreimage,
    rounds: restoredRounds,
    bets: existing?.bets ?? new Map(),
    phase,
    // Preserve step-runner state — these are never on-chain, only in-process.
    // Dropping them on every chain sync wipes pendingRound and causes _runStep
    // to re-generate arguments that were already submitted.
    researchContextA: existing?.researchContextA,
    researchContextB: existing?.researchContextB,
    pendingRound: existing?.pendingRound,
  };

  battleStore.set(battleId, stored);
  return stored;
}

export async function ensureBattleRuntime(battleId: `0x${string}`): Promise<StoredBattle | null> {
  return syncBattleRuntimeFromChain(battleId);
}

export async function getBattleSnapshot(battleId: `0x${string}`) {
  const stored = await syncBattleRuntimeFromChain(battleId);
  if (!stored) return null;

  const { battle, phase, rounds } = stored;
  const purchaseMap = new Map(
    [
      ...(battle.researchPurchases ?? []),
      ...researchStore.listBattlePurchases(battleId),
    ].map((purchase) => [purchase.id, purchase])
  );

  return {
    id: battle.id,
    topic: battle.topic,
    agentA: battle.agentA,
    agentB: battle.agentB,
    state: battle.state,
    phase,
    poolA: battle.poolA.toString(),
    poolB: battle.poolB.toString(),
    bettingDeadline: battle.bettingDeadline.toString(),
    roundDuration: battle.roundDuration,
    totalRounds: battle.totalRounds ?? 2,
    currentRound: battle.currentRound ?? 0,
    currentRoundDeadline: battle.currentRoundDeadline?.toString(),
    prepareDeadline: battle.prepareDeadline?.toString(),
    roundsCompleted: rounds.length,
    rounds: rounds.map((r) => ({
      index: r.index,
      agentAText: r.agentAText,
      agentBText: r.agentBText,
      timestamp: r.timestamp,
    })),
    researchPurchases: Array.from(purchaseMap.values()),
    createdAt: battle.createdAt,
  };
}
