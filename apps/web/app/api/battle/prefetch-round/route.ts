import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prefetchDebateTurn } from "@/lib/battle-lifecycle";

const Schema = z.object({
  battleId: z.string().min(1),
  roundIndex: z.number().int().min(0).optional(),
  side: z.enum(["A", "B"]).optional(),
});

/**
 * Fire-and-forget lookahead: pre-generate the next debate turn while the
 * opposing agent's voice is playing on the client.
 *
 * The client does not await this response. The server awaits the generation so
 * the serverless function stays alive long enough to persist the turn state.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success || parsed.data.roundIndex === undefined || !parsed.data.side) {
      return NextResponse.json({ error: "battleId, roundIndex, and side required" }, { status: 400 });
    }
    const turn = await prefetchDebateTurn(parsed.data.battleId as `0x${string}`, {
      roundIndex: parsed.data.roundIndex,
      side: parsed.data.side,
    });
    return NextResponse.json({ ok: true, turn });
  } catch (err) {
    // Non-fatal — the main step runner falls back to normal generation.
    console.warn("[prefetch-round] error:", err);
    return NextResponse.json({ ok: false });
  }
}
