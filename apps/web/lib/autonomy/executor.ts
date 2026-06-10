/**
 * Autonomous executor — the single entry point for all agent-triggered actions.
 *
 * Architecture:
 *   Venice decides action
 *   ↓
 *   routeExecutionMode() — determine how to execute
 *   ↓
 *   validatePolicy()    — check budget, permission, allowed contracts
 *   ↓
 *   [autonomous_oneshot]  → 1Shot + ERC-7710, no wallet popup
 *   [manual_batched]      → only when no active permission exists
 *   [manual_direct]       → last-resort legacy path
 *
 * Rules:
 *   - autonomous_oneshot: valid ERC-7715 permission exists
 *   - manual_batched: no active permission, so the user must sign manually
 *   - manual_direct: fallback when wallet_sendCalls unsupported
 *
 * The executor logs every execution for the demo visibility UI.
 */

import { validatePolicyWithBalance, recordSpend, type ActionType } from "./policy";
import { getPermissionContext } from "@/lib/permissions";
import { issueChallengeWith1Shot, acceptChallengeWith1Shot, placeBetWith1Shot } from "@/lib/oneshot/execute";
import type { OneShotExecuteResult } from "@/lib/oneshot/client";
import { ARENA_CONTRACT, HOTTAKEROOMS_CONTRACT } from "@/lib/contracts";

// ─── Execution modes ──────────────────────────────────────────────────────────

export type ExecutionMode =
  | "autonomous_oneshot"    // 1Shot + ERC-7710 — zero popups
  | "manual_batched_wallet" // EIP-5792 wallet_sendCalls — one popup
  | "manual_direct_wallet"; // sequential eth_sendTransaction — one popup per call

export interface ExecutionContext {
  agentOwner: `0x${string}`;
  actionType: ActionType;
  targetContract: `0x${string}`;
  amountUsdc: number;
  /** True when triggered by agent runtime (Venice/orchestrator), kept for logs/UI. */
  isAgentTriggered: boolean;
}

/**
 * Determine the correct execution mode for an action.
 *
 * autonomous_oneshot: active permission is valid, regardless of user or agent trigger
 * manual_batched_wallet: no permission — try EIP-5792 batch
 * manual_direct_wallet: wallet_sendCalls not available — sequential fallback
 */
export function routeExecutionMode(ctx: ExecutionContext): ExecutionMode {
  const perm = getPermissionContext(ctx.agentOwner);
  const nowSec = Math.floor(Date.now() / 1000);
  if (perm && perm.expiry > nowSec) {
    return "autonomous_oneshot";
  }

  // No active permission: this is the only time post-forge wallet signing is allowed.
  // The actual wallet call in sendUserBatch handles the batched vs direct
  // distinction internally; we return "manual_batched_wallet" and let it fall back.
  return "manual_batched_wallet";
}

// ─── Execution log ────────────────────────────────────────────────────────────

export interface ExecutionLogEntry {
  id: string;
  actionType: ActionType;
  agentOwner: `0x${string}`;
  targetContract: `0x${string}`;
  amountUsdc: number;
  mode: ExecutionMode;
  txHash?: `0x${string}`;
  prefundTxHash?: `0x${string}`;
  oneShotTaskId?: `0x${string}`;
  status: "pending" | "success" | "failed";
  reason?: string; // policy failure reason
  timestamp: number;
}

const executionLog: ExecutionLogEntry[] = [];

export function getExecutionLog(): ExecutionLogEntry[] {
  return [...executionLog]; // newest first
}

function pushLog(entry: ExecutionLogEntry): void {
  executionLog.unshift(entry);
  if (executionLog.length > 50) executionLog.pop(); // cap at 50 entries
}

function updateLog(id: string, patch: Partial<ExecutionLogEntry>): void {
  const index = executionLog.findIndex((entry) => entry.id === id);
  if (index === -1) {
    pushLog({ ...(patch as ExecutionLogEntry), id });
    return;
  }
  executionLog[index] = { ...executionLog[index], ...patch };
}

// ─── High-level execute functions ─────────────────────────────────────────────

export interface IssueChallengeExecuteParams {
  agentOwner: `0x${string}`;
  roomId: `0x${string}`;
  topicHash: `0x${string}`;
  topicPreview: string;
  categoryHash: `0x${string}`;
  stakeUsdc: number;
  isAgentTriggered: boolean;
}

