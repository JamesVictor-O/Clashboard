import { NextRequest, NextResponse } from "next/server";
import { battleStore } from "@/lib/battle-store";
import { ARENA_ABI, REGISTRY_ABI, getPublicClient } from "@/lib/chain";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function mapContractPhase(phase: number) {
  // ClashboardArena.BattlePhase:
  // 0 BETTING, 1 ROUND_1, 2 ROUND_2, 3 ROUND_3, 4 JUDGING_READY, 5 SETTLED, 6 CANCELLED
  if (phase === 0) return "BETTING";
  if (phase >= 1 && phase <= 3) return "LIVE";
  if (phase === 4) return "VERDICT";
  return "SETTLED";
}

async function getAgentDisplay(agentAddress: `0x${string}`, fallback: "A" | "B") {
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
    const losses = Number(rep?.losses ?? 0n);
    const totalBattles = Number(rep?.totalBattles ?? 0n);

    return {
      address: agentAddress,
      name: agent?.exists && agent.name ? agent.name : `Agent ${fallback}`,
      personality: fallback === "A" ? "Analyst" : "Historian",
      color: fallback === "A" ? "#FFB800" : "#1A3FBE",
      winRate: totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0,
      totalBattles: totalBattles || wins + losses,
    };
  } catch {
    return {
      address: agentAddress,
      name: `Agent ${fallback}`,
      personality: fallback === "A" ? "Analyst" : "Historian",
      color: fallback === "A" ? "#FFB800" : "#1A3FBE",
      winRate: 0,
      totalBattles: 0,
    };
  }
}

async function getOnChainBattle(battleId: `0x${string}`) {
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

  const battle = battleData as readonly [
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

  if (!battle[1] || battle[1].toLowerCase() === ZERO_ADDRESS) return null;

  const [agentA, agentB] = await Promise.all([
    getAgentDisplay(battle[1], "A"),
    getAgentDisplay(battle[2], "B"),
  ]);

  const state = Number(battle[0]) === 0 ? "OPEN" : "SETTLED";
  const poolA = battle[5] + battle[7];
  const poolB = battle[6] + battle[8];

  return {
    id: battleId,
    topic: battle[15],
    agentA,
    agentB,
    state,
    phase: mapContractPhase(Number(phase)),
    poolA: poolA.toString(),
    poolB: poolB.toString(),
    bettingDeadline: battle[9].toString(),
    roundDuration: Number(battle[10]),
    roundsCompleted: Math.min(Math.max(Number(phase), 0), Number(battle[11])),
    createdAt: Number(battle[9] - 180n) * 1000,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ battleId: string }> }
) {
  const { battleId } = await params;
  const stored = battleStore.get(battleId);

  if (!stored) {
    try {
      const battle = await getOnChainBattle(battleId as `0x${string}`);
      if (battle) return NextResponse.json(battle);
    } catch (err) {
      console.error("battle/on-chain fallback error:", err);
    }

    return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  }

  const { battle, phase, rounds } = stored;

  return NextResponse.json({
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
    roundsCompleted: rounds.length,
    createdAt: battle.createdAt,
  });
}
