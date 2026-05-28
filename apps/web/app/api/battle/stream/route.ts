import { NextRequest } from "next/server";
import { z } from "zod";
import { battleStore } from "@/lib/battle-store";
import { setupBattle, runResearchPhase, runDebateRound } from "@/lib/agents/orchestrator";
import { submitArgumentOnChain, argContentHash } from "@/lib/chain";

const StreamSchema = z.object({
  battleId: z.string().min(1),
  rounds: z.number().int().min(1).max(5).default(3),
});

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * SSE endpoint — streams the full battle:
 *   1. Research phase (both agents gather data via x402)
 *   2. N debate rounds, each timed to its on-chain window
 *   3. Submits both arguments on-chain after each round
 *
 * Event types emitted:
 *   { type: "phase",    data: "RESEARCH" | "DEBATE" | "DONE" }
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

        const bettingDeadline = Number(stored.battle.bettingDeadline); // unix seconds
        const roundDuration = stored.battle.roundDuration;             // seconds

        // Wait for the betting window to close before starting round 1
        const nowSec = () => Date.now() / 1000;
        const waitUntil = async (targetSec: number) => {
          const ms = (targetSec - nowSec()) * 1000;
          if (ms > 500) await sleep(ms);
        };

        for (let i = 0; i < rounds; i++) {
          const roundStart = bettingDeadline + i * roundDuration;
          const roundEnd   = roundStart + roundDuration;

          // Wait until this round's window opens (adds 200ms buffer for block lag)
          await waitUntil(roundStart + 0.2);

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

          // Submit both arguments on-chain while the round window is still active.
          // If we're past the window (generation ran long), the contract will revert —
          // we log and continue so the frontend still gets the debate text.
          let txA: string | undefined;
          let txB: string | undefined;

          if (nowSec() < roundEnd) {
            try {
              txA = await submitArgumentOnChain({
                battleId: battleId as `0x${string}`,
                side: 1,
                contentHash: argContentHash(agentAText),
              });
              txB = await submitArgumentOnChain({
                battleId: battleId as `0x${string}`,
                side: 2,
                contentHash: argContentHash(agentBText),
              });
            } catch (chainErr) {
              console.error(`submitArgument round ${i + 1} failed:`, chainErr);
            }
          } else {
            console.warn(`Round ${i + 1} window expired before on-chain submission`);
          }

          const round = {
            index: i,
            agentAText,
            agentBText,
            timestamp: Date.now(),
            txA,
            txB,
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
