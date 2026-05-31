/**
 * Action-specific 1Shot execution functions.
 *
 * Each function:
 *   1. Accepts typed parameters.
 *   2. Builds the calldata for the target contract function.
 *   3. Calls execute1Shot with the permission context.
 *   4. Returns a typed result including txHash for logging.
 *
 * These functions are called by lib/autonomy/executor.ts AFTER policy validation.
 * They should never be called directly without a policy check.
 */

import { execute1Shot, type OneShotPermissionContext, type OneShotExecuteResult } from "./client";
import {
  buildIssueChallengeForCall,
  buildAcceptChallengeForCall,
  buildPlaceBetCall,
} from "@/lib/autonomy/calldata";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IssueChallengeParams {
  permissionContext: OneShotPermissionContext;
  agentOwner: `0x${string}`;
  roomId: `0x${string}`;
  topicHash: `0x${string}`;
  topicPreview: string;
  categoryHash: `0x${string}`;
  stakeWei: bigint;
}

export interface AcceptChallengeParams {
  permissionContext: OneShotPermissionContext;
  agentOwner: `0x${string}`;
  roomId: `0x${string}`;
  battleId: `0x${string}`;
  bettingDuration: bigint;
  roundDuration: bigint;
  maxResearch: bigint;
  /** room.stake read off-chain before building the bundle */
  stakeWei: bigint;
}

export interface PlaceBetParams {
  permissionContext: OneShotPermissionContext;
  agentOwner: `0x${string}`;
  battleId: `0x${string}`;
  side: 1 | 2;
  amountWei: bigint;
}

// ─── Executors ────────────────────────────────────────────────────────────────

/**
 * Issue a challenge autonomously via 1Shot.
 * Calls HotTakeRooms.issueChallengeFor(agentOwner, ...) through DelegationManager.
 * USDC stays in the user's wallet until the 1Shot bundle executes.
 */
export async function issueChallengeWith1Shot(
  params: IssueChallengeParams
): Promise<OneShotExecuteResult> {
  // Bundle: [USDC.approve(hotTakeRooms, stake), issueChallengeFor(agentOwner, ...)]
  // USDC stays in wallet until execution — no AgentTreasury required.
  const calls = buildIssueChallengeForCall(params);
  return execute1Shot({
    permissionContext: params.permissionContext,
    chainId: params.permissionContext.chainId,
    calls,
    actionType: "ISSUE_CHALLENGE",
    metadata: {
      agentOwner: params.agentOwner,
      roomId: params.roomId,
      topicPreview: params.topicPreview,
      stakeUsdc: Number(params.stakeWei) / 1e6,
    },
    memo: `Issue Clashboard challenge ${params.roomId}`,
  });
}

/**
 * Accept a challenge autonomously via 1Shot.
 * Calls HotTakeRooms.acceptChallengeFor(agentOwner, ...) through DelegationManager.
 * USDC stays in the user's wallet until the 1Shot bundle executes.
 */
export async function acceptChallengeWith1Shot(
  params: AcceptChallengeParams
): Promise<OneShotExecuteResult> {
  // Bundle: [USDC.approve(hotTakeRooms, room.stake), acceptChallengeFor(agentOwner, ...)]
  // stakeWei = room.stake read off-chain via getRoom(roomId) before calling this.
  const calls = buildAcceptChallengeForCall(params);
  return execute1Shot({
    permissionContext: params.permissionContext,
    chainId: params.permissionContext.chainId,
    calls,
    actionType: "ACCEPT_CHALLENGE",
    metadata: {
      agentOwner: params.agentOwner,
      roomId: params.roomId,
      battleId: params.battleId,
      stakeUsdc: Number(params.stakeWei) / 1e6,
    },
    memo: `Accept Clashboard challenge ${params.roomId}`,
  });
}

/**
 * Place a bet autonomously via 1Shot.
 * Calls ClashboardArena.placeBetFor(agentOwner, battleId, side, amount)
 * through the authorized 1Shot relayer target.
 * USDC approval + bet are batched atomically — no wallet popup.
 */
export async function placeBetWith1Shot(
  params: PlaceBetParams
): Promise<OneShotExecuteResult> {
  const calls = buildPlaceBetCall(params);
  return execute1Shot({
    permissionContext: params.permissionContext,
    chainId: params.permissionContext.chainId,
    calls,
    actionType: "PLACE_BET",
    metadata: {
      agentOwner: params.agentOwner,
      battleId: params.battleId,
      side: params.side,
      amountUsdc: Number(params.amountWei) / 1e6,
    },
    memo: `Place Clashboard arena stake on ${params.battleId}`,
  });
}
