import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { battleStore } from "@/lib/battle-store";

const BetSchema = z.object({
  battleId: z.string().min(1),
  side: z.union([z.literal(1), z.literal(2)]),
  amount: z.number().positive(),
  bettorAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = BetSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { battleId, side, amount, bettorAddress } = parsed.data;

    const stored = battleStore.get(battleId);
    if (!stored) {
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    }

    if (stored.phase !== "BETTING") {
      return NextResponse.json(
        { error: "Betting is closed for this battle" },
        { status: 409 }
      );
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now >= stored.battle.bettingDeadline) {
      return NextResponse.json(
        { error: "Betting deadline has passed" },
        { status: 409 }
      );
    }

    if (stored.bets.has(bettorAddress)) {
      return NextResponse.json(
        { error: "Already placed a bet on this battle" },
        { status: 409 }
      );
    }

    const amountMicro = BigInt(Math.round(amount * 1_000_000));

    stored.bets.set(bettorAddress, { side, amount: amountMicro });

    if (side === 1) {
      stored.battle.poolA += amountMicro;
    } else {
      stored.battle.poolB += amountMicro;
    }
    stored.battle.bettorCount = (stored.battle.bettorCount ?? 0) + 1;

    return NextResponse.json({
      success: true,
      poolA: stored.battle.poolA.toString(),
      poolB: stored.battle.poolB.toString(),
      bettorCount: stored.battle.bettorCount,
    });
  } catch (err) {
    console.error("bet error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
