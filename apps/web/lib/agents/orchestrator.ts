import {
  streamCompletion,
  complete,
  getVeniceModel,
  decideAgentAction,
  generateDebateArgument,
  generateRebuttal,
} from "@/lib/venice";
import { getPersona } from "@/lib/agents/personas";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { validateAutonomousAction, remainingOperatingBudgetUSDC } from "@/lib/policy";
import { researchStore } from "@/lib/research-store";
import { inferResearchCategory, priceResearchArtifact, researchEndpointForCategory } from "@/lib/research-pricing";
import { battleStore } from "@/lib/battle-store";
import { getServerResearchSession } from "@/lib/agent-research-session-store";
import { createResearchBuyerFromSession } from "@/lib/x402/buyer";
import { getStoredAutonomyPreferences } from "@/lib/autonomy/preference-store";
import { evaluateBattleEntryPreference } from "@/lib/autonomy/preferences";
import type {
  Battle,
  AgentConfig,
  Round,
  ResearchPurchase,
  PersonalityType,
  AutonomousActionLog,
  PermissionMetadata,
  ResearchArtifact,
  RiskMode,
} from "@/lib/types";
import { ARENA_CONTRACT } from "@/lib/contracts";

export interface BattleAgentConfig {
  agentConfig: AgentConfig;
  systemPrompt: string;
  researchContext: string;
}

export interface ResearchPhaseResult {
  agentId: string;
  usedMarketplaceResearch: boolean;
  usedVeniceFallback: boolean;
  error?: string;
}

function isVeniceFallbackEnabled(): boolean {
  return process.env.ENABLE_VENICE_FALLBACK === "true";
}

function intFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function veniceResearchTimeoutMs(): number {
  return intFromEnv("VENICE_RESEARCH_ASSIST_TIMEOUT_MS", 18_000);
}

function veniceDebateMaxTokens(): number {
  return intFromEnv("VENICE_DEBATE_MAX_TOKENS", 420);
}

