/**
 * 1Shot Relayer integration.
 *
 * 1Shot is a meta-transaction relayer that executes on-chain actions
 * on behalf of users/agents using ERC-7710 delegations.
 *
 * Docs: https://docs.1shot.so
 */

const ONESHOT_BASE_URL = "https://api.1shot.so/v1";

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

function getApiKey(): string {
  const key = process.env.ONESHOTAPI_KEY;
  if (!key) throw new Error("ONESHOTAPI_KEY is not set");
  return key;
}

/**
 * Pay a recipient via the 1Shot relayer.
 * Used for instant payout to winning bettors after battle settlement.
 */
export async function payVia1Shot(params: PayVia1ShotParams): Promise<string> {
  const { recipient, amount, battleId, reason } = params;

  const response = await fetch(`${ONESHOT_BASE_URL}/relay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      to: recipient,
      amount: amount.toString(),
      token: process.env.NEXT_PUBLIC_USDC_ADDRESS,
      chain: process.env.NEXT_PUBLIC_CHAIN_ID ?? "44787",
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

  const response = await fetch(`${ONESHOT_BASE_URL}/redeem-delegation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      delegator: bettorAddress,
      amount: amount.toString(),
      token: process.env.NEXT_PUBLIC_USDC_ADDRESS,
      chain: process.env.NEXT_PUBLIC_CHAIN_ID ?? "44787",
      delegationData,
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
