import { ARENA_ABI, REGISTRY_ABI, buildRubricCommitment, commitRubricOnChain, getPublicClient } from "@/lib/chain";
import { battleStore, type StoredBattle } from "@/lib/battle-store";
import type { Agent, Battle, BattlePhase, PersonalityType } from "@/lib/types";

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
  `0x${string}`,
  bigint,
  `0x${string}`,
  string,
  `0x${string}`,
  boolean
];

function mapContractPhase(phase: number): BattlePhase {
  if (phase === 0) return "BETTING";
  if (phase === 1) return "ROUND_1";
  if (phase === 2) return "ROUND_2";
  if (phase === 3) return "ROUND_3";
  if (phase === 4) return "JUDGING_READY";
  return "SETTLED";
}

function deterministicRubricJson(battleId: string, topic: string) {
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
  const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT as `0x${string}`;

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
  const arenaAddress = process.env.NEXT_PUBLIC_ARENA_CONTRACT as `0x${string}`;

  const [battleData, phase] = await Promise.all([
    client.readContract({
      address: arenaAddress,
      abi: ARENA_ABI,
      functionName: "battles",
      args: [battleId],
    }) as Promise<unknown>,
    client.readContract({
      address: arenaAddress,
      abi: ARENA_ABI,
      functionName: "getBattlePhase",
      args: [battleId],
    }) as Promise<number>,
  ]);

  const tuple = battleData as BattleTuple;
  if (!tuple[1] || tuple[1].toLowerCase() === ZERO_ADDRESS) return null;
  return { tuple, phaseNum: Number(phase) };
}

export async function syncBattleRuntimeFromChain(battleId: `0x${string}`): Promise<StoredBattle | null> {
  const onChain = await readOnChainBattle(battleId);
  if (!onChain) return null;

  const existing = battleStore.get(battleId);
  const { tuple, phaseNum } = onChain;
  const topic = tuple[15];
  const rubricJson = deterministicRubricJson(battleId, topic);
  const { preimage: rubricPreimage, hash: deterministicRubricHash } =
    buildRubricCommitment(rubricJson);

  let rubricHash = tuple[12];
  const rubricCommitted = tuple[17];
  const isOpen = Number(tuple[0]) === 0;

  if (isOpen && !rubricCommitted) {
    try {
      await commitRubricOnChain({ battleId, rubricHash: deterministicRubricHash });
    } catch (err) {
      // Another request may have hydrated the same accepted battle first.
      // The rubric is deterministic, so a duplicate commit race can be ignored.
      console.warn("Rubric commit during battle hydration failed:", err);
    }
    rubricHash = deterministicRubricHash;
  }

  const [agentA, agentB] = await Promise.all([
    getAgentDisplay(tuple[1], "A"),
    getAgentDisplay(tuple[2], "B"),
  ]);

  const battle: Battle = {
    id: battleId,
    topic,
    agentA,
    agentB,
    state: isOpen ? "OPEN" : "SETTLED",
    poolA: tuple[5] + tuple[7],
    poolB: tuple[6] + tuple[8],
    bettingDeadline: tuple[9],
    roundDuration: Number(tuple[10]),
    totalRounds: Number(tuple[11]),
    rubricHash,
    winner: tuple[3].toLowerCase() === ZERO_ADDRESS ? null : tuple[3],
    bettorCount: 0,
    createdAt: Number(tuple[9] - 300n) * 1000,
  };

  const stored: StoredBattle = {
    battle,
    rubricPreimage: existing?.rubricPreimage ?? rubricPreimage,
    rounds: existing?.rounds ?? [],
    bets: existing?.bets ?? new Map(),
    phase: mapContractPhase(phaseNum),
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
    roundsCompleted: rounds.length,
    createdAt: battle.createdAt,
  };
}
