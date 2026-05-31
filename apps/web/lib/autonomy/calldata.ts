/**
 * Calldata builders for delegated-aware contract functions.
 *
 * Every builder returns an array of OneShotCall objects representing an atomic
 * 1Shot bundle. No wallet signer involved — pure ABI encoding.
 *
 * ERC-7715 wallet-level spending model:
 *   Because issueChallengeFor / acceptChallengeFor now pull USDC directly from
 *   agentOwner's wallet (not AgentTreasury), each bundle includes a USDC.approve
 *   call as the first element. The DelegationManager executes the full bundle from
 *   the user's smart account context, so:
 *     call 1: USDC.approve(hotTakeRooms, stake)  ← smart account grants allowance
 *     call 2: issueChallengeFor(agentOwner, ...)  ← transferFrom(agentOwner) succeeds
 *
 *   This mirrors exactly how buildPlaceBetCall works and how sendAutonomousBatch
 *   already handles placeBet in game-lobby.
 *
 *   Delegated-aware functions (HotTakeRooms):
 *     issueChallengeFor(agentOwner, roomId, topicHash, topicPreview, categoryHash, stake)
 *     acceptChallengeFor(agentOwner, roomId, battleId, bettingDuration, roundDuration, maxResearch)
 *
 *   Delegated-aware functions (ClashboardArena):
 *     placeBetFor(bettor, battleId, side, amount)
 */

import { encodeFunctionData, parseAbi, type Hex } from "viem";
import type { OneShotCall } from "@/lib/oneshot/client";

// ─── ABI fragments ────────────────────────────────────────────────────────────

const HOTTAKEROOMS_DELEGATED_ABI = parseAbi([
  "function issueChallengeFor(address agentOwner, bytes32 roomId, bytes32 topicHash, string topicPreview, bytes32 categoryHash, uint256 stake) external",
  "function acceptChallengeFor(address agentOwner, bytes32 roomId, bytes32 battleId, uint256 bettingDuration, uint256 roundDuration, uint256 maxResearch) external",
]);

const ARENA_ABI_FRAGMENT = parseAbi([
  "function placeBetFor(address bettor, bytes32 battleId, uint8 side, uint256 amount) external",
]);

const ERC20_ABI_FRAGMENT = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
]);

// ─── Builders ─────────────────────────────────────────────────────────────────

interface IssueChallengeForParams {
  agentOwner: `0x${string}`;
  roomId: `0x${string}`;
  topicHash: `0x${string}`;
  topicPreview: string;
  categoryHash: `0x${string}`;
  stakeWei: bigint;
}

/**
 * Build the 1Shot bundle for HotTakeRooms.issueChallengeFor.
 *
 * Returns two calls:
 *   [0] USDC.approve(hotTakeRooms, stake)  — smart account grants allowance
 *   [1] issueChallengeFor(agentOwner, ...) — transferFrom(agentOwner) pulls stake
 *
 * Both calls execute atomically from the user's smart account via ERC-7710 delegation.
 * The ERC-7715 erc20-token-periodic caveat validates the total USDC amount.
 * No AgentTreasury deposit required — funds come from the user's wallet.
 */
export function buildIssueChallengeForCall(
  params: IssueChallengeForParams
): OneShotCall[] {
  const hotTakeRooms = process.env.NEXT_PUBLIC_HOTTAKEROOMS_CONTRACT as `0x${string}`;
  if (!hotTakeRooms) throw new Error("NEXT_PUBLIC_HOTTAKEROOMS_CONTRACT not set");

  const approveCall = buildApproveCall(hotTakeRooms, params.stakeWei);

  const challengeCall: OneShotCall = {
    to: hotTakeRooms,
    data: encodeFunctionData({
      abi: HOTTAKEROOMS_DELEGATED_ABI,
      functionName: "issueChallengeFor",
      args: [
        params.agentOwner,
        params.roomId,
        params.topicHash,
        params.topicPreview,
        params.categoryHash,
        params.stakeWei,
      ],
    }) as Hex,
  };

  return [approveCall, challengeCall];
}

