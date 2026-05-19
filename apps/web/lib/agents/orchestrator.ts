import { streamCompletion } from "@/lib/venice";
import { getPersona } from "@/lib/agents/personas";
import { createX402Client } from "@/lib/payments/x402client";
import type {
  Battle,
  AgentConfig,
  Round,
  ResearchPurchase,
  PersonalityType,
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
