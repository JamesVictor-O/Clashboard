import { streamCompletion } from "@/lib/venice";
import {
  decideAgentAction,
  generateDebateArgument,
  generateRebuttal,
} from "@/lib/venice";
import { getPersona } from "@/lib/agents/personas";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { executeArenaActionWith1Shot } from "@/lib/payments/oneshot";
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

export interface BattleAgentConfig {
  agentConfig: AgentConfig;
  systemPrompt: string;
  researchContext: string;
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
    return `${persona.systemPrompt}

Your name in this battle: ${agentName}
Your side: Agent ${side}
Battle topic: "${topic}"

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
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Both agents research in parallel
  await Promise.all([
    researchForAgent(battle, agentAConfig, "A", appUrl, onPurchase),
    researchForAgent(battle, agentBConfig, "B", appUrl, onPurchase),
  ]);
}

async function researchForAgent(
  battle: Battle,
  agentConfig: BattleAgentConfig,
  side: "A" | "B",
  appUrl: string,
  onPurchase: (purchase: ResearchPurchase) => void
): Promise<void> {
  const agentId = agentConfig.agentConfig.address;
  const category = inferResearchCategory(battle.topic);
  const contextParts: string[] = [];

  const availableArtifacts = researchStore.search({
    topic: battle.topic,
    category,
    excludeOwnerAgentId: agentId,
    limit: 3,
  });

  let decisionCategory = category;
  let shouldUseMarketplace = availableArtifacts.length > 0;

  try {
    const decision = await decideAgentAction({
      fighterProfile: agentConfig.agentConfig,
      topic: battle.topic,
      assignedSide: side,
      activePermission: null,
      remainingBudgetUSDC: String(agentConfig.agentConfig.operatingBudgetUSDC ?? 0),
      researchAlreadyOwned: researchStore.listPurchasedBy(agentId),
      availableResearchArtifacts: availableArtifacts,
    });

    decisionCategory = decision.category ?? category;
    shouldUseMarketplace =
      decision.action === "BUY_AGENT_RESEARCH" && availableArtifacts.length > 0;
  } catch (err) {
    console.error(`Research decision failed for Agent ${side}:`, err);
  }

  try {
    const artifact = shouldUseMarketplace
      ? await buyMarketplaceArtifact({
          appUrl,
          agentId,
          artifact: availableArtifacts[0],
        })
      : await buyExternalResearchForStream({
          appUrl,
          agentId,
          topic: battle.topic,
          category: decisionCategory,
        });

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
  } catch (err) {
    console.error(`Research purchase failed for Agent ${side}:`, err);
  }

  agentConfig.researchContext = contextParts.join("\n\n");
}

async function buyMarketplaceArtifact(params: {
  appUrl: string;
  agentId: string;
  artifact: ResearchArtifact;
}): Promise<ResearchArtifact> {
  const url = `${params.appUrl}/api/agent-research/buy?artifactId=${encodeURIComponent(params.artifact.id)}&buyerAgentId=${encodeURIComponent(params.agentId)}`;
  const response = await researchFetchForAgent(params.agentId)(url);
  if (!response.ok) {
    throw new Error(`A2A research purchase failed: ${response.status} — ${await response.text()}`);
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
  const url = `${params.appUrl}${endpoint}?topic=${encodeURIComponent(params.topic)}&ownerAgentId=${encodeURIComponent(params.agentId)}&ownerWalletAddress=${params.agentId}`;
  const response = await researchFetchForAgent(params.agentId)(url);
  if (!response.ok) {
    throw new Error(`Research endpoint ${endpoint} failed: ${response.status} — ${await response.text()}`);
  }

  const data = (await response.json()) as { artifact: ResearchArtifact };
  const artifact = withSettlementTx(data.artifact, response);
  researchStore.markPurchased(params.agentId, artifact.id);
  return artifact;
}

function researchFetchForAgent(agentId: string): typeof fetch {
  if (process.env.X402_ENFORCE !== "true") return fetch;

  const session = getServerResearchSession(agentId);
  if (!session) {
    throw new Error("No backend x402 research session registered for agent");
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
  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [{ role: "system", content: agentConfig.systemPrompt }];

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

  // Add previous rounds as conversation history
  for (const round of previousRounds) {
    const myText = side === "A" ? round.agentAText : round.agentBText;
    const opponentText = side === "A" ? round.agentBText : round.agentAText;

    messages.push({ role: "assistant", content: myText });
    messages.push({
      role: "user",
      content: `Opponent said: "${opponentText}"\n\nNow respond — make your next argument. Keep it under 120 words.`,
    });
  }

  // First round prompt
  if (previousRounds.length === 0) {
    messages.push({
      role: "user",
      content: `The battle begins. Topic: "${battle.topic}"\n\nMake your opening argument. Under 120 words. Make it count.`,
    });
  }

  return streamCompletion(messages, onToken, {
    maxTokens: 200,
    temperature: 0.9,
  });
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

function defaultRecipient(): `0x${string}` {
  return (process.env.PLATFORM_TREASURY_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`;
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
  const url = `${appUrl}${endpoint}?topic=${encodeURIComponent(params.topic)}&ownerAgentId=${encodeURIComponent(params.agentId)}&ownerWalletAddress=${ownerWalletAddress}`;
  const response = await researchFetchForAgent(params.agentId)(url);
  if (!response.ok) throw new Error(`Research endpoint failed: ${response.status} — ${await response.text()}`);
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

  const enterDecision = await decideAgentAction({
    fighterProfile,
    topic: battle.topic,
    assignedSide,
    activePermission: permission,
    remainingBudgetUSDC: String(remainingOperatingBudgetUSDC(permission, spent)),
  });

  const enterPolicy = validateAutonomousAction({
    permission,
    action: "ENTER_BATTLE",
    amountUSDC: "0",
    spentUSDC: spent,
    target: process.env.NEXT_PUBLIC_ARENA_CONTRACT,
    allowedTargets: process.env.NEXT_PUBLIC_ARENA_CONTRACT ? [process.env.NEXT_PUBLIC_ARENA_CONTRACT] : undefined,
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

  const entryExecution = await executeArenaActionWith1Shot({
    permissionContext: permission as PermissionMetadata,
    amountUSDC: "0",
    recipient: (process.env.NEXT_PUBLIC_ARENA_CONTRACT ?? defaultRecipient()) as `0x${string}`,
    chainId: (permission as PermissionMetadata).chainId,
    actionData: { battleId, action: "ENTER_BATTLE", agentId },
  });
  log({
    action: "ENTER_BATTLE",
    reason: enterDecision.reason,
    amountUSDC: "0",
    txHash: entryExecution.txHash,
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
    assignedSide,
    activePermission: permission,
    remainingBudgetUSDC: String(remainingOperatingBudgetUSDC(permission, spent)),
    researchAlreadyOwned: researchStore.listPurchasedBy(agentId),
    availableResearchArtifacts: availableArtifacts,
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
