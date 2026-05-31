/**
 * 1Shot public relayer client for ERC-7710 / ERC-7715 execution.
 *
 * The Dev Platform SDK remains useful for wallet/account management, contract
 * method imports, reads, and ordinary server-wallet transactions. The ERC-7710
 * redemption path uses the public relayer JSON-RPC surface instead:
 *
 *   POST https://relayer.1shotapi.com/relayers      (mainnet)
 *   POST https://relayer.1shotapi.dev/relayers      (testnet)
 *
 * Lifecycle:
 *   1. relayer_getCapabilities       -> targetAddress, feeCollector, tokens
 *   2. relayer_getFeeData            -> payment quote/context
 *   3. relayer_send7710Transaction   -> TaskId
 *   4. relayer_getStatus             -> tx hash / receipt / terminal failure
 */

import { encodeFunctionData, parseAbi, parseUnits, type Hex } from "viem";
import { getOneShotConfig, requireOneShotConfig } from "./config";

export const ONESHOT_PUBLIC_RELAYER_MAINNET = "https://relayer.1shotapi.com/relayers";
export const ONESHOT_PUBLIC_RELAYER_TESTNET = "https://relayer.1shotapi.dev/relayers";

const ERC20_TRANSFER_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OneShotCall {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: string;
}

/**
 * The ERC-7715 permissionContext that 1Shot uses to prove delegation authority.
 * MetaMask/SAK may return this as an array/object delegation chain rather than
 * a hex string, so keep it as unknown and normalize at the relayer boundary.
 */
export interface OneShotPermissionContext {
  context: unknown;
  delegationManager: `0x${string}`;
  sessionAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  chainId: number;
}

export interface OneShotExecuteRequest {
  permissionContext: OneShotPermissionContext;
  calls: OneShotCall[];
  chainId: number;
  actionType: string;
  metadata?: Record<string, unknown>;
  memo?: string;
}

export interface OneShotExecuteResult {
  status: "submitted" | "confirmed" | "mocked";
  taskId?: `0x${string}`;
  txHash?: `0x${string}`;
  actionType: string;
  timestamp: number;
}

type JsonRpcResponse<T> = {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
};

type TokenDetails = {
  address: `0x${string}`;
  decimals: number | string;
  symbol?: string;
  name?: string;
};

type RelayerCapability = {
  feeCollector: `0x${string}`;
  targetAddress: `0x${string}`;
  tokens: TokenDetails[];
};

type FeeData = {
  chainId: string;
  token: TokenDetails;
  rate: number;
  minFee: string;
  expiry: number;
  gasPrice: string;
  feeCollector: `0x${string}`;
  targetAddress?: `0x${string}`;
  context?: string;
};

type StatusResult = {
  id: `0x${string}`;
  chainId: string;
  status: 100 | 110 | 200 | 400 | 500;
  hash?: `0x${string}`;
  message?: string;
  data?: unknown;
  receipt?: { transactionHash: `0x${string}` };
};

const MOCK_TX = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

function relayerUrl(chainId: number): string {
  const configured = getOneShotConfig().relayerUrl;
  if (configured) return configured;
  return chainId === 84532 || chainId === 11155111 ? ONESHOT_PUBLIC_RELAYER_TESTNET : ONESHOT_PUBLIC_RELAYER_MAINNET;
}

function usdcAddress(): `0x${string}` {
  const address = process.env.NEXT_PUBLIC_USDC_ADDRESS;
  if (!address) throw new Error("NEXT_PUBLIC_USDC_ADDRESS is not set");
  return address as `0x${string}`;
}

