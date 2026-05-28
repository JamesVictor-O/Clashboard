import { NextRequest, NextResponse } from "next/server";
import { battleStore } from "@/lib/battle-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ battleId: string }> }
) {
  const { battleId } = await params;
  const stored = battleStore.get(battleId);

  if (!stored) {
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
