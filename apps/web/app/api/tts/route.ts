import { NextRequest } from "next/server";

// Venice AI TTS — OpenAI-compatible audio/speech endpoint
const VENICE_BASE_URL = process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1";
const VENICE_API_KEY  = process.env.VENICE_API_KEY ?? "";
const TTS_MODEL = process.env.VENICE_TTS_MODEL ?? "tts-kokoro";
const MAX_TTS_CHARS = Number(process.env.VENICE_TTS_MAX_CHARS ?? 2000);
const TTS_TIMEOUT_MS = Number(process.env.VENICE_TTS_TIMEOUT_MS ?? 30000);

const VALID_VOICES = new Set([
  "af_sky",
  "am_adam",
]);

export async function POST(req: NextRequest) {
  if (!VENICE_API_KEY) {
    return new Response("VENICE_API_KEY not configured", { status: 503 });
  }

  let payload: { text?: unknown; voice?: unknown };
  try {
    payload = await req.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  const voice = typeof payload.voice === "string" && VALID_VOICES.has(payload.voice)
    ? payload.voice
    : "af_sky";

  if (!text) {
    return new Response("text required", { status: 400 });
  }
  if (text.length > MAX_TTS_CHARS) {
    return new Response(`text too long, max ${MAX_TTS_CHARS} chars`, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${VENICE_BASE_URL}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VENICE_API_KEY}`,
      },
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      body: JSON.stringify({
        model: TTS_MODEL,
        input: text,
        voice,
        response_format: "mp3",
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[TTS] Venice request failed: ${message}`);
    return new Response("TTS upstream unavailable", { status: 502 });
  }

  if (!upstream.ok) {
    const msg = await upstream.text().catch(() => upstream.statusText);
    console.error(`[TTS] Venice upstream ${upstream.status}: ${msg}`);
    return new Response(`TTS upstream error: ${msg}`, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
