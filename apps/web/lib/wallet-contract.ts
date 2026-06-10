"use client";

import { encodeFunctionData, parseAbi, type Abi } from "viem";
import { getPublicClient } from "@/lib/chain";
import { getProvider, switchToBaseSepolia } from "@/lib/metamask";
import { getPermissionContext } from "@/lib/permissions";
import { ARENA_CONTRACT, CHAIN_ID, USDC_ADDRESS } from "@/lib/contracts";

// ─── Generic user-signed contract call ───────────────────────────────────────

/**
 * Send a contract transaction signed by the user's MetaMask wallet.
 * Uses eth_sendTransaction directly so it works with MetaMask SDK
 * without needing a separate WalletClient setup.
 */
export async function writeUserContract(params: {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  account: `0x${string}`;
  value?: bigint;
}): Promise<`0x${string}`> {
  const provider = getProvider();
  if (!provider) throw new Error("Wallet not connected");

  await switchToBaseSepolia();

  const data = encodeFunctionData({
    abi: params.abi,
    functionName: params.functionName,
    args: params.args ?? [],
  });
  const chainId = CHAIN_ID;

  const tx: Record<string, unknown> = {
    from: params.account,
    to: params.address,
    data,
    chainId: `0x${chainId.toString(16)}`,
  };
  if (params.value) tx.value = `0x${params.value.toString(16)}`;

  let hash: unknown;
  try {
    hash = await provider.request({
      method: "eth_sendTransaction",
      params: [tx],
    });
  } catch (err) {
    throw normalizeWalletRpcError(err);
  }

  return hash as `0x${string}`;
}

function normalizeWalletRpcError(err: unknown): Error {
  const rpcError = err as {
    code?: number;
    message?: string;
    data?: { message?: string; originalError?: { message?: string } };
  };

  const details =
    rpcError.data?.originalError?.message ??
    rpcError.data?.message ??
    rpcError.message ??
    "Wallet transaction failed";

  if (rpcError.code === -32080) {
    return new Error(
      `Wallet RPC rejected the transaction simulation: ${details}. Check MetaMask is on Base Sepolia and try again.`
    );
  }

  return new Error(details);
}

// ─── EIP-5792 / ERC-7715 autonomous calls ────────────────────────────────────

interface SendCallsCall {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: string; // hex
}

/**
 * Poll wallet_getCallsStatus until CONFIRMED, then return the first tx hash.
 * Falls back to the callsId string if the wallet doesn't expose receipts.
 */
async function waitForCallsResult(callsId: string): Promise<`0x${string}`> {
  const provider = getProvider();
  if (!provider) throw new Error("Wallet not connected");

  for (let i = 0; i < 30; i++) {
    const status = (await provider.request({
      method: "wallet_getCallsStatus",
      params: [callsId],
    })) as {
      status: "PENDING" | "CONFIRMED" | "FAILED";
      receipts?: Array<{ transactionHash: `0x${string}` }>;
    };

    if (status.status === "CONFIRMED") {
      return status.receipts?.[0]?.transactionHash ?? (callsId as `0x${string}`);
    }
    if (status.status === "FAILED") {
      throw new Error("Autonomous transaction failed");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Autonomous transaction not confirmed after 60s");
}

type CallInput = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

function encodeCalls(calls: CallInput[]): SendCallsCall[] {
  return calls.map((c) => {
    const call: SendCallsCall = {
      to: c.address,
      data: encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args ?? [] }),
    };
    if (c.value) call.value = `0x${c.value.toString(16)}`;
    return call;
  });
}

/**
 * Execute a batch of contract calls autonomously using wallet_sendCalls +
 * the stored ERC-7715 permissionsContext. No MetaMask popup is shown.
 *
 * Execution order:
 *   1. wallet_sendCalls + permissionsContext → fully autonomous, no popup
 *   2. wallet_sendCalls without permission   → single EIP-5792 batch popup
 *   3. sequential eth_sendTransaction        → one popup per call (last resort)
 */
