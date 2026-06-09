import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prefetchNextRound } from "@/lib/battle-lifecycle";

const Schema = z.object({ battleId: z.string().min(1) });

/**
 * Fire-and-forget lookahead: pre-generate next-round arguments while the
 * current round's voices are playing on the client.
 *
 * The client POSTs here immediately after receiving a SUBMITTED_BOTH step
 * and does NOT await the HTTP response. The server awaits the full generation
 * so the serverless function stays alive long enough to finish and persist
 * results into the battle store.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "battleId required" }, { status: 400 });
    }
    await prefetchNextRound(parsed.data.battleId as `0x${string}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Non-fatal — the main step runner falls back to normal generation.
    console.warn("[prefetch-round] error:", err);
    return NextResponse.json({ ok: false });
  }
}
