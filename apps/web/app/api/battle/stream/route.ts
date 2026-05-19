import { NextRequest } from "next/server";
import { z } from "zod";
import { battleStore } from "@/lib/battle-store";
import { setupBattle, runResearchPhase, runDebateRound } from "@/lib/agents/orchestrator";

const StreamSchema = z.object({
  battleId: z.string().min(1),
  rounds: z.number().int().min(1).max(5).default(3),
});

/**
 * SSE endpoint — streams the full battle:
 *   1. Research phase (both agents gather data via x402)
 *   2. N debate rounds (alternating agent responses)
 *
 * Event types emitted:
 *   { type: "phase",    data: "RESEARCH" | "DEBATE" | "DONE" }
 *   { type: "research", data: ResearchPurchase }
 *   { type: "token",    data: { agent: "A"|"B", text: string } }
 *   { type: "round",    data: Round }
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

  const { battleId, rounds } = parsed.data;
  const stored = battleStore.get(battleId);

  if (!stored) {
    return new Response("Battle not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) => {
        const payload = `data: ${JSON.stringify({ type, data })}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      try {
        // Phase: RESEARCH
        send("phase", "RESEARCH");
        stored.phase = "RESEARCH";

        const { agentAConfig, agentBConfig } = await setupBattle(stored.battle);

        await runResearchPhase(
          stored.battle,
          agentAConfig,
          agentBConfig,
          (purchase) => {
            stored.battle.researchPurchases = [
              ...(stored.battle.researchPurchases ?? []),
              purchase,
            ];
            send("research", purchase);
          }
        );

        // Phase: DEBATE
        send("phase", "DEBATE");
        stored.phase = "LIVE";

        for (let i = 0; i < rounds; i++) {
          // Agent A argues
          let agentAText = "";
          await runDebateRound(
            stored.battle,
            agentAConfig,
            "A",
            stored.rounds,
            (token) => {
              agentAText += token;
              send("token", { agent: "A", text: token });
            }
          );

          // Agent B rebuts
          let agentBText = "";
          await runDebateRound(
            stored.battle,
            agentBConfig,
            "B",
            stored.rounds,
            (token) => {
              agentBText += token;
              send("token", { agent: "B", text: token });
            }
          );

          const round = {
            index: i,
            agentAText,
            agentBText,
            timestamp: Date.now(),
          };
          stored.rounds.push(round);
          send("round", round);
        }

        send("phase", "DONE");
        stored.phase = "VERDICT";
      } catch (err) {
        console.error("Stream error:", err);
        send("error", err instanceof Error ? err.message : "Stream failed");
      } finally {
        controller.close();
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