export async function sendAutonomousBatch(
  account: `0x${string}`,
  calls: CallInput[]
): Promise<`0x${string}`> {
  const perm = getPermissionContext(account);
  const provider = getProvider();
  if (!provider) throw new Error("Wallet not connected");

  const encodedCalls = encodeCalls(calls);

  // Path 1: fully autonomous — ERC-7715 permission, no popup
  if (perm) {
    try {
      const callsId = (await provider.request({
        method: "wallet_sendCalls",
        params: [{ from: account, calls: encodedCalls, capabilities: { permissions: { context: perm.context } } }],
      })) as string;
      return waitForCallsResult(callsId);
    } catch {
      // permission invalid or wallet_sendCalls not available — fall through
    }
  }

  // Path 2: EIP-5792 batch without permission — single confirmation popup
  try {
    const callsId = (await provider.request({
      method: "wallet_sendCalls",
      params: [{ from: account, calls: encodedCalls }],
    })) as string;
    return waitForCallsResult(callsId);
  } catch {
    // wallet_sendCalls not supported at all — fall through to sequential
  }

  // Path 3: sequential eth_sendTransaction — one popup per call
  let lastHash: `0x${string}` = "0x";
  for (const call of encodedCalls) {
    const tx: Record<string, unknown> = { from: account, to: call.to, data: call.data };
    if (call.value) tx.value = call.value;
    lastHash = (await provider.request({ method: "eth_sendTransaction", params: [tx] })) as `0x${string}`;
    await waitForTx(lastHash);
  }
  return lastHash;
}

/**
 * Execute a batch of calls that MUST originate from the user's own EOA
 * (i.e. contracts that check msg.sender against the registered agent owner —
 * issueChallenge, acceptChallenge, cancelChallenge).
 *
 * These actions can NEVER use the ERC-7715 delegated path because delegation
 * changes msg.sender to the DelegationManager, breaking agentExists_(msg.sender).
 *
 * Execution order:
 *   1. wallet_sendCalls without permission — single EIP-5792 batch popup
 *   2. sequential eth_sendTransaction      — one popup per call (fallback)
 */
export async function sendUserBatch(
  account: `0x${string}`,
  calls: CallInput[]
): Promise<`0x${string}`> {
  const provider = getProvider();
  if (!provider) throw new Error("Wallet not connected");

  const encodedCalls = encodeCalls(calls);

  // Path 1: EIP-5792 batch — all calls in a single confirmation popup
  try {
    const callsId = (await provider.request({
      method: "wallet_sendCalls",
      params: [{ from: account, calls: encodedCalls }],
    })) as string;
    return waitForCallsResult(callsId);
  } catch {
    // wallet_sendCalls not supported — fall back to sequential
  }

  // Path 2: sequential eth_sendTransaction — one popup per call
  // Must wait for each to mine before the next: approval must land on-chain
  // before the dependent call or MetaMask simulates against stale allowance.
  let lastHash: `0x${string}` = "0x";
  for (const call of encodedCalls) {
    const tx: Record<string, unknown> = { from: account, to: call.to, data: call.data };
    if (call.value) tx.value = call.value;
    lastHash = (await provider.request({ method: "eth_sendTransaction", params: [tx] })) as `0x${string}`;
    await waitForTx(lastHash);
  }
  return lastHash;
}

/**
 * Execute a single contract call. Uses wallet_sendCalls + permissionsContext
 * if a valid ERC-7715 grant exists; otherwise falls back to eth_sendTransaction.
 */
export async function writeAutonomousContract(params: {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  account: `0x${string}`;
  value?: bigint;
}): Promise<`0x${string}`> {
  return sendAutonomousBatch(params.account, [params]);
}

// ─── USDC helpers ─────────────────────────────────────────────────────────────

const ERC20_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const ARENA_STAKE_ABI = parseAbi([
  "function placeBet(bytes32 battleId, uint8 side, uint256 amount) external",
]);

function usdcAddress(): `0x${string}` { return USDC_ADDRESS; }
function arenaAddress(): `0x${string}` { return ARENA_CONTRACT; }

