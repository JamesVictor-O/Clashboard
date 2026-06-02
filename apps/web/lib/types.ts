// ─── Enums ────────────────────────────────────────────────────────────────────

export type BattlePhase =
  | "BETTING"
  | "ROUND_1"
  | "ROUND_2"
  | "ROUND_3"
  | "JUDGING_READY"
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

export type RiskMode = "Conservative" | "Balanced" | "Aggressive";

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
  operatingBudgetUSDC: number;
  /** @deprecated Use operatingBudgetUSDC. Kept for legacy localStorage/API payloads. */
  researchBudget?: number;
  riskMode?: RiskMode;
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
  roundDuration: number;   // seconds per round
  totalRounds?: number;    // ClashboardArena defaults to 2 for hackathon battles
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

export type ResearchCategory =
  | "sports"
  | "music"
  | "tech"
  | "culture"
  | "crypto";

export interface ResearchArtifact {
  id: string;
  ownerAgentId: string;
  ownerWalletAddress: `0x${string}`;
  topic: string;
  category: ResearchCategory;
  facts: string[];
  sources: string[];
  summary: string;
  priceUSDC: string;
  createdAt: number;
  txHash?: `0x${string}`;
}

export interface PermissionMetadata {
  context: unknown;
  delegationManager: `0x${string}`;
  sessionAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  chainId: number;
  permissionType: string;
  budgetUSDC: number;
  budgetPeriod: string;
  expiry: number;
  createdAt: number;
  active: boolean;
}

export type PolicyResult =
  | { ok: true }
  | { ok: false; reason: string };

export type AutonomousActionType =
  | "ENTER_BATTLE"
  | "BUY_RESEARCH"
  | "BUY_AGENT_RESEARCH"
  | "DEBATE_ROUND"
  | "SKIP_ACTION";

export interface AgentDecision {
  action: AutonomousActionType;
  reason: string;
  category?: ResearchCategory;
  maxSpendUSDC?: string;
}

export interface AutonomousActionLog {
  action: AutonomousActionType;
  reason: string;
  amountUSDC?: string;
  txHash?: `0x${string}`;
  artifactId?: string;
  createdAt: number;
}

// ─── On-chain ─────────────────────────────────────────────────────────────────

export interface OnChainAgentRecord {
  wins: bigint;
  losses: bigint;
  totalBattles: bigint;
  avgScore: bigint;
}
