/**
 * 1Shot Relayer integration.
 *
 * 1Shot is a meta-transaction relayer that executes on-chain actions
 * on behalf of users/agents using ERC-7710 delegations.
 *
 * Docs: https://docs.1shot.so
 */

import { getOneShotConfig, requireOneShotConfig } from "@/lib/oneshot/config";

const MOCK_TX_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

interface PayVia1ShotParams {
  recipient: string;
  amount: bigint; // USDC 6-decimal
  battleId: string;
  reason: string;
}

interface RedeemDelegationParams {
  bettorAddress: `0x${string}`;
  amount: bigint;
  battleId: string;
  delegationData: string; // ERC-7710 delegation calldata
}

export interface OneShotExecutionResult {
  status: "submitted" | "mocked";
  txHash?: `0x${string}`;
}

export interface OneShotPermissionContext {
  context: unknown;
  delegationManager: `0x${string}`;
  sessionAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  chainId: number;
}

interface ExecuteWith1ShotParams {
  permissionContext: OneShotPermissionContext;
  amountUSDC: string;
  recipient: `0x${string}`;
  chainId: number;
  actionData: Record<string, unknown>;
}

function getApiKey(): string {
  const key = requireOneShotConfig().apiKey;
  if (!key) throw new Error("ONESHOT_API_KEY is not set");
  return key;
}

async function postOneShot(path: string, body: Record<string, unknown>): Promise<OneShotExecutionResult> {
  const config = getOneShotConfig();
  if (config.mockEnabled) {
    return { status: "mocked", txHash: MOCK_TX_HASH };
  }
  requireOneShotConfig();

  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
      ...(config.apiSecret ? { "X-1Shot-Api-Secret": config.apiSecret } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`1Shot execution failed: ${response.status} — ${error}`);
  }

  const data = (await response.json()) as { txHash?: `0x${string}`; status?: string };
  return { status: "submitted", txHash: data.txHash };
}

export async function executeArenaActionWith1Shot(
  params: ExecuteWith1ShotParams
): Promise<OneShotExecutionResult> {
  // TODO(hackathon): replace this generic relay payload with the final 1Shot
  // ERC-7710 schema once their production API details are locked.
  return postOneShot("/relay", {
    type: "ARENA_ACTION",
    permissionContext: params.permissionContext,
    recipient: params.recipient,
    amountUSDC: params.amountUSDC,
    token: process.env.NEXT_PUBLIC_USDC_ADDRESS,
    chainId: params.chainId,
    actionData: params.actionData,
  });
}

export async function payResearchWith1Shot(
  params: ExecuteWith1ShotParams
): Promise<OneShotExecutionResult> {
  // TODO(hackathon): wire exact x402 + 1Shot settlement receipt fields.
  return postOneShot("/relay", {
    type: "RESEARCH_PURCHASE",
    permissionContext: params.permissionContext,
    recipient: params.recipient,
    amountUSDC: params.amountUSDC,
    token: process.env.NEXT_PUBLIC_USDC_ADDRESS,
    chainId: params.chainId,
    actionData: params.actionData,
  });
}

export async function payAgentResearchWith1Shot(
  params: ExecuteWith1ShotParams
): Promise<OneShotExecutionResult> {
  // TODO(hackathon): replace with final ERC-7710 transfer/delegation payload.
  return postOneShot("/relay", {
    type: "AGENT_RESEARCH_PURCHASE",
    permissionContext: params.permissionContext,
    recipient: params.recipient,
    amountUSDC: params.amountUSDC,
    token: process.env.NEXT_PUBLIC_USDC_ADDRESS,
    chainId: params.chainId,
    actionData: params.actionData,
  });
}

/**
 * Pay a recipient via the 1Shot relayer.
 * Used for instant payout to winning bettors after battle settlement.
 */
export async function payVia1Shot(params: PayVia1ShotParams): Promise<string> {
  const { recipient, amount, battleId, reason } = params;
  const config = requireOneShotConfig();

  const response = await fetch(`${config.baseUrl}/relay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
      ...(config.apiSecret ? { "X-1Shot-Api-Secret": config.apiSecret } : {}),
    },
    body: JSON.stringify({
      to: recipient,
      amount: amount.toString(),
      token: process.env.NEXT_PUBLIC_USDC_ADDRESS,
      chain: process.env.NEXT_PUBLIC_CHAIN_ID ?? "44787",
      memo: `Clashboard payout ${battleId}`,
      metadata: { battleId, reason },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`1Shot relay failed: ${response.status} — ${error}`);
  }

  const data = (await response.json()) as { txHash: string };
  return data.txHash;
}

/**
 * Redeem an ERC-7710 delegation to pull funds from a user's smart account.
 * Called when a bettor places a bet using their pre-approved budget.
 */
export async function redeemDelegation(
  params: RedeemDelegationParams
): Promise<string> {
  const { bettorAddress, amount, battleId, delegationData } = params;
  const config = requireOneShotConfig();

  const response = await fetch(`${config.baseUrl}/redeem-delegation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
      ...(config.apiSecret ? { "X-1Shot-Api-Secret": config.apiSecret } : {}),
    },
    body: JSON.stringify({
      delegator: bettorAddress,
      amount: amount.toString(),
      token: process.env.NEXT_PUBLIC_USDC_ADDRESS,
      chain: process.env.NEXT_PUBLIC_CHAIN_ID ?? "44787",
      delegationData,
      memo: `Clashboard delegated arena stake ${battleId}`,
      metadata: { battleId },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Delegation redemption failed: ${response.status} — ${error}`);
  }

  const data = (await response.json()) as { txHash: string };
  return data.txHash;
}
