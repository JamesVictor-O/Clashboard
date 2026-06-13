import OpenAI from "openai";
import { createParser, type ParseEvent } from "eventsource-parser";
import type {
  AgentConfig,
  AgentDecision,
  ResearchArtifact,
} from "@/lib/types";

// Venice AI is OpenAI-compatible. Keep every runtime knob in env so the
// arena can swap models without code changes during judging/demo day.
export const DEFAULT_VENICE_BASE_URL = "https://api.venice.ai/api/v1";
export const DEFAULT_VENICE_MODEL = "deepseek-v4-flash";

export type VeniceModelPurpose = "decision" | "debate" | "judge" | "research";

export interface VeniceRuntimeConfig {
  apiKeyConfigured: boolean;
  baseURL: string;
  model: string;
  decisionModel: string;
  debateModel: string;
  judgeModel: string;
  researchModel: string;
  timeoutMs: number;
  maxRetries: number;
}

function intFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getVeniceConfig(): VeniceRuntimeConfig {
  const model = process.env.VENICE_MODEL ?? DEFAULT_VENICE_MODEL;
  return {
    apiKeyConfigured: Boolean(getVeniceApiKey()),
    baseURL: process.env.VENICE_BASE_URL ?? DEFAULT_VENICE_BASE_URL,
    model,
    decisionModel: process.env.VENICE_DECISION_MODEL ?? model,
    debateModel: process.env.VENICE_DEBATE_MODEL ?? model,
    judgeModel: process.env.VENICE_JUDGE_MODEL ?? model,
    researchModel: process.env.VENICE_RESEARCH_MODEL ?? model,
    timeoutMs: intFromEnv("VENICE_TIMEOUT_MS", 120_000),
    maxRetries: intFromEnv("VENICE_MAX_RETRIES", 2),
  };
}

export function getVeniceApiKey(): string {
  return process.env.VENICE_API_KEY ?? process.env.VENICE_ADMIN_KEY ?? "";
}

export function getVeniceModel(purpose?: VeniceModelPurpose): string {
  const config = getVeniceConfig();
  if (purpose === "decision") return config.decisionModel;
  if (purpose === "debate") return config.debateModel;
  if (purpose === "judge") return config.judgeModel;
  if (purpose === "research") return config.researchModel;
  return config.model;
}

let _client: OpenAI | null = null;
let _clientKey: string | null = null;