function toUSDCUnits(amountUSDC: number): bigint {
  if (!Number.isFinite(amountUSDC) || amountUSDC <= 0) {
    throw new Error("Enter a valid USDC amount");
  }
  return BigInt(Math.round(amountUSDC * 1_000_000));
}

export async function getConnectedWalletAccount(): Promise<`0x${string}`> {
  const provider = getProvider();
  if (!provider) throw new Error("Wallet not connected");

  // Do not prompt here. Post-forge flows should use the stored ERC-7715 budget
  // through 1Shot, and manual fallbacks require the wallet to already be connected.
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  const account = accounts[0];
  if (!account) throw new Error("Connect your wallet first");
  return account as `0x${string}`;
}

/**
 * Build a USDC approval call object for use in an autonomous batch.
 * Returns null if the current allowance already covers `amount`.
 */
export async function buildUSDCApprovalCall(
  owner: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint
): Promise<{ address: `0x${string}`; abi: Abi; functionName: string; args: readonly unknown[] } | null> {
  const client = getPublicClient();
  const allowance = (await client.readContract({
    address: usdcAddress(),
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, spender],
  })) as bigint;

  if (allowance >= amount) return null;

  return {
    address: usdcAddress(),
    abi: ERC20_ABI as Abi,
    functionName: "approve",
    args: [spender, amount],
  };
}

/**
 * Approve `spender` to spend `amount` of USDC from `owner`'s wallet.
 * Skips the approval transaction if the current allowance is already sufficient.
 * Returns the tx hash if an approval was sent, or null if allowance was already enough.
 */
export async function ensureUSDCApproval(
  owner: `0x${string}`,
  spender: `0x${string}`,
  amount: bigint
): Promise<`0x${string}` | null> {
  const client = getPublicClient();

  const allowance = (await client.readContract({
    address: usdcAddress(),
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, spender],
  })) as bigint;

  if (allowance >= amount) return null;

  return writeUserContract({
    address: usdcAddress(),
    abi: ERC20_ABI,
    functionName: "approve",
    args: [spender, amount],
    account: owner,
  });
}

// ─── Arena staking ────────────────────────────────────────────────────────────

/**
 * User-driven arena stake. This intentionally uses the user's EOA path, not the
 * stored ERC-7715 permission path, because placeBet records msg.sender as the
 * logical bettor. Autonomous 1Shot execution should use placeBetFor server-side.
 */
export async function placeUserArenaStake(params: {
  account: `0x${string}`;
  battleId: `0x${string}`;
  side: 1 | 2;
  amountUSDC: number;
}): Promise<`0x${string}`> {
  const amount = toUSDCUnits(params.amountUSDC);
  const arena = arenaAddress();
  const approvalCall = await buildUSDCApprovalCall(params.account, arena, amount);
  const stakeCall = {
    address: arena,
    abi: ARENA_STAKE_ABI as Abi,
    functionName: "placeBet",
    args: [params.battleId, params.side, amount] as readonly unknown[],
  };

  const txHash = await sendUserBatch(
    params.account,
    approvalCall ? [approvalCall, stakeCall] : [stakeCall]
  );
  await waitForTx(txHash);
  return txHash;
}

// ─── Wait for tx ──────────────────────────────────────────────────────────────

/**
 * Poll until a transaction is mined (max ~3 min).
 * On testnet (Base Sepolia) blocks can take 30-90s under load.
 */
export async function waitForTx(txHash: `0x${string}`): Promise<void> {
  const client = getPublicClient();
  for (let i = 0; i < 90; i++) {
    const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
    if (receipt) {
      if (receipt.status === "reverted") {
        throw new Error(`Transaction reverted on-chain: ${txHash.slice(0, 10)}…`);
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `Transaction submitted but not yet confirmed (${txHash.slice(0, 10)}…). ` +
    `Check your wallet activity — if it shows as pending, your funds are safe. ` +
    `Do NOT retry or you may create a duplicate.`
  );
}
