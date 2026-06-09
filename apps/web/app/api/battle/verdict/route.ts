import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { settleBattleWithVenice } from "@/lib/battle-settlement";

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

    const result = await settleBattleWithVenice(parsed.data.battleId as `0x${string}`);
    return NextResponse.json(result);
  } catch (err) {
    console.error("verdict error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("not found") ? 404 :
      message.includes("not ready") || message.includes("no debate transcript") ? 409 :
      message.includes("settlement failed") ? 502 :
      500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
