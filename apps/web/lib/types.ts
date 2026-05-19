// ─── Enums ────────────────────────────────────────────────────────────────────

export type BattlePhase =
  | "BETTING"
  | "RESEARCH"
  | "LIVE"
  | "VERDICT"
  | "SETTLED";

export type BattleState = "OPEN" | "LIVE" | "SETTLED";

// ─── Agent ────────────────────────────────────────────────────────────────────

export type PersonalityType =
  | "Historian"
  | "Analyst"
  | "Roaster"
  | "Contrarian"
  | "Professor"
  | "Hype Man";

export type FightingStyle =
  | "Methodical"
  | "Aggressive"
  | "Witty"
  | "Defensive"
  | "Balanced";

/** Lightweight agent reference used in battle context */
export interface Agent {
  address: string;
  name: string;
  personality: PersonalityType;
  color: string;
  winRate: number;
  totalBattles: number;
}

/** Full agent configuration (stored server-side, tied to wallet) */
export interface AgentConfig {
  address: string;
  name: string;
  personality: PersonalityType;
  customInstructions?: string;
  specialties: string[];
  fightingStyle: FightingStyle;
  researchBudget: number; // USD
  color: string;
}

// ─── Battle ───────────────────────────────────────────────────────────────────

export interface Battle {
  id: string;
  topic: string;
  agentA: Agent;
  agentB: Agent;
  state: BattleState;
  poolA: bigint;
  poolB: bigint;
  bettingDeadline: bigint;
  rubricHash: string;
  winner: string | null;
  bettorCount?: number;
  createdAt: number;
  researchPurchases?: ResearchPurchase[];
}

// ─── Betting ──────────────────────────────────────────────────────────────────

export interface Bet {
  side: 1 | 2;
  amount: bigint; // USDC 6-decimal
  bettorAddress: string;
  txHash?: string;
  placedAt: number;
}

// ─── Debate ───────────────────────────────────────────────────────────────────

export interface Round {
  index: number;
  agentAText: string;
  agentBText: string;
  timestamp: number;
}

export interface DebateScores {
  accuracy: number; // 0–100
  wit: number;      // 0–100
  rebuttal: number; // 0–100
}

// ─── Judge ────────────────────────────────────────────────────────────────────

export interface JudgeResult {
  winner: "A" | "B";
  scores: DebateScores;
  bestLine: string;
  reasoning: string;
  confidence: number; // 0–1
}

// ─── Research / x402 ─────────────────────────────────────────────────────────

export interface ResearchPurchase {
  id: string;
  agent: "A" | "B";
  source: string;
  endpoint: string;
  cost: string; // human-readable, e.g. "0.01 USDC"
  txHash: string;
  data: Record<string, unknown>;
  purchasedAt: number;
}

// ─── On-chain ─────────────────────────────────────────────────────────────────

export interface OnChainAgentRecord {
  wins: bigint;
  losses: bigint;
  totalBattles: bigint;
  avgScore: bigint;
}
