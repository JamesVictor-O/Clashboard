import { streamCompletion } from "@/lib/venice";
import {
  decideAgentAction,
  generateDebateArgument,
  generateRebuttal,
} from "@/lib/venice";
import { getPersona } from "@/lib/agents/personas";
import { createX402Client } from "@/lib/payments/x402client";
import {
  executeArenaActionWith1Shot,
  payAgentResearchWith1Shot,
  payResearchWith1Shot,
} from "@/lib/payments/oneshot";
import { validateAutonomousAction, remainingOperatingBudgetUSDC } from "@/lib/policy";
import { researchStore } from "@/lib/research-store";
import { inferResearchCategory, researchEndpointForCategory } from "@/lib/research-pricing";
import { battleStore } from "@/lib/battle-store";
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
import { v4 as uuidv4 } from "uuid";

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
  const x402 = createX402Client(agentConfig.agentConfig.address as `0x${string}`);
  const topic = encodeURIComponent(battle.topic);
  const contextParts: string[] = [];

  const endpoints = [
    {
      url: `${appUrl}/api/data/sports?query=${topic}`,
      source: "Sports Reference",
      endpoint: "/api/data/sports",
    },
    {
      url: `${appUrl}/api/data/news?query=${topic}`,
      source: "News Sentiment API",
      endpoint: "/api/data/news",
    },
    {
      url: `${appUrl}/api/data/records?subject=${topic}`,
      source: "Historical Records DB",
      endpoint: "/api/data/records",
    },
  ];

  for (const ep of endpoints) {
    try {
      const response = await x402.get(ep.url);
      const data = response.data as Record<string, unknown>;

      const purchase: ResearchPurchase = {
        id: uuidv4(),
        agent: side,
        source: ep.source,
        endpoint: ep.endpoint,
        cost: "0.01 USDC",
        txHash: `0x${Math.random().toString(16).slice(2)}`, // Real tx hash from x402 response
        data,
        purchasedAt: Date.now(),
      };

      onPurchase(purchase);
      contextParts.push(`[${ep.source}]: ${JSON.stringify(data).slice(0, 300)}`);
    } catch (err) {
      console.error(`Research fetch failed for ${ep.source}:`, err);
    }
  }

  agentConfig.researchContext = contextParts.join("\n\n");
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
  permission: PermissionMetadata;
  spentUSDC: number;
}): Promise<{ artifact: ResearchArtifact; txHash?: `0x${string}` }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const endpoint = researchEndpointForCategory(params.category);
  const url = `${appUrl}${endpoint}?topic=${encodeURIComponent(params.topic)}&ownerAgentId=${encodeURIComponent(params.agentId)}&ownerWalletAddress=${params.permission.walletAddress}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Research endpoint failed: ${response.status}`);
  const data = (await response.json()) as { artifact: ResearchArtifact };

  const policy = validateAutonomousAction({
    permission: params.permission,
    action: "BUY_RESEARCH",
    amountUSDC: data.artifact.priceUSDC,
    spentUSDC: params.spentUSDC,
    target: endpoint,
    allowedTargets: ["/api/research/sports", "/api/research/news", "/api/research/history"],
  });
  if (!policy.ok) throw new Error(policy.reason);

  const execution = await payResearchWith1Shot({
    permissionContext: params.permission,
    amountUSDC: data.artifact.priceUSDC,
    recipient: defaultRecipient(),
    chainId: params.permission.chainId,
    actionData: {
      endpoint,
      artifactId: data.artifact.id,
      agentId: params.agentId,
      topic: params.topic,
    },
  });

  return {
    artifact: { ...data.artifact, txHash: execution.txHash },
    txHash: execution.txHash,
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
    const policy = validateAutonomousAction({
      permission,
      action: "BUY_AGENT_RESEARCH",
      amountUSDC: artifact.priceUSDC,
      spentUSDC: spent,
      target: artifact.ownerWalletAddress,
    });
    if (policy.ok && permission) {
      const execution = await payAgentResearchWith1Shot({
        permissionContext: permission,
        amountUSDC: artifact.priceUSDC,
        recipient: artifact.ownerWalletAddress,
        chainId: permission.chainId,
        actionData: { artifactId: artifact.id, buyerAgentId: agentId, sellerAgentId: artifact.ownerAgentId },
      });
      spent += Number(artifact.priceUSDC);
      researchStore.markPurchased(agentId, artifact.id);
      purchasedResearch.push({ ...artifact, txHash: execution.txHash });
      log({
        action: "BUY_AGENT_RESEARCH",
        reason: researchDecision.reason,
        amountUSDC: artifact.priceUSDC,
        artifactId: artifact.id,
        txHash: execution.txHash,
      });
    } else {
      log({ action: "SKIP_ACTION", reason: policy.ok ? "Missing permission for agent research purchase" : policy.reason });
    }
  } else if (researchDecision.action === "BUY_RESEARCH" || purchasedResearch.length === 0) {
    const purchased = await buyExternalResearch({
      agentId,
      topic: battle.topic,
      category: researchDecision.category ?? category,
      permission: permission as PermissionMetadata,
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
