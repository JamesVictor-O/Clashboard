import type { ResearchCategory, RiskMode } from "@/lib/types";

export type AutonomyMode = "off" | "assisted" | "autonomous";
export type OpponentRule = "any" | "higher_win_rate" | "lower_win_rate" | "same_category";

export interface AgentAutonomyPreferences {
  agentOwner: `0x${string}`;
  mode: AutonomyMode;
  riskMode: RiskMode;
  battleCategories: ResearchCategory[];
  maxArenaStakeUSDC: number;
  maxResearchSpendUSDC: number;
  dailyBattleLimit: number;
  autoCreateChallenges: boolean;
  autoAcceptChallenges: boolean;
  autoBetOnBattles: boolean;
  opponentRule: OpponentRule;
  minOpponentWinRate: number;
  maxOpponentWinRate: number;
  preferredBetSide: "agent" | "underdog" | "favorite";
  updatedAt: number;
}

export interface AutonomyCandidate {
  category: ResearchCategory;
  stakeUSDC: number;
  /** null when opponent win rate is unavailable — skips min/max/rule checks */
  opponentWinRate: number | null;
  agentWinRate: number;
  isOwnBattle?: boolean;
  intent?: "create" | "accept";
}

export type AutonomyPreferenceResult =
  | { ok: true }
  | { ok: false; reason: string };

const STORAGE_KEY = (address: string) =>
  `clashboard_autonomy_prefs_${address.toLowerCase()}`;

export const DEFAULT_AUTONOMY_PREFERENCES = {
  mode: "assisted",
  riskMode: "Balanced",
  battleCategories: ["sports", "music", "tech", "culture"],
  maxArenaStakeUSDC: 2,
  maxResearchSpendUSDC: 0.25,
  dailyBattleLimit: 3,
  autoCreateChallenges: false,
  autoAcceptChallenges: true,
  autoBetOnBattles: false,
  opponentRule: "any",
  minOpponentWinRate: 0,
  maxOpponentWinRate: 100,
  preferredBetSide: "agent",
} satisfies Omit<AgentAutonomyPreferences, "agentOwner" | "updatedAt">;

export function defaultAutonomyPreferences(
  agentOwner: `0x${string}`
): AgentAutonomyPreferences {
  return {
    ...DEFAULT_AUTONOMY_PREFERENCES,
    agentOwner,
    updatedAt: Date.now(),
  };
}

export function readAutonomyPreferences(
  agentOwner: `0x${string}`
): AgentAutonomyPreferences {
  if (typeof window === "undefined") return defaultAutonomyPreferences(agentOwner);

  try {
    const raw = localStorage.getItem(STORAGE_KEY(agentOwner));
    if (!raw) return defaultAutonomyPreferences(agentOwner);
    return normalizeAutonomyPreferences(JSON.parse(raw), agentOwner);
  } catch {
    return defaultAutonomyPreferences(agentOwner);
  }
}

export function saveAutonomyPreferences(
  prefs: AgentAutonomyPreferences
): AgentAutonomyPreferences {
  const normalized = normalizeAutonomyPreferences(prefs, prefs.agentOwner);
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY(normalized.agentOwner), JSON.stringify(normalized));
  }
  return normalized;
}

export function normalizeAutonomyPreferences(
  value: Partial<AgentAutonomyPreferences>,
  agentOwner: `0x${string}`
): AgentAutonomyPreferences {
  const categories = Array.isArray(value.battleCategories)
    ? value.battleCategories.filter(isResearchCategory)
    : DEFAULT_AUTONOMY_PREFERENCES.battleCategories;

  return {
    ...DEFAULT_AUTONOMY_PREFERENCES,
    ...value,
    agentOwner,
    mode: isMode(value.mode) ? value.mode : DEFAULT_AUTONOMY_PREFERENCES.mode,
    riskMode: isRiskMode(value.riskMode) ? value.riskMode : DEFAULT_AUTONOMY_PREFERENCES.riskMode,
    battleCategories: categories.length > 0 ? categories : DEFAULT_AUTONOMY_PREFERENCES.battleCategories,
    maxArenaStakeUSDC: clampNumber(value.maxArenaStakeUSDC, 0.1, 100, DEFAULT_AUTONOMY_PREFERENCES.maxArenaStakeUSDC),
    maxResearchSpendUSDC: clampNumber(value.maxResearchSpendUSDC, 0, 10, DEFAULT_AUTONOMY_PREFERENCES.maxResearchSpendUSDC),
    dailyBattleLimit: Math.round(clampNumber(value.dailyBattleLimit, 0, 50, DEFAULT_AUTONOMY_PREFERENCES.dailyBattleLimit)),
    minOpponentWinRate: clampNumber(value.minOpponentWinRate, 0, 100, DEFAULT_AUTONOMY_PREFERENCES.minOpponentWinRate),
    maxOpponentWinRate: clampNumber(value.maxOpponentWinRate, 0, 100, DEFAULT_AUTONOMY_PREFERENCES.maxOpponentWinRate),
    opponentRule: isOpponentRule(value.opponentRule) ? value.opponentRule : DEFAULT_AUTONOMY_PREFERENCES.opponentRule,
    preferredBetSide: value.preferredBetSide === "underdog" || value.preferredBetSide === "favorite"
      ? value.preferredBetSide
      : "agent",
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
  };
}

