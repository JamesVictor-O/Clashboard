import type {
  AutonomousActionType,
  PermissionMetadata,
  PolicyResult,
} from "@/lib/types";

const ALLOWED_ACTIONS: AutonomousActionType[] = [
  "ENTER_BATTLE",
  "BUY_RESEARCH",
  "BUY_AGENT_RESEARCH",
  "DEBATE_ROUND",
  "SKIP_ACTION",
];

const DEFAULT_DAILY_BATTLE_LIMIT = 5;

export interface PolicyCheckInput {
  permission: PermissionMetadata | null | undefined;
  action: AutonomousActionType;
  amountUSDC?: string | number;
  spentUSDC?: string | number;
  target?: string;
  allowedTargets?: string[];
  battlesEnteredToday?: number;
  dailyBattleLimit?: number;
}

function toNumber(value: string | number | undefined): number {
  if (value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function targetAllowed(target: string | undefined, allowedTargets?: string[]) {
  if (!target || !allowedTargets?.length) return true;
  const normalized = target.toLowerCase();
  return allowedTargets.some((allowed) => normalized === allowed.toLowerCase());
}

export function validateAutonomousAction(input: PolicyCheckInput): PolicyResult {
  const { permission, action } = input;
  if (!permission) return { ok: false, reason: "No active operating budget permission found" };
  if (!permission.active) return { ok: false, reason: "Operating budget permission is inactive" };
  if (!ALLOWED_ACTIONS.includes(action)) return { ok: false, reason: `Action not allowed: ${action}` };

  const now = Math.floor(Date.now() / 1000);
  if (permission.expiry <= now) return { ok: false, reason: "Operating budget permission has expired" };

  const requested = toNumber(input.amountUSDC);
  const spent = toNumber(input.spentUSDC);
  if (!Number.isFinite(requested) || requested < 0) {
    return { ok: false, reason: "Requested amount is invalid" };
  }
  if (!Number.isFinite(spent) || spent < 0) {
    return { ok: false, reason: "Spent budget amount is invalid" };
  }

  const remaining = permission.budgetUSDC - spent;
  if (requested > remaining) {
    return { ok: false, reason: "Requested amount exceeds remaining operating budget" };
  }

  if (!targetAllowed(input.target, input.allowedTargets)) {
    return { ok: false, reason: "Target contract or endpoint is not allowed" };
  }

  if (
    action === "ENTER_BATTLE" &&
    (input.battlesEnteredToday ?? 0) >= (input.dailyBattleLimit ?? DEFAULT_DAILY_BATTLE_LIMIT)
  ) {
    return { ok: false, reason: "Daily demo arena action limit reached" };
  }

  // TODO(hackathon): wire a USDC balance helper here once the agent wallet
  // balance source is finalized. The policy shape already supports this check.
  return { ok: true };
}

export function remainingOperatingBudgetUSDC(
  permission: PermissionMetadata | null | undefined,
  spentUSDC: string | number = 0
): number {
  if (!permission) return 0;
  return Math.max(0, permission.budgetUSDC - toNumber(spentUSDC));
}