interface AcceptChallengeForParams {
  agentOwner: `0x${string}`;
  roomId: `0x${string}`;
  battleId: `0x${string}`;
  bettingDuration: bigint;
  roundDuration: bigint;
  maxResearch: bigint;
  /** room.stake read off-chain via getRoom(roomId) before bundle construction */
  stakeWei: bigint;
}

/**
 * Build the 1Shot bundle for HotTakeRooms.acceptChallengeFor.
 *
 * Returns two calls:
 *   [0] USDC.approve(hotTakeRooms, stake)   — smart account grants allowance
 *   [1] acceptChallengeFor(agentOwner, ...)  — transferFrom(agentOwner) pulls stake
 *
 * stakeWei must match room.stake exactly (read via getRoom(roomId) before building).
 * No AgentTreasury required — USDC comes from the user's wallet.
 */
export function buildAcceptChallengeForCall(
  params: AcceptChallengeForParams
): OneShotCall[] {
  const hotTakeRooms = process.env.NEXT_PUBLIC_HOTTAKEROOMS_CONTRACT as `0x${string}`;
  if (!hotTakeRooms) throw new Error("NEXT_PUBLIC_HOTTAKEROOMS_CONTRACT not set");

  const approveCall = buildApproveCall(hotTakeRooms, params.stakeWei);

  const acceptCall: OneShotCall = {
    to: hotTakeRooms,
    data: encodeFunctionData({
      abi: HOTTAKEROOMS_DELEGATED_ABI,
      functionName: "acceptChallengeFor",
      args: [
        params.agentOwner,
        params.roomId,
        params.battleId,
        params.bettingDuration,
        params.roundDuration,
        params.maxResearch,
      ],
    }) as Hex,
  };

  return [approveCall, acceptCall];
}

interface PlaceBetParams {
  agentOwner: `0x${string}`;
  battleId: `0x${string}`;
  side: 1 | 2;
  amountWei: bigint;
}

/**
 * Build calldata for ClashboardArena.placeBetFor, preceded by USDC.approve.
 *
 * Returns an array: [approveCall, placeBetForCall].
 * 1Shot executes them atomically as a batch.
 */
export function buildPlaceBetCall(params: PlaceBetParams): OneShotCall[] {
  const arenaAddress = process.env.NEXT_PUBLIC_ARENA_CONTRACT as `0x${string}`;
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;
  if (!arenaAddress) throw new Error("NEXT_PUBLIC_ARENA_CONTRACT not set");
  if (!usdcAddress) throw new Error("NEXT_PUBLIC_USDC_ADDRESS not set");

  const approveCall: OneShotCall = {
    to: usdcAddress,
    data: encodeFunctionData({
      abi: ERC20_ABI_FRAGMENT,
      functionName: "approve",
      args: [arenaAddress, params.amountWei],
    }) as Hex,
  };

  const betCall: OneShotCall = {
    to: arenaAddress,
    data: encodeFunctionData({
      abi: ARENA_ABI_FRAGMENT,
      functionName: "placeBetFor",
      args: [params.agentOwner, params.battleId, params.side, params.amountWei],
    }) as Hex,
  };

  return [approveCall, betCall];
}

/**
 * Build a raw USDC approve call for any spender.
 * Useful when batching arbitrary actions that need an allowance.
 */
export function buildApproveCall(
  spender: `0x${string}`,
  amountWei: bigint
): OneShotCall {
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;
  if (!usdcAddress) throw new Error("NEXT_PUBLIC_USDC_ADDRESS not set");

  return {
    to: usdcAddress,
    data: encodeFunctionData({
      abi: ERC20_ABI_FRAGMENT,
      functionName: "approve",
      args: [spender, amountWei],
    }) as Hex,
  };
}
