/**
 * Calldata builders for delegated-aware contract functions.
 *
 * Every builder returns an array of OneShotCall objects representing an atomic
 * 1Shot bundle. No wallet signer involved — pure ABI encoding.
 *
 * ERC-7715 wallet-level spending model:
 *   The erc20-token-periodic permission authorizes ERC-20 transfers, not
 *   approvals or arbitrary contract calls. These builders return only the USDC
 *   prefund transfer. The backend calls the contract action after 1Shot confirms.
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
import { ARENA_CONTRACT, HOTTAKEROOMS_CONTRACT, USDC_ADDRESS } from "@/lib/contracts";

// ─── ABI fragments ────────────────────────────────────────────────────────────

const ERC20_ABI_FRAGMENT = parseAbi([
  "function transfer(address to, uint256 amount) external returns (bool)",
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
 * Build the 1Shot prefund transfer for HotTakeRooms.issueChallengeFor.
 *
 * The backend calls issueChallengeFor after 1Shot confirms this transfer.
 */
export function buildIssueChallengeForCall(
  params: IssueChallengeForParams
): OneShotCall[] {
  const prefundCall = buildTokenTransferCall(HOTTAKEROOMS_CONTRACT, params.stakeWei);
  return [prefundCall];
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
 * Build the 1Shot prefund transfer for HotTakeRooms.acceptChallengeFor.
 *
 * The backend calls acceptChallengeFor after 1Shot confirms this transfer.
 */
export function buildAcceptChallengeForCall(
  params: AcceptChallengeForParams
): OneShotCall[] {
  const prefundCall = buildTokenTransferCall(HOTTAKEROOMS_CONTRACT, params.stakeWei);
  return [prefundCall];
}

interface PlaceBetParams {
  agentOwner: `0x${string}`;
  battleId: `0x${string}`;
  side: 1 | 2;
  amountWei: bigint;
}

/**
 * Build the 1Shot prefund transfer for ClashboardArena.placeBetFor.
 *
 * The backend calls placeBetFor after 1Shot confirms this transfer.
 */
export function buildPlaceBetCall(params: PlaceBetParams): OneShotCall[] {
  const prefundCall = buildTokenTransferCall(ARENA_CONTRACT, params.amountWei);
  return [prefundCall];
}

/**
 * Build a raw USDC transfer call for prefunding a delegated action target.
 * This is the method accepted by MetaMask's erc20-token-periodic enforcer.
 */
export function buildTokenTransferCall(
  to: `0x${string}`,
  amountWei: bigint
): OneShotCall {
  return {
    to: USDC_ADDRESS,
    data: encodeFunctionData({
      abi: ERC20_ABI_FRAGMENT,
      functionName: "transfer",
      args: [to, amountWei],
    }) as Hex,
  };
}