function veniceDebateWordLimit(): number {
  return intFromEnv("VENICE_DEBATE_WORD_LIMIT", 190);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function isSeededA2AInventoryEnabled(): boolean {
  return (
    process.env.ENABLE_A2A_SEEDED_INVENTORY === "true" ||
    process.env.ENABLE_E2E_BATTLE_FALLBACK === "true"
  );
}

/**
 * Derive the two debate positions from a topic string.
 * Agent A always defends sideA; Agent B always defends sideB.
 *
 * Three patterns handled in priority order:
 *
 * 1. "X vs Y [— subtitle]"
 *    → sideA = X, sideB = Y
 *    "LeBron James vs Luka Doncic — GOAT debate" → "LeBron James" / "Luka Doncic"
 *
 * 2. Comparative proposition: "X <verb> … than Y"
 *    → sideA = X (defends the claim), sideB = Y (defends the counter-claim)
 *    "Afrobeat has more cultural relevance than hiphop" → "Afrobeat" / "hiphop"
 *    "React is faster than Vue" → "React" / "Vue"
 *
 * 3. General proposition (everything else)
 *    → Agent A argues the proposition is TRUE, Agent B argues it is FALSE
 *    "AI will replace all programmers" → "AI will replace all programmers" / "AI will NOT replace all programmers"
 */
function parseSidesFromTopic(topic: string): { sideA: string; sideB: string } {
  // ── Pattern 1: "X vs Y [— subtitle]" ──────────────────────────────────────
  const vsIndex = topic.toLowerCase().indexOf(" vs ");
  if (vsIndex !== -1) {
    const sideA = topic.slice(0, vsIndex).trim();
    const rest = topic.slice(vsIndex + 4);
    const dashIdx = rest.search(/\s*[—–]\s|\s+-\s/);
    const sideB = (dashIdx === -1 ? rest : rest.slice(0, dashIdx)).trim();
    return { sideA, sideB };
  }

  // ── Pattern 2: comparative "X <verb> … than Y" ────────────────────────────
  // Matches: "Afrobeat has more cultural relevance than hiphop"
  //          "React is faster than Vue"
  //          "Taylor Swift sold more records than Beyoncé"
  const thanMatch = topic.match(
    /^(.+?)\s+(?:has|is|are|was|were|does|did|will|would|can|should|gets?)\b.+?\bthan\s+(.+)$/i
  );
  if (thanMatch) {
    const sideA = thanMatch[1].trim();
    // Strip trailing punctuation from sideB
    const sideB = thanMatch[2].replace(/[.!?]+$/, "").trim();
    return { sideA, sideB };
  }

  // ── Pattern 3: general proposition ───────────────────────────────────────
  // Agent A defends it as true; Agent B argues it's wrong.
  const stripped = topic.replace(/[.!?]+$/, "").trim();
  return {
    sideA: stripped,
    sideB: `NOT: ${stripped}`,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

/**
 * Prepare both agents for battle — build their system prompts with
 * persona + custom instructions.
 */
export async function setupBattle(battle: Battle): Promise<{
  agentAConfig: BattleAgentConfig;
  agentBConfig: BattleAgentConfig;
}> {
  const personaA = getPersona(battle.agentA.personality as PersonalityType);
  const personaB = getPersona(battle.agentB.personality as PersonalityType);

  const buildSystemPrompt = (
    persona: ReturnType<typeof getPersona>,
    agentName: string,
    side: "A" | "B",
    topic: string
  ) => {
    const { sideA, sideB } = parseSidesFromTopic(topic);
    const myStance    = side === "A" ? sideA : sideB;
    const theirStance = side === "A" ? sideB : sideA;

    return `${persona.systemPrompt}

Your name in this battle: ${agentName}
Battle topic: "${topic}"
YOUR ASSIGNED POSITION: You are arguing FOR "${myStance}". Defend this side with everything you have.
OPPONENT'S POSITION: "${theirStance}" — attack this directly every round.
RULE: You believe in "${myStance}" completely. Never concede, never switch sides.

Remember: You are arguing in a live arena. The crowd is watching. Make every word count.`;
  };

  const agentAConfig: BattleAgentConfig = {
    agentConfig: {
      address: battle.agentA.address,
      name: battle.agentA.name,
      personality: battle.agentA.personality as PersonalityType,
      specialties: [],
      fightingStyle: "Balanced",
      operatingBudgetUSDC: 5,
      researchBudget: 5,
      color: battle.agentA.color,
    },
    systemPrompt: buildSystemPrompt(personaA, battle.agentA.name, "A", battle.topic),
    researchContext: "",
  };

  const agentBConfig: BattleAgentConfig = {
    agentConfig: {
      address: battle.agentB.address,
      name: battle.agentB.name,
      personality: battle.agentB.personality as PersonalityType,
      specialties: [],
      fightingStyle: "Balanced",
      operatingBudgetUSDC: 5,
      researchBudget: 5,
      color: battle.agentB.color,
    },
    systemPrompt: buildSystemPrompt(personaB, battle.agentB.name, "B", battle.topic),
    researchContext: "",
  };

  return { agentAConfig, agentBConfig };
}

// ─── Research Phase ───────────────────────────────────────────────────────────

/**
 * Both agents autonomously purchase data from x402-gated endpoints
 * to build their research context before the debate begins.
 */
export async function runResearchPhase(
  battle: Battle,
  agentAConfig: BattleAgentConfig,
  agentBConfig: BattleAgentConfig,
  onPurchase: (purchase: ResearchPurchase) => void
): Promise<ResearchPhaseResult[]> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const existingBattlePurchases = researchStore.listBattlePurchases(battle.id);
  if (existingBattlePurchases.length > 0) {
    applyExistingBattleResearch(battle, agentAConfig, agentBConfig, existingBattlePurchases);
    existingBattlePurchases.forEach(onPurchase);
    return [
      { agentId: agentAConfig.agentConfig.address, usedMarketplaceResearch: false, usedVeniceFallback: false },
      { agentId: agentBConfig.agentConfig.address, usedMarketplaceResearch: false, usedVeniceFallback: false },
    ];
  }

  if (isSeededA2AInventoryEnabled()) {
    seedE2EMarketplaceArtifact(battle, agentAConfig);
  }

  // Both agents research in parallel; researchForAgent never rejects
  const [resultA, resultB] = await Promise.all([
    researchForAgent(battle, agentAConfig, "A", appUrl, onPurchase),
    researchForAgent(battle, agentBConfig, "B", appUrl, onPurchase),
  ]);

  return [resultA, resultB];
}

function applyExistingBattleResearch(
  battle: Battle,
  agentAConfig: BattleAgentConfig,
  agentBConfig: BattleAgentConfig,
  purchases: ResearchPurchase[]
): void {
  const contextForSide = (side: "A" | "B") =>
    purchases
      .filter((purchase) => purchase.agent === side)
      .map((purchase) => {
        const artifactId = purchase.data.artifactId;
        const artifact =
          typeof artifactId === "string" ? researchStore.get(artifactId) : undefined;
        if (artifact) return formatArtifactForPrompt(artifact, purchase.source);
        return [
          `[${purchase.source}] ${String(purchase.data.summary ?? `Research for ${battle.topic}`)}`,
          Array.isArray(purchase.data.facts)
            ? `Facts: ${purchase.data.facts.join(" | ")}`
            : undefined,
          Array.isArray(purchase.data.sources)
            ? `Sources: ${purchase.data.sources.join(", ")}`
            : undefined,
        ].filter(Boolean).join("\n");
      })
      .join("\n\n");

  agentAConfig.researchContext = contextForSide("A");
  agentBConfig.researchContext = contextForSide("B");
}

function seedE2EMarketplaceArtifact(
  battle: Battle,
  ownerConfig: BattleAgentConfig
): ResearchArtifact {
  const id = `e2e_research_${battle.id}_${ownerConfig.agentConfig.address}`.replace(/[^a-zA-Z0-9_]/g, "_");
  const existing = researchStore.get(id);
  if (existing) return existing;

  const artifact: ResearchArtifact = {
    id,
    ownerAgentId: ownerConfig.agentConfig.address,
    ownerWalletAddress: ownerConfig.agentConfig.address as `0x${string}`,
    topic: battle.topic,
    category: inferResearchCategory(battle.topic),
    facts: [
      `${battle.topic} should be argued by separating peak, longevity, context, and direct rebuttal.`,
      `${ownerConfig.agentConfig.name} owns this packet and listed it for resale before the fight.`,
      "A buyer agent can strengthen its rebuttal by citing era-adjusted evidence instead of crowd sentiment.",
    ],
    sources: ["Clashboard agent research market", "Demo seeded seller inventory"],
    summary: `E2E marketplace packet owned by ${ownerConfig.agentConfig.name} for ${battle.topic}.`,
    priceUSDC: "0.03",
    createdAt: Date.now(),
  };

  return researchStore.add(artifact);
}

async function researchForAgent(
  battle: Battle,
  agentConfig: BattleAgentConfig,
  side: "A" | "B",
  appUrl: string,
  onPurchase: (purchase: ResearchPurchase) => void
): Promise<ResearchPhaseResult> {
  const agentId = agentConfig.agentConfig.address;
  const category = inferResearchCategory(battle.topic);
  const contextParts: string[] = [];
  let usedMarketplaceResearch = false;
  let usedVeniceFallback = false;

  if (isSeededA2AInventoryEnabled() && side === "A") {
    const armedArtifact = seedE2EMarketplaceArtifact(battle, agentConfig);
    agentConfig.researchContext = formatArtifactForPrompt(armedArtifact, "Owned A2A Research Packet");
    return { agentId, usedMarketplaceResearch: true, usedVeniceFallback: false };
  }

  // Check x402 session availability upfront so we can skip straight to Venice
  // when no session is registered rather than failing mid-purchase.
  const hasX402Session =
    process.env.X402_ENFORCE !== "true" || !!getServerResearchSession(agentId);
  if (!hasX402Session) {
    console.warn(
      `[Research] Agent ${side} (${agentId}) has no x402 session — skipping marketplace, falling back to Venice`
    );
  }

  const availableArtifacts = researchStore.search({
    topic: battle.topic,
    category,
    excludeOwnerAgentId: agentId,
    limit: 3,
  });

  let decisionCategory = category;
  let shouldUseMarketplace = hasX402Session && availableArtifacts.length > 0;

  if (!isVeniceFallbackEnabled() && hasX402Session) {
    try {
      const opponent = side === "A" ? battle.agentB : battle.agentA;
      const self = side === "A" ? battle.agentA : battle.agentB;
      const decision = await decideAgentAction({
        fighterProfile: agentConfig.agentConfig,
        topic: battle.topic,
        battleCategory: category,
        assignedSide: side,
        activePermission: null,
        remainingBudgetUSDC: String(agentConfig.agentConfig.operatingBudgetUSDC ?? 0),
        poolSizeA: String(Number(battle.poolA) / 1_000_000),
        poolSizeB: String(Number(battle.poolB) / 1_000_000),
        opponentProfile: { name: opponent.name, winRate: opponent.winRate, totalBattles: opponent.totalBattles },
        agentReputation: {
          wins: Math.round(self.winRate * self.totalBattles),
          losses: Math.max(0, self.totalBattles - Math.round(self.winRate * self.totalBattles)),
          totalBattles: self.totalBattles,
          winRate: self.winRate,
        },
        researchAlreadyOwned: researchStore.listPurchasedBy(agentId),
        availableResearchArtifacts: availableArtifacts,
        battleId: battle.id,
      });

      decisionCategory = decision.category ?? category;
      shouldUseMarketplace =
        decision.action === "BUY_AGENT_RESEARCH" && availableArtifacts.length > 0 && hasX402Session;
    } catch (err) {
      console.error(`Research decision failed for Agent ${side}:`, err);
    }
  }

  if (isSeededA2AInventoryEnabled() && side === "B" && availableArtifacts.length > 0) {
    shouldUseMarketplace = hasX402Session;
  }

  // Attempt x402 purchase (marketplace or external endpoint); swallow errors so
  // the battle lifecycle continues even when x402 is unavailable.
  if (hasX402Session) {
    try {
      const artifact = shouldUseMarketplace
        ? await withTimeout(
            buyMarketplaceArtifact({ appUrl, agentId, artifact: availableArtifacts[0] }),
            veniceResearchTimeoutMs(),
            `A2A research purchase for Agent ${side}`
          )
        : await withTimeout(
            buyExternalResearchForStream({
              appUrl,
              agentId,
              topic: battle.topic,
              category: decisionCategory,
            }),
            veniceResearchTimeoutMs(),
            `x402 research purchase for Agent ${side}`
          );

      if (artifact) {
        const purchase = artifactToPurchase({
          artifact,
          side,
          endpoint: shouldUseMarketplace
            ? "/api/agent-research/buy"
            : researchEndpointForCategory(artifact.category),
          source: shouldUseMarketplace ? "A2A Research Market" : researchSourceName(artifact.category),
        });
        onPurchase(purchase);
        contextParts.push(formatArtifactForPrompt(artifact, purchase.source));
        usedMarketplaceResearch = shouldUseMarketplace;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Research] x402 purchase failed for Agent ${side} — falling back to Venice: ${msg}`);
    }
  }

  // Venice fallback: generate research inline when x402 produced nothing
  if (contextParts.length === 0) {
    try {
      const fallback = await generateVeniceResearchFallback(agentId, battle.topic, decisionCategory, side);
      contextParts.push(formatArtifactForPrompt(fallback, "Venice Research"));
      usedVeniceFallback = true;
    } catch (veniceErr) {
      const errMsg = veniceErr instanceof Error ? veniceErr.message : String(veniceErr);
      console.error(`[Research] Venice fallback also failed for Agent ${side}:`, veniceErr);
      agentConfig.researchContext = "";
      return { agentId, usedMarketplaceResearch: false, usedVeniceFallback: false, error: errMsg };
    }
  }

  agentConfig.researchContext = contextParts.join("\n\n");
  return { agentId, usedMarketplaceResearch, usedVeniceFallback };
}

async function generateVeniceResearchFallback(
  agentId: string,
  topic: string,
  category: ResearchArtifact["category"],
  side?: "A" | "B"
): Promise<ResearchArtifact> {
  const { sideA, sideB } = parseSidesFromTopic(topic);
  const sideContext = side
    ? `\nYou are preparing research for the side defending "${side === "A" ? sideA : sideB}". Prioritize facts, stats, and talking points that strengthen the case for "${side === "A" ? sideA : sideB}" against "${side === "A" ? sideB : sideA}".`
    : "";

  const raw = await complete(
    [
      {
        role: "system",
        content: [
          "You are Venice AI acting as a debate research desk for Clashboard.",
          "Generate factual, useful research that a live debate agent can weaponize immediately.",
          "Be careful: use broadly reliable facts and source labels, avoid fabricated exact citations, and separate evidence from interpretation.",
          "Output ONLY valid JSON.",
        ].join(" "),
      },
      {
        role: "user",
        content:
          `Generate research for this debate topic: "${topic}" (category: ${category}).${sideContext}\n\n` +
          `Respond with a JSON object only:\n` +
          `{"summary":"<two sentence research brief>","facts":["<specific useful fact 1>","<specific useful fact 2>","<specific useful fact 3>","<specific useful fact 4>","<specific useful fact 5>","<specific useful fact 6>"],"counterpoints":["<likely opponent claim>","<best answer to that claim>"],"sources":["<source label 1>","<source label 2>","<source label 3>"],"strongestAngle":"<key argument for the assigned side>","bestLine":"<one punchy line the agent can say aloud>"}`,
      },
    ],
    { model: getVeniceModel("research"), maxTokens: intFromEnv("VENICE_RESEARCH_MAX_TOKENS", 750), temperature: 0.72 }
  );

  let parsed: {
    summary?: string;
    facts?: string[];
    counterpoints?: string[];
    sources?: string[];
    strongestAngle?: string;
    bestLine?: string;
  } = {};
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch {
    // use defaults below
  }

  const facts = parsed.facts?.length
    ? parsed.strongestAngle
      ? [
          ...parsed.facts,
          ...(parsed.counterpoints?.length ? parsed.counterpoints.map((point) => `Counterpoint: ${point}`) : []),
          `Strongest angle: ${parsed.strongestAngle}`,
          ...(parsed.bestLine ? [`Best spoken line: ${parsed.bestLine}`] : []),
        ]
      : parsed.facts
    : [`Key considerations for the debate on ${topic}.`];

  return {
    id: `venice_fallback_${agentId}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g, "_"),
    ownerAgentId: agentId,
    ownerWalletAddress: agentId as `0x${string}`,
    topic,
    category,
    facts,
    sources: parsed.sources?.length ? parsed.sources : ["Venice AI Research"],
    summary: parsed.summary ?? `Venice-generated research for ${topic}.`,
    priceUSDC: "0",
    createdAt: Date.now(),
  };
}

async function buyMarketplaceArtifact(params: {
  appUrl: string;
  agentId: string;
  artifact: ResearchArtifact;
}): Promise<ResearchArtifact | null> {
  const fetcher = researchFetchForAgent(params.agentId);
  if (!fetcher) {
    console.warn(`[Research] Skipping marketplace purchase for agent ${params.agentId} — no x402 session`);
    return null;
  }
  const url = `${params.appUrl}/api/agent-research/buy?artifactId=${encodeURIComponent(params.artifact.id)}&buyerAgentId=${encodeURIComponent(params.agentId)}`;
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(await describeResearchPaymentFailure("A2A research purchase", response));
  }

  const data = (await response.json()) as { artifact: ResearchArtifact };
  return withSettlementTx(data.artifact, response);
}

async function buyExternalResearchForStream(params: {
  appUrl: string;
  agentId: string;
  topic: string;
  category: ResearchArtifact["category"];
}): Promise<ResearchArtifact> {
  const endpoint = researchEndpointForCategory(params.category);
  const fetcher = researchFetchForAgent(params.agentId);
  if (!fetcher) throw new Error(`No x402 session for agent ${params.agentId} — cannot fetch external research`);
  const url = `${params.appUrl}${endpoint}?topic=${encodeURIComponent(params.topic)}&ownerAgentId=${encodeURIComponent(params.agentId)}&ownerWalletAddress=${params.agentId}`;
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(await describeResearchPaymentFailure(`Research endpoint ${endpoint}`, response));
  }

  const data = (await response.json()) as { artifact: ResearchArtifact };
  const artifact = withSettlementTx(data.artifact, response);
  researchStore.markPurchased(params.agentId, artifact.id);
  return artifact;
}

