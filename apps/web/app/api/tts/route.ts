import { NextRequest } from "next/server";

// Venice AI TTS — OpenAI-compatible audio/speech endpoint
const VENICE_BASE_URL = process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1";
const VENICE_API_KEY  = process.env.VENICE_API_KEY ?? "";

export async function POST(req: NextRequest) {
  if (!VENICE_API_KEY) {
    return new Response("VENICE_API_KEY not configured", { status: 503 });
  }

  const { text, voice = "af_sky" } = await req.json() as { text: string; voice?: string };

  if (!text || text.length > 500) {
    return new Response("text required, max 500 chars", { status: 400 });
  }

  const upstream = await fetch(`${VENICE_BASE_URL}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VENICE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "tts-kokoro",
      input: text,
      voice,
      response_format: "mp3",
    }),
  });

  if (!upstream.ok) {
    const msg = await upstream.text().catch(() => upstream.statusText);
    return new Response(`TTS upstream error: ${msg}`, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
