import OpenAI from "openai";
import { createParser, type ParseEvent } from "eventsource-parser";

// Venice AI is OpenAI-compatible — just point at their endpoint
export const VENICE_BASE_URL = "https://api.venice.ai/api/v1";
export const VENICE_MODEL = "llama-3.3-70b"; // Venice's flagship model

let _client: OpenAI | null = null;

export function getVeniceClient(): OpenAI {
  if (!_client) {
    if (!process.env.VENICE_API_KEY) {
      throw new Error("VENICE_API_KEY is not set");
    }
    _client = new OpenAI({
      apiKey: process.env.VENICE_API_KEY,
      baseURL: VENICE_BASE_URL,
    });
  }
  return _client;
}

// ─── Streaming Helper ─────────────────────────────────────────────────────────

/**
 * Stream a Venice AI completion, calling onToken for each text chunk.
 * Returns the full assembled text when done.
 */
export async function streamCompletion(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  onToken: (token: string) => void,
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<string> {
  const client = getVeniceClient();

  const stream = await client.chat.completions.create({
    model: options?.model ?? VENICE_MODEL,
    messages,
    stream: true,
    max_tokens: options?.maxTokens ?? 512,
    temperature: options?.temperature ?? 0.85,
  });

  let fullText = "";

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      fullText += delta;
      onToken(delta);
    }
  }

  return fullText;
}

/**
 * Non-streaming completion — returns full response text.
 */
export async function complete(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<string> {
  const client = getVeniceClient();

  const response = await client.chat.completions.create({
    model: options?.model ?? VENICE_MODEL,
    messages,
    stream: false,
    max_tokens: options?.maxTokens ?? 1024,
    temperature: options?.temperature ?? 0.7,
  });

  return response.choices[0]?.message?.content ?? "";
}

/**
 * Parse a raw SSE stream from a fetch response using eventsource-parser.
 * Useful when consuming Venice SSE directly without the SDK.
 */
export async function parseSSEStream(
  response: Response,
  onToken: (token: string) => void
): Promise<string> {
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  const parser = createParser((event: ParseEvent) => {
    if (event.type === "event" && event.data !== "[DONE]") {
      try {
        const json = JSON.parse(event.data);
        const token = json.choices?.[0]?.delta?.content ?? "";
        if (token) {
          fullText += token;
          onToken(token);
        }
      } catch {
        // Ignore parse errors on individual chunks
      }
    }
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }

  return fullText;
}