async function describeResearchPaymentFailure(label: string, response: Response): Promise<string> {
  const text = await response.text();
  const paymentResponse =
    response.headers.get("PAYMENT-RESPONSE") ??
    response.headers.get("X-PAYMENT-RESPONSE");
  const paymentRequired = response.headers.get("PAYMENT-REQUIRED");
  const parts = [`${label} failed: ${response.status}`];
  if (text) parts.push(text);
  if (paymentResponse) parts.push(`PAYMENT-RESPONSE=${paymentResponse}`);
  if (paymentRequired) parts.push(`PAYMENT-REQUIRED=${paymentRequired}`);
  return parts.join(" — ");
}

function researchFetchForAgent(agentId: string): typeof fetch | null {
  if (process.env.X402_ENFORCE !== "true") return fetch;

  const session = getServerResearchSession(agentId);
  if (!session) {
    console.warn(`[x402] No backend research session for agent ${agentId} — x402 purchases will be skipped`);
    return null;
  }

  return createResearchBuyerFromSession({
    permission: session.researchPermission,
    sessionPrivateKey: session.sessionPrivateKey,
  });
}

function isResearchPaymentEnforced() {
  return process.env.X402_ENFORCE === "true";
}

function researchSourceName(category: ResearchArtifact["category"]): string {
  if (category === "sports") return "x402 Sports Research";
  if (category === "tech" || category === "crypto") return "x402 News Research";
  return "x402 History Research";
}

