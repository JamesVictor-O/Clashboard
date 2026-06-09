import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processBattleStep } from "@/lib/battle-lifecycle";

const WorkerSchema = z.object({
  battleId: z.string().min(1),
});

function isAuthorized(req: NextRequest) {
  const secret = process.env.BATTLE_WORKER_SECRET;
  if (!secret) return true;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const header = req.headers.get("x-battle-worker-secret");
  return bearer === secret || header === secret;
}

/**
 * Durable worker entrypoint.
 *
 * This route is intentionally browser-independent: a cron job, queue consumer,
 * or admin script can POST a battleId here and drive the same lifecycle used by
 * the live SSE arena. For production, put this behind a persistent queue and
 * replace battleStore with Redis/Postgres so transcripts survive process restarts.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = WorkerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const battleId = parsed.data.battleId as `0x${string}`;
    const step = await processBattleStep(battleId, {
      onEvent: (event) => {
        if (event.type === "error") {
          console.error("battle worker event:", event.data);
        }
      },
    });

    return NextResponse.json({ step });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Worker failed";
    const status =
      message.includes("not found") ? 404 :
      message.includes("Step already in progress") ? 409 :
      message.includes("still in betting") || message.includes("not ready") ? 409 :
      500;
    if (status === 500) {
      console.error("battle worker error:", err);
    } else if (message.includes("Step already in progress")) {
      console.log("battle worker busy:", message);
    }
    return NextResponse.json({ error: message }, { status });
  }
}