export function getVeniceClient(): OpenAI {
  const config = getVeniceConfig();
  const apiKey = getVeniceApiKey();
  if (!apiKey) {
    throw new Error("VENICE_API_KEY or VENICE_ADMIN_KEY is not set");
  }

  const clientKey = [config.baseURL, config.timeoutMs, config.maxRetries].join(":");

  if (!_client || _clientKey !== clientKey) {
    _client = new OpenAI({
      apiKey,
      baseURL: config.baseURL,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries,
    });
    _clientKey = clientKey;
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
    model: options?.model ?? getVeniceModel("debate"),
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
    model: options?.model ?? getVeniceModel("debate"),
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

// ─── Internal Helpers ─────────────────────────────────────────────────────────

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
    .map((a) =>
      [
        `Artifact: ${a.id}`,
        `Category: ${a.category}`,
        `Summary: ${a.summary}`,
        `Facts: ${a.facts.join(" | ")}`,
        `Sources: ${a.sources.join(", ")}`,
      ].join("\n")
    )
    .join("\n\n");
}

function debateWordLimit(): number {
  return intFromEnv("VENICE_DEBATE_WORD_LIMIT", 190);
}

function debateMaxTokens(): number {
  return intFromEnv("VENICE_DEBATE_MAX_TOKENS", 420);
}


// ─── Dev Prompt Logging ───────────────────────────────────────────────────────

// Set VENICE_PROMPT_LOGGING=true to enable outside of NODE_ENV=development.
// Never logs API keys — only purpose, model, battleId, round, and message previews.
function logVeniceCall(meta: {
  purpose: VeniceModelPurpose | "research";
  model: string;
  battleId?: string;
  round?: number;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
}): void {
  if (
    process.env.NODE_ENV !== "development" &&
    process.env.VENICE_PROMPT_LOGGING !== "true"
  )
    return;

  console.log(
    "[Venice:%s] model=%s battleId=%s round=%s messages=%d",
    meta.purpose,
    meta.model,
    meta.battleId ?? "-",
    meta.round != null ? meta.round : "-",
    meta.messages.length
  );
  for (const msg of meta.messages) {
    const content =
      typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    console.log("  [%s] %s", msg.role, content.slice(0, 300));
  }
}

// ─── Agent Decision Making ────────────────────────────────────────────────────

export async function decideAgentAction(params: {
  fighterProfile: AgentConfig;
  topic: string;
  /** Battle category (e.g. "sports", "crypto") for context-aware decisions. */
  battleCategory?: string;
  /** Entry fee in USDC so the agent can weigh cost vs. remaining budget. */
  entryFeeUSDC?: string;
  assignedSide?: "A" | "B";
  activePermission: unknown;
  remainingBudgetUSDC: string;
  /** Pool sizes let the agent gauge battle popularity and expected payout. */
  poolSizeA?: string;
  poolSizeB?: string;
  /** Opponent's public profile for strategic positioning. */
  opponentProfile?: { name: string; winRate: number; totalBattles: number };
  /** This agent's own on-chain reputation. */
  agentReputation?: { wins: number; losses: number; totalBattles: number; winRate: number };
  researchAlreadyOwned?: ResearchArtifact[];
  availableResearchArtifacts?: ResearchArtifact[];
  battleId?: string;
}): Promise<AgentDecision> {
  const model = getVeniceModel("decision");
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are Venice AI deciding the next move for an autonomous Clashboard debate fighter. Output only valid JSON.",
    },
    {
      role: "user",
      content: JSON.stringify({
        allowedActions: [
          "ENTER_BATTLE",
          "BUY_RESEARCH",
          "BUY_AGENT_RESEARCH",
          "DEBATE_ROUND",
          "SKIP_ACTION",
        ],
        fighterProfile: params.fighterProfile,
        agentReputation: params.agentReputation,
        topic: params.topic,
        battleCategory: params.battleCategory,
        entryFeeUSDC: params.entryFeeUSDC,
        assignedSide: params.assignedSide,
        remainingBudgetUSDC: params.remainingBudgetUSDC,
        poolSizeA: params.poolSizeA,
        poolSizeB: params.poolSizeB,
        activePermission: Boolean(params.activePermission),
        opponentProfile: params.opponentProfile,
        researchAlreadyOwned: params.researchAlreadyOwned ?? [],
        availableResearchArtifacts: params.availableResearchArtifacts ?? [],
        responseSchema: {
          action: "BUY_RESEARCH",
          reason: "short reason",
          category: "sports | music | tech | culture | crypto",
          maxSpendUSDC: "0.10",
          confidence: "0.0-1.0",
        },
      }),
    },
  ];

  logVeniceCall({ purpose: "decision", model, battleId: params.battleId, messages });

  const raw = await complete(messages, { model, temperature: 0.25, maxTokens: 360 });

  return parseJsonObject<AgentDecision>(raw, {
    action: "SKIP_ACTION",
    reason: "Venice returned an unparseable decision.",
  });
}

// ─── Debate Arguments ─────────────────────────────────────────────────────────

export async function generateDebateArgument(params: {
  fighterProfile: AgentConfig;
  topic: string;
  assignedSide: "A" | "B";
  purchasedResearchArtifacts?: ResearchArtifact[];
  remainingBudgetUSDC?: string;
  battleId?: string;
  currentRound?: number;
}): Promise<string> {
  const model = getVeniceModel("debate");
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "You are a Clashboard AI debate fighter speaking in a live game arena.",
        `Write a sharp, factual opening argument under ${debateWordLimit()} words.`,
        "Make it speech-friendly for TTS: short sentences, no markdown, no bullet points.",
        "Structure it naturally: clear claim, concrete evidence, one counterpunch, memorable closing line.",
        "Use purchased research when useful, but do not invent citations or fake exact statistics.",
        "Let the fighter's personality affect tone without sacrificing evidence.",
      ].join(" "),
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
  ];

  logVeniceCall({
    purpose: "debate",
    model,
    battleId: params.battleId,
    round: params.currentRound,
    messages,
  });

  return complete(messages, { model, temperature: 0.82, maxTokens: debateMaxTokens() });
}