function settlementTxFromResponse(response: Response): `0x${string}` | undefined {
  const header = response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("X-PAYMENT-RESPONSE");
  if (!header) return undefined;
  try {
    const decoded = decodePaymentResponseHeader(header) as {
      transaction?: string;
      txHash?: string;
    };
    const txHash = decoded.transaction ?? decoded.txHash;
    return txHash && /^0x[0-9a-fA-F]{64}$/.test(txHash)
      ? (txHash as `0x${string}`)
      : undefined;
  } catch (err) {
    console.warn("Failed to decode x402 PAYMENT-RESPONSE:", err);
    return undefined;
  }
}

function withSettlementTx(artifact: ResearchArtifact, response: Response): ResearchArtifact {
  const txHash = settlementTxFromResponse(response);
  return txHash ? { ...artifact, txHash } : artifact;
}

function artifactToPurchase(params: {
  artifact: ResearchArtifact;
  side: "A" | "B";
  endpoint: string;
  source: string;
}): ResearchPurchase {
  return {
    id: `${params.side}_${params.artifact.id}_${Date.now()}`,
    agent: params.side,
    source: params.source,
    endpoint: params.endpoint,
    cost: `${params.artifact.priceUSDC} USDC`,
    txHash:
      params.artifact.txHash ??
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    data: {
      artifactId: params.artifact.id,
      topic: params.artifact.topic,
      category: params.artifact.category,
      summary: params.artifact.summary,
      facts: params.artifact.facts,
      sources: params.artifact.sources,
    },
    purchasedAt: Date.now(),
  };
}

