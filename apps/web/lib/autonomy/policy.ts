/**
 * Policy engine — validates every autonomous action before calling 1Shot.
 *
 * Rule: Venice decides. Policy validates. 1Shot executes.
 *
 * The policy engine is the gatekeeper between agent intent and on-chain execution.
 * It prevents out-of-budget or out-of-scope actions from reaching 1Shot.
 *
 * ERC-7715 wallet-level spending model:
 *   USDC stays in the user's wallet until 1Shot executes the bundle.
 *   AgentTreasury is NOT required for autonomous staking.
 *   Policy checks wallet USDC balance directly.
 *
 * Checks performed (in order):
 *   1. Permission exists and is not expired
 *   2. Action type is in the allowed set for this permission
 *   3. Target contract is allowed
 *   4. Requested USDC amount is within the remaining daily budget
 *   5. User wallet has sufficient USDC balance (async variant)
 */

import { getPermissionContext } from "@/lib/permissions";
import { getPublicClient } from "@/lib/chain";
import { parseAbi } from "viem";
import { ARENA_CONTRACT, HOTTAKEROOMS_CONTRACT, USDC_ADDRESS } from "@/lib/contracts";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionType =
  | "ISSUE_CHALLENGE"
  | "ACCEPT_CHALLENGE"
  | "PLACE_BET"
  | "BUY_RESEARCH"
  | "AGENT_RESEARCH";

export type PolicyResult =
  | { ok: true }
  | { ok: false; reason: string };

export interface PolicyParams {
  agentOwner: `0x${string}`;
  actionType: ActionType;
  targetContract: `0x${string}`;
  amountUsdc: number; // human-readable (e.g. 1.5 for $1.50)
}

// ─── Allowed action / contract registry ──────────────────────────────────────

const ALLOWED_ACTIONS: Set<ActionType> = new Set([
  "ISSUE_CHALLENGE",
  "ACCEPT_CHALLENGE",
  "PLACE_BET",
  "BUY_RESEARCH",
  "AGENT_RESEARCH",
]);

function getAllowedContracts(): Set<string> {
  const contracts = new Set<string>();
  const arena = ARENA_CONTRACT;
  const rooms = HOTTAKEROOMS_CONTRACT;
  if (arena) contracts.add(arena.toLowerCase());
  if (rooms) contracts.add(rooms.toLowerCase());
  return contracts;
}

// ─── Budget tracking (in-memory per session) ─────────────────────────────────
// TODO(persistence): persist budget spend to a server-side store or on-chain
// counter so it survives page refreshes and multi-device sessions.

const dailySpendTracker = new Map<string, { date: string; spent: number }>();

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getDailySpent(agentOwner: string): number {
  const entry = dailySpendTracker.get(agentOwner.toLowerCase());
  if (!entry || entry.date !== getTodayKey()) return 0;
  return entry.spent;
}

export function recordSpend(agentOwner: string, amountUsdc: number): void {
  const key = agentOwner.toLowerCase();
  const today = getTodayKey();
  const entry = dailySpendTracker.get(key);
  if (!entry || entry.date !== today) {
    dailySpendTracker.set(key, { date: today, spent: amountUsdc });
  } else {
    entry.spent += amountUsdc;
  }
}

// ─── Policy validation ────────────────────────────────────────────────────────

/**
 * Validate an autonomous action against the stored ERC-7715 permission.
 * Returns { ok: true } if all checks pass, or { ok: false, reason } if any fail.
 *
 * Must be called before issueChallengeWith1Shot / acceptChallengeWith1Shot / etc.
 */
export function validatePolicy(params: PolicyParams): PolicyResult {
  const { agentOwner, actionType, targetContract, amountUsdc } = params;

  // ── 1. Permission must exist ──────────────────────────────────────────────
  const perm = getPermissionContext(agentOwner);
  if (!perm) {
    return { ok: false, reason: "No active ERC-7715 permission. Release your fighter first." };
  }

  // ── 2. Permission must not be expired ────────────────────────────────────
  const nowSec = Math.floor(Date.now() / 1000);
  if (perm.expiry <= nowSec) {
    return {
      ok: false,
      reason: `Permission expired ${Math.round((nowSec - perm.expiry) / 60)} minutes ago. Re-release your fighter.`,
    };
  }

  // ── 3. Action type must be allowed ───────────────────────────────────────
  if (!ALLOWED_ACTIONS.has(actionType)) {
    return { ok: false, reason: `Action type '${actionType}' is not permitted.` };
  }

  // ── 4. Target contract must be allowed ───────────────────────────────────
  const allowedContracts = getAllowedContracts();
  if (!allowedContracts.has(targetContract.toLowerCase())) {
    return {
      ok: false,
      reason: `Target contract ${targetContract} is not in the allowed list.`,
    };
  }

  // ── 5. Amount must be within daily budget ────────────────────────────────
  const dailyBudget = perm.budgetUSDC;
  const alreadySpent = getDailySpent(agentOwner);
  const remaining = dailyBudget - alreadySpent;

  if (amountUsdc > remaining) {
    return {
      ok: false,
      reason: `Amount $${amountUsdc.toFixed(2)} exceeds remaining daily budget $${remaining.toFixed(2)} (limit: $${dailyBudget}/day).`,
    };
  }

  return { ok: true };
}

/**
 * Full policy check including on-chain wallet USDC balance.
 *
 * Use this before all autonomous actions — USDC stays in the user's wallet
 * (no AgentTreasury required), so we verify the wallet can cover the spend
 * before calling 1Shot.
 *
 * Failure modes returned (not thrown):
 *   "No active ERC-7715 permission."     — user must re-release fighter
 *   "Permission expired."                — user must re-release fighter
 *   "Action type not permitted."         — agent runtime bug
 *   "Target contract not allowed."       — agent runtime bug
 *   "Daily budget exceeded."             — wait for reset or reduce amount
 *   "Insufficient USDC in user wallet."  — user must fund wallet
 */
export async function validatePolicyWithBalance(
  params: PolicyParams
): Promise<PolicyResult> {
  const base = validatePolicy(params);
  if (!base.ok) return base;

  const usdcAddress = USDC_ADDRESS;
  if (!usdcAddress) return base; // env not set — skip balance check in CI/test

  try {
    const client = getPublicClient();
    const balance = (await client.readContract({
      address: usdcAddress,
      abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
      functionName: "balanceOf",
      args: [params.agentOwner],
    })) as bigint;

    const walletBalanceUsdc = Number(balance) / 1e6;
    if (walletBalanceUsdc < params.amountUsdc) {
      return {
        ok: false,
        reason: `Insufficient USDC in user wallet: have $${walletBalanceUsdc.toFixed(2)}, need $${params.amountUsdc.toFixed(2)}. Fund your wallet — no treasury deposit required.`,
      };
    }
  } catch {
    // RPC unreachable — warn but don't block; 1Shot will revert if balance truly insufficient
    console.warn("[policy] Could not verify wallet USDC balance, proceeding.");
  }

  return { ok: true };
}