/**
 * Execute an issueChallenge action through the correct path.
 *
 * Permission path: issueChallengeWith1Shot → HotTakeRooms.issueChallengeFor
 * Manual path:     only when no active permission exists.
 */
export async function executeIssueChallenge(
  params: IssueChallengeExecuteParams
): Promise<{ mode: ExecutionMode; result?: OneShotExecuteResult; policyError?: string }> {
  const hotTakeRooms = HOTTAKEROOMS_CONTRACT;
  const mode = routeExecutionMode({
    agentOwner: params.agentOwner,
    actionType: "ISSUE_CHALLENGE",
    targetContract: hotTakeRooms,
    amountUsdc: params.stakeUsdc,
    isAgentTriggered: params.isAgentTriggered,
  });

  const logEntry: ExecutionLogEntry = {
    id: `${Date.now()}-issue`,
    actionType: "ISSUE_CHALLENGE",
    agentOwner: params.agentOwner,
    targetContract: hotTakeRooms,
    amountUsdc: params.stakeUsdc,
    mode,
    status: "pending",
    timestamp: Date.now(),
  };

  if (mode === "autonomous_oneshot") {
    pushLog(logEntry);

    // Validate including wallet balance — USDC stays in wallet, no treasury needed
    const policy = await validatePolicyWithBalance({
      agentOwner: params.agentOwner,
      actionType: "ISSUE_CHALLENGE",
      targetContract: hotTakeRooms,
      amountUsdc: params.stakeUsdc,
    });

    if (!policy.ok) {
      updateLog(logEntry.id, { status: "failed", reason: policy.reason });
      return { mode, policyError: policy.reason };
    }

    const perm = getPermissionContext(params.agentOwner)!;
    try {
      const result = await issueChallengeWith1Shot({
        permissionContext: {
          context: perm.context,
          delegationManager: perm.delegationManager,
          sessionAddress: perm.sessionAddress,
          walletAddress: params.agentOwner,
          chainId: perm.chainId,
        },
        agentOwner: params.agentOwner,
        roomId: params.roomId,
        topicHash: params.topicHash,
        topicPreview: params.topicPreview,
        categoryHash: params.categoryHash,
        stakeWei: BigInt(Math.round(params.stakeUsdc * 1_000_000)),
      });

      recordSpend(params.agentOwner, params.stakeUsdc);
      updateLog(logEntry.id, {
        status: "success",
        txHash: result.txHash,
        prefundTxHash: result.prefundTxHash,
        oneShotTaskId: result.taskId,
      });
      return { mode, result };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "1Shot execution failed";
      updateLog(logEntry.id, { status: "failed", reason });
      throw err;
    }
  }
  pushLog({ ...logEntry, status: "pending" });
  return { mode };
}

export interface AcceptChallengeExecuteParams {
  agentOwner: `0x${string}`;
  roomId: `0x${string}`;
  battleId: `0x${string}`;
  stakeUsdc: number;
  bettingDuration?: bigint;
  roundDuration?: bigint;
  maxResearch?: bigint;
  isAgentTriggered: boolean;
}

/**
 * Execute an acceptChallenge action through the correct path.
 * Returns { mode: "autonomous_oneshot", result } if 1Shot was used,
 * or { mode: "manual_batched_wallet" } only when no active permission exists.
 */