export function evaluateBattleEntryPreference(
  prefs: AgentAutonomyPreferences,
  candidate: AutonomyCandidate,
  battlesEnteredToday = 0
): AutonomyPreferenceResult {
  if (prefs.mode === "off") return { ok: false, reason: "Autonomy is off." };
  if (candidate.intent === "create" && !prefs.autoCreateChallenges) {
    return { ok: false, reason: "Autonomous challenge creation is disabled." };
  }
  if (candidate.intent !== "create" && !prefs.autoAcceptChallenges) {
    return { ok: false, reason: "Autonomous challenge acceptance is disabled." };
  }
  if (!prefs.battleCategories.includes(candidate.category)) {
    return { ok: false, reason: `Category ${candidate.category} is not enabled.` };
  }
  if (candidate.stakeUSDC > prefs.maxArenaStakeUSDC) {
    return { ok: false, reason: `Stake $${candidate.stakeUSDC} exceeds max $${prefs.maxArenaStakeUSDC}.` };
  }
  if (battlesEnteredToday >= prefs.dailyBattleLimit) {
    return { ok: false, reason: "Daily autonomous battle limit reached." };
  }
  if (candidate.isOwnBattle) {
    return { ok: false, reason: "Agent cannot enter or bet on its own battle." };
  }
  if (candidate.opponentWinRate !== null && candidate.opponentWinRate * 100 < prefs.minOpponentWinRate) {
    return { ok: false, reason: "Opponent win rate is below configured range." };
  }
  if (candidate.opponentWinRate !== null && candidate.opponentWinRate * 100 > prefs.maxOpponentWinRate) {
    return { ok: false, reason: "Opponent win rate is above configured range." };
  }
  if (prefs.opponentRule === "higher_win_rate" && candidate.opponentWinRate !== null && candidate.opponentWinRate <= candidate.agentWinRate) {
    return { ok: false, reason: "Configured to enter only against stronger agents." };
  }
  if (prefs.opponentRule === "lower_win_rate" && candidate.opponentWinRate !== null && candidate.opponentWinRate >= candidate.agentWinRate) {
    return { ok: false, reason: "Configured to enter only against lower win-rate agents." };
  }
  return { ok: true };
}

export function evaluateBetPreference(
  prefs: AgentAutonomyPreferences,
  candidate: AutonomyCandidate
): AutonomyPreferenceResult {
  if (prefs.mode !== "autonomous") return { ok: false, reason: "Betting requires autonomous mode." };
  if (!prefs.autoBetOnBattles) return { ok: false, reason: "Autonomous betting is disabled." };
  if (candidate.isOwnBattle) return { ok: false, reason: "Agent cannot bet on its own battle." };
  if (!prefs.battleCategories.includes(candidate.category)) {
    return { ok: false, reason: `Category ${candidate.category} is not enabled for betting.` };
  }
  if (candidate.stakeUSDC > prefs.maxArenaStakeUSDC) {
    return { ok: false, reason: `Bet $${candidate.stakeUSDC} exceeds max $${prefs.maxArenaStakeUSDC}.` };
  }
  return { ok: true };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isMode(value: unknown): value is AutonomyMode {
  return value === "off" || value === "assisted" || value === "autonomous";
}

function isRiskMode(value: unknown): value is RiskMode {
  return value === "Conservative" || value === "Balanced" || value === "Aggressive";
}

function isOpponentRule(value: unknown): value is OpponentRule {
  return value === "any" || value === "higher_win_rate" || value === "lower_win_rate" || value === "same_category";
}

function isResearchCategory(value: unknown): value is ResearchCategory {
  return value === "sports" || value === "music" || value === "tech" || value === "culture" || value === "crypto";
}
