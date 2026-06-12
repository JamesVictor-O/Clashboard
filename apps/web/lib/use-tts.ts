"use client";

import { useEffect, useRef, useState } from "react";

const VOICE_A = "af_sky";
const VOICE_B = "am_adam";
const TTS_CHUNK_CHARS = 900;

function sanitizeForSpeech(text: string): string {
  return text
    .replace(/[*_`#~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLongSegment(segment: string): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const word of segment.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= TTS_CHUNK_CHARS) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);
    current = word;
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitIntoSpeechChunks(text: string): string[] {
  const cleaned = sanitizeForSpeech(text);
  if (!cleaned) return [];

  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences.map((part) => part.trim()).filter(Boolean)) {
    if (sentence.length > TTS_CHUNK_CHARS) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...splitLongSegment(sentence));
      continue;
    }

    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length <= TTS_CHUNK_CHARS) {
      current = next;
    } else {
      if (current) chunks.push(current);
      current = sentence;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

// ─── Audio prefetch cache ─────────────────────────────────────────────────────
// Keyed by stable debate turn ids such as `round2_agentA`. The cache is
// module-level (lives for the page session) and intentionally has no eviction —
// argument texts are short and a battle has at most a few prefetched turns.
type AudioCacheEntry = {
  status: "generating" | "ready" | "failed";
  audioUrl?: string;
  promise?: Promise<string>;
  error?: string;
};

const audioCache = new Map<string, AudioCacheEntry>();

async function generateTTS(text: string, voice: string): Promise<string> {
  const chunks = splitIntoSpeechChunks(text);
  if (chunks.length === 0) throw new Error("Cannot generate TTS for empty text");

  const blobs: Blob[] = [];
  for (const chunk of chunks) {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: chunk, voice }),
    });

    if (!res.ok) {
      const message = await res.text().catch(() => res.statusText);
      throw new Error(`TTS request failed (${res.status}): ${message}`);
    }

    blobs.push(await res.blob());
  }

  return URL.createObjectURL(new Blob(blobs, { type: "audio/mpeg" }));
}

/**
 * Pre-fetch TTS audio for a given text/side and store the blobs in the module
 * cache. Call this while the *previous* agent is still speaking so the next
 * agent's audio is ready to play the instant its turn arrives.
 *
 * Idempotent: if the key is already cached (or a fetch is in flight) this
 * returns immediately without a duplicate request.
 */
export async function prefetchTTS(turnKey: string, text: string, side: "A" | "B"): Promise<void> {
  if (audioCache.has(turnKey)) return;

  const voice = side === "A" ? VOICE_A : VOICE_B;
  const promise = generateTTS(text, voice);

  audioCache.set(turnKey, {
    status: "generating",
    promise,
  });

  try {
    const audioUrl = await promise;
    audioCache.set(turnKey, {
      status: "ready",
      audioUrl,
    });
  } catch (err) {
    audioCache.set(turnKey, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
    // Non-fatal — if prefetch fails useTTS will fetch on demand
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseTTSOptions {
  enabled: boolean;
  side: "A" | "B";
  turnKey?: string | null;
  /** Called when the audio finishes playing naturally (not when aborted by new text). */
  onDone?: () => void;
}

/**
 * Speaks the full `text` whenever it changes to a new non-empty value.
 *
 * If the blobs for `text` were pre-fetched via `prefetchTTS`, they are played
 * immediately from cache — no API round-trip latency. Otherwise falls back to
 * fetching on demand (previous behaviour).
 *
 * `onDone` is called only on natural completion or error — not on abort.
 */
export function useTTS(
  text: string,
  { enabled, side, turnKey, onDone }: UseTTSOptions
): { speaking: boolean } {
  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const lastRef     = useRef<string>("");
  const abortRef    = useRef<AbortController | null>(null);
  const onDoneRef   = useRef(onDone);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    const playbackKey = `${turnKey ?? side}::${text}`;
    if (!enabled || !text || playbackKey === lastRef.current) return;
    lastRef.current = playbackKey;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setSpeaking(false);

    const voice = side === "A" ? VOICE_A : VOICE_B;
    const chunks = splitIntoSpeechChunks(text);
    if (chunks.length === 0) {
      onDoneRef.current?.();
      return;
    }

    const playAudioUrl = (url: string, revokeWhenDone: boolean) => new Promise<void>((resolve) => {
      if (controller.signal.aborted) { resolve(); return; }

      const audio = new Audio(url);
      audio.volume = 0.82;
      audioRef.current = audio;

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        controller.signal.removeEventListener("abort", finish);
        if (revokeWhenDone) URL.revokeObjectURL(url);
        resolve();
      };

      controller.signal.addEventListener("abort", finish, { once: true });
      audio.addEventListener("ended", finish, { once: true });
      audio.addEventListener("error", finish, { once: true });
      audio.play().catch(finish);
    });

    (async () => {
      try {
        setSpeaking(true);

        const cached = turnKey ? audioCache.get(turnKey) : undefined;

        if (cached?.status === "ready" && cached.audioUrl) {
          // Play from cache — zero API latency.
          await playAudioUrl(cached.audioUrl, false);
        } else {
          if (cached?.status === "generating" && cached.promise) {
            try {
              const audioUrl = await cached.promise;
              if (controller.signal.aborted) return;
              await playAudioUrl(audioUrl, false);
              setSpeaking(false);
              onDoneRef.current?.();
              return;
            } catch {
              // Fall through to on-demand generation below.
            }
          }

          // Fetch on demand (first chunk starts playing as soon as it arrives)
          for (const chunk of chunks) {
            const res = await fetch("/api/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: chunk, voice }),
              signal: controller.signal,
            });

            if (controller.signal.aborted) return;

            if (!res.ok) {
              const message = await res.text().catch(() => res.statusText);
              console.warn(`[TTS] Request failed (${res.status}): ${message}`);
              break;
            }

            const blob = await res.blob();
            if (controller.signal.aborted) return;

            await playAudioUrl(URL.createObjectURL(blob), true);
            if (controller.signal.aborted) return;
          }
        }

        setSpeaking(false);
        onDoneRef.current?.();
      } catch {
        if (!controller.signal.aborted) {
          setSpeaking(false);
          onDoneRef.current?.();
        }
      }
    })();

    return () => { controller.abort(); };
  }, [text, enabled, side, turnKey]);

  useEffect(() => () => {
    abortRef.current?.abort();
    audioRef.current?.pause();
    setSpeaking(false);
  }, []);

  return { speaking };
}