export async function executeAcceptChallenge(
  params: AcceptChallengeExecuteParams
): Promise<{ mode: ExecutionMode; result?: OneShotExecuteResult; policyError?: string }> {
  const hotTakeRooms = HOTTAKEROOMS_CONTRACT;
  const mode = routeExecutionMode({
    agentOwner: params.agentOwner,
    actionType: "ACCEPT_CHALLENGE",
    targetContract: hotTakeRooms,
    amountUsdc: params.stakeUsdc,
    isAgentTriggered: params.isAgentTriggered,
  });

  const logEntry: ExecutionLogEntry = {
    id: `${Date.now()}-accept`,
    actionType: "ACCEPT_CHALLENGE",
    agentOwner: params.agentOwner,
    targetContract: hotTakeRooms,
    amountUsdc: params.stakeUsdc,
    mode,
    status: "pending",
    timestamp: Date.now(),
  };

  if (mode === "autonomous_oneshot") {
    pushLog(logEntry);

    // Validate including wallet balance — USDC stays in wallet, no treasury needed
    const policy = await validatePolicyWithBalance({
      agentOwner: params.agentOwner,
      actionType: "ACCEPT_CHALLENGE",
      targetContract: hotTakeRooms,
      amountUsdc: params.stakeUsdc,
    });

    if (!policy.ok) {
      updateLog(logEntry.id, { status: "failed", reason: policy.reason });
      return { mode, policyError: policy.reason };
    }

    const perm = getPermissionContext(params.agentOwner)!;
    try {
      const result = await acceptChallengeWith1Shot({
        permissionContext: {
          context: perm.context,
          delegationManager: perm.delegationManager,
          sessionAddress: perm.sessionAddress,
          walletAddress: params.agentOwner,
          chainId: perm.chainId,
        },
        agentOwner: params.agentOwner,
        roomId: params.roomId,
        battleId: params.battleId,
        bettingDuration: params.bettingDuration ?? 300n,
        roundDuration: params.roundDuration ?? 120n,
        maxResearch: params.maxResearch ?? 1_000_000n,
        // stakeWei read from room before bundle construction
        stakeWei: BigInt(Math.round(params.stakeUsdc * 1_000_000)),
      });

      recordSpend(params.agentOwner, params.stakeUsdc);
      updateLog(logEntry.id, {
        status: "success",
        txHash: result.txHash,
        prefundTxHash: result.prefundTxHash,
        oneShotTaskId: result.taskId,
      });
      return { mode, result };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "1Shot execution failed";
      updateLog(logEntry.id, { status: "failed", reason });
      throw err;
    }
  }

  pushLog({ ...logEntry, status: "pending" });
  return { mode };
}

export interface PlaceBetExecuteParams {
  agentOwner: `0x${string}`;
  battleId: `0x${string}`;
  side: 1 | 2;
  amountUsdc: number;
  isAgentTriggered: boolean;
}

/**
 * Execute an arena stake through 1Shot whenever the released fighter has budget.
 * Manual wallet staking is only a no-permission fallback.
 */
export async function executePlaceBet(
  params: PlaceBetExecuteParams
): Promise<{ mode: ExecutionMode; result?: OneShotExecuteResult; policyError?: string }> {
  const arena = ARENA_CONTRACT;
  const mode = routeExecutionMode({
    agentOwner: params.agentOwner,
    actionType: "PLACE_BET",
    targetContract: arena,
    amountUsdc: params.amountUsdc,
    isAgentTriggered: params.isAgentTriggered,
  });

  const logEntry: ExecutionLogEntry = {
    id: `${Date.now()}-bet`,
    actionType: "PLACE_BET",
    agentOwner: params.agentOwner,
    targetContract: arena,
    amountUsdc: params.amountUsdc,
    mode,
    status: "pending",
    timestamp: Date.now(),
  };

  if (mode === "autonomous_oneshot") {
    pushLog(logEntry);

    const policy = await validatePolicyWithBalance({
      agentOwner: params.agentOwner,
      actionType: "PLACE_BET",
      targetContract: arena,
      amountUsdc: params.amountUsdc,
    });

    if (!policy.ok) {
      updateLog(logEntry.id, { status: "failed", reason: policy.reason });
      return { mode, policyError: policy.reason };
    }

    const perm = getPermissionContext(params.agentOwner)!;
    try {
      const result = await placeBetWith1Shot({
        permissionContext: {
          context: perm.context,
          delegationManager: perm.delegationManager,
          sessionAddress: perm.sessionAddress,
          walletAddress: params.agentOwner,
          chainId: perm.chainId,
        },
        agentOwner: params.agentOwner,
        battleId: params.battleId,
        side: params.side,
        amountWei: BigInt(Math.round(params.amountUsdc * 1_000_000)),
      });

      recordSpend(params.agentOwner, params.amountUsdc);
      updateLog(logEntry.id, {
        status: "success",
        txHash: result.txHash,
        prefundTxHash: result.prefundTxHash,
        oneShotTaskId: result.taskId,
      });
      return { mode, result };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "1Shot execution failed";
      updateLog(logEntry.id, { status: "failed", reason });
      throw err;
    }
  }

  pushLog({ ...logEntry, status: "pending" });
  return { mode };
}