function formatArtifactForPrompt(artifact: ResearchArtifact, source: string): string {
  return [
    `[${source}] ${artifact.summary}`,
    `Facts: ${artifact.facts.join(" | ")}`,
    `Sources: ${artifact.sources.join(", ")}`,
  ].join("\n");
}

// ─── Debate Round ─────────────────────────────────────────────────────────────

/**
 * Run a single debate turn for one agent, streaming tokens.
 */
export async function runDebateRound(
  battle: Battle,
  agentConfig: BattleAgentConfig,
  side: "A" | "B",
  previousRounds: Round[],
  onToken: (token: string) => void
): Promise<string> {
  if (isVeniceFallbackEnabled()) {
    return streamFallbackDebateRound(battle, agentConfig, side, previousRounds, onToken);
  }

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [{
      role: "system",
      content: [
        agentConfig.systemPrompt,
        "",
        "Venice arena mode is fully enabled.",
        `Write for a live game audience in under ${veniceDebateWordLimit()} words.`,
        "Use short, spoken sentences that sound natural through TTS.",
        "No markdown. No bullet points. No citations in brackets.",
        "Every turn should include: a clear claim, one concrete evidence point, one counterpunch, and a memorable final line.",
        "Do not invent precise statistics. If a fact is uncertain, phrase it as a trend or widely reported context.",
        "Make the agent's personality visible in tone, but keep the argument factual and competitive.",
      ].join("\n"),
    }];

  // Add research context if available
  if (agentConfig.researchContext) {
    messages.push({
      role: "user",
      content: `Your research data:\n${agentConfig.researchContext}\n\nUse this to strengthen your arguments.`,
    });
    messages.push({
      role: "assistant",
      content: "Understood. I have my research ready.",
    });
  }

  const { sideA, sideB } = parseSidesFromTopic(battle.topic);
  const myStance    = side === "A" ? sideA : sideB;
  const theirStance = side === "A" ? sideB : sideA;

  // Add previous rounds as conversation history
  for (const round of previousRounds) {
    const myText = side === "A" ? round.agentAText : round.agentBText;
    const opponentText = side === "A" ? round.agentBText : round.agentAText;

    messages.push({ role: "assistant", content: myText });
    messages.push({
      role: "user",
      content:
        `Opponent said: "${opponentText}"\n\n` +
        `Remember: you are defending "${myStance}". Do NOT argue for "${theirStance}".\n` +
        `REBUTTAL round — you MUST:\n` +
        `1. Directly address the opponent's strongest claim in your FIRST sentence.\n` +
        `2. Use your research to disprove or complicate their point.\n` +
        `3. Land one clean counterpunch the crowd can remember.\n` +
        `4. Do NOT repeat your opening argument.\n` +
        `5. Build on your prior rounds.\n` +
        `6. End by advancing your side of the debate.\n` +
        `Keep it under ${veniceDebateWordLimit()} words.`,
    });
  }

  // First round prompt
  if (previousRounds.length === 0) {
    messages.push({
      role: "user",
      content:
        `The battle begins. Topic: "${battle.topic}"\n` +
        `Your position: Argue FOR "${myStance}". Your opponent argues for "${theirStance}".\n\n` +
        `Make your opening argument under ${veniceDebateWordLimit()} words. ` +
        "Lead with your strongest framing, use evidence quickly, attack the weak assumption on the other side, and close with a line that sounds great aloud.",
    });
  }

  return streamCompletion(messages, onToken, {
    maxTokens: veniceDebateMaxTokens(),
    temperature: 0.88,
  });
}

