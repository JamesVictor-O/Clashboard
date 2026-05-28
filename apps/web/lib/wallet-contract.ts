"use client";

import { encodeFunctionData, parseAbi, type Abi } from "viem";
import { getPublicClient } from "@/lib/chain";
import { getProvider } from "@/lib/metamask";
import { getPermissionContext } from "@/lib/permissions";

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

  const data = encodeFunctionData({
    abi: params.abi,
    functionName: params.functionName,
    args: params.args ?? [],
  });

  const tx: Record<string, unknown> = {
    from: params.account,
    to: params.address,
    data,
  };
  if (params.value) tx.value = `0x${params.value.toString(16)}`;

  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [tx],
  });

  return hash as `0x${string}`;
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

/**
 * Execute a batch of contract calls autonomously using wallet_sendCalls +
 * the stored ERC-7715 permissionsContext. No MetaMask popup is shown.
 *
 * Falls back to individual eth_sendTransaction calls (with popup) if no
 * valid permission context is found for the account.
 */
export async function sendAutonomousBatch(
  account: `0x${string}`,
  calls: Array<{
    address: `0x${string}`;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  }>
): Promise<`0x${string}`> {
  const perm = getPermissionContext(account);
  const provider = getProvider();
  if (!provider) throw new Error("Wallet not connected");

  const encodedCalls: SendCallsCall[] = calls.map((c) => {
    const call: SendCallsCall = {
      to: c.address,
      data: encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args ?? [] }),
    };
    if (c.value) call.value = `0x${c.value.toString(16)}`;
    return call;
  });

  if (perm) {
    try {
      const callsId = (await provider.request({
        method: "wallet_sendCalls",
        params: [
          {
            version: "2.0.0",
            from: account,
            calls: encodedCalls,
            capabilities: {
              permissions: { context: perm.context },
            },
          },
        ],
      })) as string;

      return waitForCallsResult(callsId);
    } catch {
      // wallet_sendCalls not supported or permission invalid — fall through to manual
    }
  }

  // Manual: fire each call sequentially with user confirmation
  // Wait for each to mine before sending the next — prevents allowance simulation issues.
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

function usdcAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_USDC_ADDRESS;
  if (!addr) throw new Error("NEXT_PUBLIC_USDC_ADDRESS is not set");
  return addr as `0x${string}`;
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