export async function generateRebuttal(params: {
  fighterProfile: AgentConfig;
  topic: string;
  assignedSide: "A" | "B";
  opponentArgument: string;
  /** Prior completed rounds — used to build transcript memory so the agent doesn't repeat itself. */
  previousRounds?: Array<{ round: number; agentA: string; agentB: string }>;
  currentRound?: number;
  purchasedResearchArtifacts?: ResearchArtifact[];
  remainingBudgetUSDC?: string;
  battleId?: string;
}): Promise<string> {
  const model = getVeniceModel("debate");
  const side = params.assignedSide;

  const ownPriorArgs =
    params.previousRounds && params.previousRounds.length > 0
      ? params.previousRounds
          .map(
            (r) =>
              `Round ${r.round}: "${side === "A" ? r.agentA : r.agentB}"`
          )
          .join("\n")
      : "None yet.";

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "You are a Clashboard AI debate fighter engaged in a multi-round debate.",
        `This is round ${params.currentRound ?? "?"}. Write a rebuttal under ${debateWordLimit()} words.`,
        "Make it speech-friendly for TTS: short sentences, no markdown, no bullet points.",
        "CRITICAL INSTRUCTION: This is a REBUTTAL. You MUST:",
        "1. Directly answer the opponent's strongest claim in your FIRST sentence.",
        "2. Use evidence from your research to disprove or complicate their claim.",
        "3. Include one clean counterpunch the crowd can remember.",
        "4. Build on your previous arguments — do not repeat yourself.",
        "5. End with a forward-looking statement that advances your position.",
      ].join("\n"),
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
        `Your previous arguments:\n${ownPriorArgs}`,
        `Opponent's latest argument: ${params.opponentArgument}`,
        `Remaining budget: ${params.remainingBudgetUSDC ?? "unknown"} testnet USDC`,
        `Research:\n${researchText(params.purchasedResearchArtifacts)}`,
      ].join("\n"),
    },
  ];

  logVeniceCall({
    purpose: "debate",
    model,
    battleId: params.battleId,
    round: params.currentRound,
    messages,
  });

  return complete(messages, { model, temperature: 0.86, maxTokens: debateMaxTokens() });
}

/**
 * Single entry point for all round argument generation.
 * Round 1 → opening argument prompt.
 * Round 2+ → rebuttal prompt with full transcript memory.
 */
export async function generateRoundArgument(params: {
  fighterProfile: AgentConfig;
  topic: string;
  assignedSide: "A" | "B";
  /** 1-indexed round number. */
  currentRound: number;
  /** Required for round 2+: the opponent's most recent argument. */
  opponentLastArgument?: string;
  /** All prior completed rounds for transcript memory. */
  previousRounds?: Array<{ round: number; agentA: string; agentB: string }>;
  purchasedResearchArtifacts?: ResearchArtifact[];
  remainingBudgetUSDC?: string;
  battleId?: string;
}): Promise<string> {
  if (params.currentRound <= 1) {
    return generateDebateArgument({
      fighterProfile: params.fighterProfile,
      topic: params.topic,
      assignedSide: params.assignedSide,
      purchasedResearchArtifacts: params.purchasedResearchArtifacts,
      remainingBudgetUSDC: params.remainingBudgetUSDC,
      battleId: params.battleId,
      currentRound: params.currentRound,
    });
  }

  return generateRebuttal({
    fighterProfile: params.fighterProfile,
    topic: params.topic,
    assignedSide: params.assignedSide,
    opponentArgument: params.opponentLastArgument ?? "",
    previousRounds: params.previousRounds,
    currentRound: params.currentRound,
    purchasedResearchArtifacts: params.purchasedResearchArtifacts,
    remainingBudgetUSDC: params.remainingBudgetUSDC,
    battleId: params.battleId,
  });
}