async function relayerRpc<T>(chainId: number, method: string, params: unknown): Promise<T> {
  const res = await fetch(relayerUrl(chainId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });

  if (!res.ok) {
    throw new Error(`1Shot relayer HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as JsonRpcResponse<T>;
  if (data.error) {
    throw new Error(`1Shot relayer ${method} failed (${data.error.code}): ${data.error.message}`);
  }
  if (data.result == null) {
    throw new Error(`1Shot relayer ${method} returned no result`);
  }
  return data.result;
}

function normalizePermissionContext(context: unknown): unknown[] {
  if (Array.isArray(context)) return context;
  if (typeof context === "string") {
    const trimmed = context.trim();
    if (trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed;
    }
    if (trimmed.startsWith("{")) return [JSON.parse(trimmed)];
  }
  if (typeof context === "object" && context !== null) return [context];

  throw new Error(
    "ERC-7715 permission context is not a 1Shot ERC-7710 delegation chain. " +
    "Re-release the fighter with a MetaMask/Smart Accounts Kit grant compatible with the public relayer."
  );
}

function decimalsOf(token: TokenDetails): number {
  return typeof token.decimals === "string" ? Number(token.decimals) : token.decimals;
}

function feeAmountToAtoms(amount: string, decimals: number): bigint {
  if (/^\d+$/.test(amount)) return BigInt(amount);
  return parseUnits(amount, decimals);
}

async function getCapabilities(chainId: number): Promise<RelayerCapability> {
  const caps = await relayerRpc<Record<string, RelayerCapability>>(
    chainId,
    "relayer_getCapabilities",
    [String(chainId)]
  );
  const capability = caps[String(chainId)];
  if (!capability) throw new Error(`1Shot relayer does not support chain ${chainId}`);
  return capability;
}

async function getFeeData(chainId: number, token: `0x${string}`): Promise<FeeData> {
  return relayerRpc<FeeData>(chainId, "relayer_getFeeData", {
    chainId: String(chainId),
    token,
  });
}

async function pollStatus(chainId: number, taskId: `0x${string}`): Promise<StatusResult> {
  let last: StatusResult | null = null;
  for (let i = 0; i < 30; i++) {
    const status = await relayerRpc<StatusResult>(chainId, "relayer_getStatus", {
      id: taskId,
      logs: false,
    });
    last = status;
    if (status.status === 200 || status.status === 400 || status.status === 500) return status;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return last ?? { id: taskId, chainId: String(chainId), status: 100 };
}

/**
 * Execute an ERC-7710 delegated bundle through the 1Shot public relayer.
 */
export async function execute1Shot(req: OneShotExecuteRequest): Promise<OneShotExecuteResult> {
  if (typeof window !== "undefined") {
    const res = await fetch("/api/autonomy/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`1Shot proxy failed: ${res.status} — ${await res.text()}`);
    return res.json() as Promise<OneShotExecuteResult>;
  }

  const config = requireOneShotConfig();
  if (config.mockEnabled) {
    console.warn("[1Shot] ONESHOT_MOCK=true — returning mock tx");
    return { status: "mocked", txHash: MOCK_TX, actionType: req.actionType, timestamp: Date.now() };
  }

  const chainId = req.chainId;
  const token = usdcAddress();
  const [capability, feeData] = await Promise.all([
    getCapabilities(chainId),
    getFeeData(chainId, token),
  ]);

  const accepted = capability.tokens.some((t) => t.address.toLowerCase() === token.toLowerCase());
  if (!accepted) throw new Error(`USDC token ${token} is not accepted by 1Shot relayer on chain ${chainId}`);

  const targetAddress = feeData.targetAddress ?? capability.targetAddress;
  const executor = config.executorAddress;
  if (executor && targetAddress && executor.toLowerCase() !== targetAddress.toLowerCase()) {
    console.warn("[1Shot] ONESHOT_EXECUTOR_ADDRESS differs from public relayer targetAddress; contract executor authorization may need refreshing.");
  }

  const feeCollector = feeData.feeCollector ?? capability.feeCollector;
  const feeTokenDecimals = decimalsOf(feeData.token);
  const feeAmount = feeAmountToAtoms(feeData.minFee, feeTokenDecimals);
  const permissionContext = normalizePermissionContext(req.permissionContext.context);

  const executions = [
    {
      target: token,
      value: "0x0",
      data: encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [feeCollector, feeAmount],
      }) as Hex,
    },
    ...req.calls.map((call) => ({
      target: call.to,
      value: call.value ?? "0x0",
      data: call.data,
    })),
  ];

  const taskId = await relayerRpc<`0x${string}`>(chainId, "relayer_send7710Transaction", {
    chainId: String(chainId),
    context: feeData.context,
    transactions: [{ permissionContext, executions }],
  });

  const status = await pollStatus(chainId, taskId);
  if (status.status === 400 || status.status === 500) {
    throw new Error(`1Shot task ${taskId} failed: ${status.message ?? JSON.stringify(status.data ?? {})}`);
  }

  return {
    status: status.status === 200 ? "confirmed" : "submitted",
    taskId,
    txHash: status.receipt?.transactionHash ?? status.hash,
    actionType: req.actionType,
    timestamp: Date.now(),
  };
}
