import { NextRequest, NextResponse } from "next/server";
import { getBattleSnapshot } from "@/lib/battle-runtime";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ battleId: string }> }
) {
  const { battleId } = await params;

  try {
    const battle = await getBattleSnapshot(battleId as `0x${string}`);
    if (!battle) {
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    }
    return NextResponse.json(battle);
  } catch (err) {
    console.error("battle snapshot error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Battle lookup failed" },
      { status: 500 }
    );
  }
}