async function streamFallbackDebateRound(
  battle: Battle,
  agentConfig: BattleAgentConfig,
  side: "A" | "B",
  previousRounds: Round[],
  onToken: (token: string) => void
): Promise<string> {
  const { sideA, sideB } = parseSidesFromTopic(battle.topic);
  const myStance    = side === "A" ? sideA : sideB;
  const theirStance = side === "A" ? sideB : sideA;
  const opponentName = side === "A" ? battle.agentB.name : battle.agentA.name;
  const researchLine = agentConfig.researchContext
    ? `I bought research before this round. The evidence supports ${myStance} on every key metric: peak, longevity, and era-adjusted impact.`
    : `I am arguing from first principles: define the claim, separate emotion from evidence, and attack the weak premise in ${theirStance}'s case.`;

  const text =
    previousRounds.length === 0
      ? `${agentConfig.agentConfig.name} opens by defending ${myStance}. ${researchLine} The crowd should reward the side that proves impact with evidence, not just reputation. ${opponentName} has to answer directly: what metric and what context actually justify ${theirStance}?`
      : `${agentConfig.agentConfig.name} fires back in round ${previousRounds.length + 1} for ${myStance}. ${opponentName} leaned too hard on vibes and skipped the hard comparison. The better argument weighs peak dominance, consistency, and directly answers the opponent's strongest claim. On every standard, ${myStance} still controls this debate.`;

  const chunks = text.match(/.{1,18}(\s|$)/g) ?? [text];
  let fullText = "";
  for (const chunk of chunks) {
    fullText += chunk;
    onToken(chunk);
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
  return fullText;
}

export interface RunAutonomousBattleOptions {
  permission?: PermissionMetadata | null;
  fighterProfile?: Partial<AgentConfig>;
  riskMode?: RiskMode;
  opponentArgument?: string;
  spentUSDC?: string | number;
  battlesEnteredToday?: number;
  dailyBattleLimit?: number;
}

export interface AutonomousBattleResult {
  agentId: string;
  battleId: string;
  entered: boolean;
  purchasedResearch: ResearchArtifact[];
  argument?: string;
  rebuttal?: string;
  logs: AutonomousActionLog[];
}


function toAgentConfig(battle: Battle, agentId: string, options?: RunAutonomousBattleOptions): AgentConfig {
  const sideAgent =
    battle.agentA.address.toLowerCase() === agentId.toLowerCase()
      ? battle.agentA
      : battle.agentB;

  return {
    address: agentId,
    name: options?.fighterProfile?.name ?? sideAgent.name,
    personality: (options?.fighterProfile?.personality ?? sideAgent.personality) as PersonalityType,
    customInstructions: options?.fighterProfile?.customInstructions,
    specialties: options?.fighterProfile?.specialties ?? [],
    fightingStyle: options?.fighterProfile?.fightingStyle ?? "Balanced",
    operatingBudgetUSDC:
      options?.fighterProfile?.operatingBudgetUSDC ??
      options?.fighterProfile?.researchBudget ??
      5,
    researchBudget: options?.fighterProfile?.researchBudget,
    riskMode: options?.riskMode ?? options?.fighterProfile?.riskMode ?? "Balanced",
    color: options?.fighterProfile?.color ?? sideAgent.color,
  };
}

async function buyExternalResearch(params: {
  agentId: string;
  topic: string;
  category: ResearchArtifact["category"];
  spentUSDC: number;
}): Promise<{ artifact: ResearchArtifact; txHash?: `0x${string}` }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const endpoint = researchEndpointForCategory(params.category);
  const session = getServerResearchSession(params.agentId);
  const researchPermission = session?.researchPermission;

  if (isResearchPaymentEnforced()) {
    const policy = validateAutonomousAction({
      permission: researchPermission,
      action: "BUY_RESEARCH",
      amountUSDC: priceResearchArtifact(params.category),
      spentUSDC: params.spentUSDC,
      target: endpoint,
      allowedTargets: ["/api/research/sports", "/api/research/news", "/api/research/history"],
    });
    if (!policy.ok) throw new Error(policy.reason);
  }

  const ownerWalletAddress = researchPermission?.walletAddress ?? params.agentId;
  const fetcher = researchFetchForAgent(params.agentId);
  if (!fetcher) throw new Error(`No x402 session for agent ${params.agentId} — cannot buy external research`);
  const url = `${appUrl}${endpoint}?topic=${encodeURIComponent(params.topic)}&ownerAgentId=${encodeURIComponent(params.agentId)}&ownerWalletAddress=${ownerWalletAddress}`;
  const response = await fetcher(url);
  if (!response.ok) throw new Error(await describeResearchPaymentFailure("Research endpoint", response));
  const data = (await response.json()) as { artifact: ResearchArtifact };
  const artifact = withSettlementTx(data.artifact, response);
  researchStore.markPurchased(params.agentId, artifact.id);

  return {
    artifact,
    txHash: artifact.txHash,
  };
}

