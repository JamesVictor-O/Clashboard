import OpenAI from "openai";
import { createParser, type ParseEvent } from "eventsource-parser";
import type {
  AgentConfig,
  AgentDecision,
  JudgeResult,
  ResearchArtifact,
} from "@/lib/types";

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

function parseJsonObject<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

function researchText(artifacts: ResearchArtifact[] = []): string {
  if (artifacts.length === 0) return "No purchased research yet.";
  return artifacts
    .map((artifact) => {
      return [
        `Artifact: ${artifact.id}`,
        `Category: ${artifact.category}`,
        `Summary: ${artifact.summary}`,
        `Facts: ${artifact.facts.join(" | ")}`,
        `Sources: ${artifact.sources.join(", ")}`,
      ].join("\n");
    })
    .join("\n\n");
}

export async function decideAgentAction(params: {
  fighterProfile: AgentConfig;
  topic: string;
  assignedSide?: "A" | "B";
  activePermission: unknown;
  remainingBudgetUSDC: string;
  researchAlreadyOwned?: ResearchArtifact[];
  availableResearchArtifacts?: ResearchArtifact[];
}): Promise<AgentDecision> {
  const raw = await complete(
    [
      {
        role: "system",
        content:
          "You are Venice AI deciding the next move for an autonomous Clashboard debate fighter. Output only valid JSON.",
      },
      {
        role: "user",
        content: JSON.stringify({
          allowedActions: ["ENTER_BATTLE", "BUY_RESEARCH", "BUY_AGENT_RESEARCH", "DEBATE_ROUND", "SKIP_ACTION"],
          fighterProfile: params.fighterProfile,
          topic: params.topic,
          assignedSide: params.assignedSide,
          remainingBudgetUSDC: params.remainingBudgetUSDC,
          activePermission: Boolean(params.activePermission),
          researchAlreadyOwned: params.researchAlreadyOwned ?? [],
          availableResearchArtifacts: params.availableResearchArtifacts ?? [],
          responseSchema: {
            action: "BUY_RESEARCH",
            reason: "short reason",
            category: "sports | music | tech | culture | crypto",
            maxSpendUSDC: "0.10",
          },
        }),
      },
    ],
    { temperature: 0.25, maxTokens: 360 }
  );

  return parseJsonObject<AgentDecision>(raw, {
    action: "SKIP_ACTION",
    reason: "Venice returned an unparseable decision.",
  });
}

export async function generateDebateArgument(params: {
  fighterProfile: AgentConfig;
  topic: string;
  assignedSide: "A" | "B";
  purchasedResearchArtifacts?: ResearchArtifact[];
  remainingBudgetUSDC?: string;
}): Promise<string> {
  return complete(
    [
      {
        role: "system",
        content:
          "You are a Clashboard AI debate fighter. Make a sharp, factual opening argument under 130 words. Use purchased research when useful.",
      },
      {
        role: "user",
        content: [
          `Fighter: ${params.fighterProfile.name}`,
          `Personality: ${params.fighterProfile.personality}`,
          `Style: ${params.fighterProfile.fightingStyle}`,
          `Custom instructions: ${params.fighterProfile.customInstructions ?? "none"}`,
          `Topic: ${params.topic}`,
          `Assigned side: ${params.assignedSide}`,
          `Remaining budget: ${params.remainingBudgetUSDC ?? "unknown"} testnet USDC`,
          `Research:\n${researchText(params.purchasedResearchArtifacts)}`,
        ].join("\n"),
      },
    ],
    { temperature: 0.8, maxTokens: 260 }
  );
}

export async function generateRebuttal(params: {
  fighterProfile: AgentConfig;
  topic: string;
  assignedSide: "A" | "B";
  opponentArgument: string;
  purchasedResearchArtifacts?: ResearchArtifact[];
  remainingBudgetUSDC?: string;
}): Promise<string> {
  return complete(
    [
      {
        role: "system",
        content:
          "You are a Clashboard AI debate fighter. Write a direct rebuttal under 130 words. Address the opponent's strongest claim first.",
      },
      {
        role: "user",
        content: [
          `Fighter: ${params.fighterProfile.name}`,
          `Personality: ${params.fighterProfile.personality}`,
          `Topic: ${params.topic}`,
          `Assigned side: ${params.assignedSide}`,
          `Opponent argument: ${params.opponentArgument}`,
          `Remaining budget: ${params.remainingBudgetUSDC ?? "unknown"} testnet USDC`,
          `Research:\n${researchText(params.purchasedResearchArtifacts)}`,
        ].join("\n"),
      },
    ],
    { temperature: 0.85, maxTokens: 260 }
  );
}

export async function judgeBattle(params: {
  topic: string;
  agentAName: string;
  agentBName: string;
  agentAArgument: string;
  agentBArgument: string;
}): Promise<JudgeResult> {
  const raw = await complete(
    [
      {
        role: "system",
        content:
          "You are an impartial Clashboard judge. Output only JSON: winner A/B, scores {accuracy,wit,rebuttal}, bestLine, reasoning, confidence.",
      },
      { role: "user", content: JSON.stringify(params) },
    ],
    { temperature: 0.2, maxTokens: 420 }
  );

  return parseJsonObject<JudgeResult>(raw, {
    winner: "A",
    scores: { accuracy: 50, wit: 50, rebuttal: 50 },
    bestLine: "No standout line identified.",
    reasoning: "Venice returned an unparseable judgment.",
    confidence: 0.5,
  });
}
