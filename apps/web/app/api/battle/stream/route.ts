import { NextRequest } from "next/server";
import { z } from "zod";
import { runBattleLifecycle } from "@/lib/battle-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const StreamSchema = z.object({
  battleId: z.string().min(1),
  rounds: z.number().int().min(1).max(3).default(2),
});

/**
 * SSE endpoint — streams the full battle:
 *   1. Research phase (both agents gather data via x402)
 *   2. startDebate() once research and generation are ready
 *   3. N debate rounds, each advanced only after hashes are submitted
 *
 * Event types emitted:
 *   { type: "phase",    data: "RESEARCH" | "DEBATE" | "DONE" }
 *   { type: "round_start", data: { round: number, totalRounds: number } }
 *   { type: "turn",     data: { agent: "A"|"B", round: number } }
 *   { type: "research", data: ResearchPurchase }
 *   { type: "token",    data: { agent: "A"|"B", text: string } }
 *   { type: "round",    data: Round & { txA?: string; txB?: string } }
 *   { type: "error",    data: string }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = StreamSchema.safeParse({
    battleId: searchParams.get("battleId"),
    rounds: Number(searchParams.get("rounds") ?? 3),
  });

  if (!parsed.success) {
    return new Response("Invalid params", { status: 400 });
  }

  const { battleId } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (type: string, data: unknown) => {
        if (closed) return;
        const payload = `data: ${JSON.stringify({ type, data })}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          closed = true;
        }
      };

      try {
        await runBattleLifecycle(battleId as `0x${string}`, {
          rounds: parsed.data.rounds,
          onEvent: (event) => send(event.type, event.data),
        });
      } catch (err) {
        console.error("Stream error:", err);
        send("error", err instanceof Error ? err.message : "Stream failed");
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {}
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