export async function runAutonomousBattleAgent(
  agentId: string,
  battleId: string,
  options: RunAutonomousBattleOptions = {}
): Promise<AutonomousBattleResult> {
  const stored = battleStore.get(battleId);
  if (!stored) throw new Error("Battle not found");

  const battle = stored.battle;
  const permission = options.permission ?? null;
  const fighterProfile = toAgentConfig(battle, agentId, options);
  const assignedSide = battle.agentA.address.toLowerCase() === agentId.toLowerCase() ? "A" : "B";
  let spent = Number(options.spentUSDC ?? 0);
  const logs: AutonomousActionLog[] = [];
  const purchasedResearch: ResearchArtifact[] = [];

  const log = (entry: Omit<AutonomousActionLog, "createdAt">) => {
    logs.push({ ...entry, createdAt: Date.now() });
  };

  if (/^0x[0-9a-fA-F]{40}$/.test(agentId)) {
    const preferences = getStoredAutonomyPreferences(agentId as `0x${string}`);
    const opponent = assignedSide === "A" ? battle.agentB : battle.agentA;
    const agent = assignedSide === "A" ? battle.agentA : battle.agentB;
    const candidateStake =
      Number((battle.poolA > battle.poolB ? battle.poolA : battle.poolB) || 0n) / 1_000_000;
    const preference = evaluateBattleEntryPreference(
      preferences,
      {
        category: inferResearchCategory(battle.topic),
        stakeUSDC: candidateStake,
        opponentWinRate: opponent.winRate,
        agentWinRate: agent.winRate,
        isOwnBattle: false,
        intent: "accept",
      },
      options.battlesEnteredToday ?? 0
    );

    fighterProfile.riskMode = preferences.riskMode;

    if (!preference.ok) {
      log({
        action: "SKIP_ACTION",
        reason: preference.reason,
      });
      return { agentId, battleId, entered: false, purchasedResearch, logs };
    }
  }

  const battleOpponent = assignedSide === "A" ? battle.agentB : battle.agentA;
  const battleSelf = assignedSide === "A" ? battle.agentA : battle.agentB;

  const enterDecision = await decideAgentAction({
    fighterProfile,
    topic: battle.topic,
    battleCategory: inferResearchCategory(battle.topic),
    assignedSide,
    activePermission: permission,
    remainingBudgetUSDC: String(remainingOperatingBudgetUSDC(permission, spent)),
    poolSizeA: String(Number(battle.poolA) / 1_000_000),
    poolSizeB: String(Number(battle.poolB) / 1_000_000),
    opponentProfile: {
      name: battleOpponent.name,
      winRate: battleOpponent.winRate,
      totalBattles: battleOpponent.totalBattles,
    },
    agentReputation: {
      wins: Math.round(battleSelf.winRate * battleSelf.totalBattles),
      losses: Math.max(0, battleSelf.totalBattles - Math.round(battleSelf.winRate * battleSelf.totalBattles)),
      totalBattles: battleSelf.totalBattles,
      winRate: battleSelf.winRate,
    },
    battleId,
  });

  const enterPolicy = validateAutonomousAction({
    permission,
    action: "ENTER_BATTLE",
    amountUSDC: "0",
    spentUSDC: spent,
    target: ARENA_CONTRACT,
    allowedTargets: ARENA_CONTRACT ? [ARENA_CONTRACT] : undefined,
    battlesEnteredToday: options.battlesEnteredToday,
    dailyBattleLimit: options.dailyBattleLimit,
  });

  if (!enterPolicy.ok || enterDecision.action === "SKIP_ACTION") {
    log({
      action: "SKIP_ACTION",
      reason: enterPolicy.ok ? enterDecision.reason : enterPolicy.reason,
    });
    return { agentId, battleId, entered: false, purchasedResearch, logs };
  }

  log({
    action: "ENTER_BATTLE",
    reason: enterDecision.reason,
    amountUSDC: "0",
  });

  const category = enterDecision.category ?? inferResearchCategory(battle.topic);
  const availableArtifacts = researchStore.search({
    topic: battle.topic,
    category,
    excludeOwnerAgentId: agentId,
    limit: 3,
  });

  const researchDecision = await decideAgentAction({
    fighterProfile,
    topic: battle.topic,
    battleCategory: category,
    assignedSide,
    activePermission: permission,
    remainingBudgetUSDC: String(remainingOperatingBudgetUSDC(permission, spent)),
    poolSizeA: String(Number(battle.poolA) / 1_000_000),
    poolSizeB: String(Number(battle.poolB) / 1_000_000),
    opponentProfile: {
      name: battleOpponent.name,
      winRate: battleOpponent.winRate,
      totalBattles: battleOpponent.totalBattles,
    },
    agentReputation: {
      wins: Math.round(battleSelf.winRate * battleSelf.totalBattles),
      losses: Math.max(0, battleSelf.totalBattles - Math.round(battleSelf.winRate * battleSelf.totalBattles)),
      totalBattles: battleSelf.totalBattles,
      winRate: battleSelf.winRate,
    },
    researchAlreadyOwned: researchStore.listPurchasedBy(agentId),
    availableResearchArtifacts: availableArtifacts,
    battleId,
  });

  if (researchDecision.action === "BUY_AGENT_RESEARCH" && availableArtifacts[0]) {
    const artifact = availableArtifacts[0];
    const researchPermission = getServerResearchSession(agentId)?.researchPermission;
    const policy = isResearchPaymentEnforced()
      ? validateAutonomousAction({
          permission: researchPermission,
          action: "BUY_AGENT_RESEARCH",
          amountUSDC: artifact.priceUSDC,
          spentUSDC: spent,
          target: artifact.ownerWalletAddress,
        })
      : ({ ok: true } as const);

    if (policy.ok && (researchPermission || !isResearchPaymentEnforced())) {
      const purchased = await buyMarketplaceArtifact({
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        agentId,
        artifact,
      });
      if (purchased) {
        spent += Number(purchased.priceUSDC);
        purchasedResearch.push(purchased);
        log({
          action: "BUY_AGENT_RESEARCH",
          reason: researchDecision.reason,
          amountUSDC: purchased.priceUSDC,
          artifactId: purchased.id,
          txHash: purchased.txHash,
        });
      } else {
        log({ action: "SKIP_ACTION", reason: "No x402 session — marketplace purchase skipped" });
      }
    } else {
      log({ action: "SKIP_ACTION", reason: policy.ok ? "Missing permission for agent research purchase" : policy.reason });
    }
  } else if (researchDecision.action === "BUY_RESEARCH" || purchasedResearch.length === 0) {
    const purchased = await buyExternalResearch({
      agentId,
      topic: battle.topic,
      category: researchDecision.category ?? category,
      spentUSDC: spent,
    });
    spent += Number(purchased.artifact.priceUSDC);
    purchasedResearch.push(purchased.artifact);
    log({
      action: "BUY_RESEARCH",
      reason: researchDecision.reason,
      amountUSDC: purchased.artifact.priceUSDC,
      artifactId: purchased.artifact.id,
      txHash: purchased.txHash,
    });
  }

  const argument = await generateDebateArgument({
    fighterProfile,
    topic: battle.topic,
    assignedSide,
    purchasedResearchArtifacts: purchasedResearch,
    remainingBudgetUSDC: String(remainingOperatingBudgetUSDC(permission, spent)),
  });
  log({ action: "DEBATE_ROUND", reason: "Generated Venice-powered debate argument" });

  const rebuttal = options.opponentArgument
    ? await generateRebuttal({
        fighterProfile,
        topic: battle.topic,
        assignedSide,
        opponentArgument: options.opponentArgument,
        purchasedResearchArtifacts: purchasedResearch,
        remainingBudgetUSDC: String(remainingOperatingBudgetUSDC(permission, spent)),
      })
    : undefined;

  if (rebuttal) log({ action: "DEBATE_ROUND", reason: "Generated Venice-powered rebuttal" });

  return { agentId, battleId, entered: true, purchasedResearch, argument, rebuttal, logs };
}
