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
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";

export const ONESHOT_PUBLIC_RELAYER_MAINNET = "https://relayer.1shotapi.com/relayers";
export const ONESHOT_PUBLIC_RELAYER_TESTNET = "https://relayer.1shotapi.dev/relayers";

const ERC20_TRANSFER_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

// Graduated poll intervals: fast start so quick confirmations are caught immediately,
// then back off to a steady 2 s cadence. Flat 2 s polling was the primary source of
// the 1-2 minute delay — a tx that confirms in 3 s was not detected until 4 s+.
const RELAYER_POLL_SCHEDULE_MS = [300, 500, 700, 1_000, 1_500, 2_000];
const RELAYER_STATUS_MAX_ATTEMPTS = 120; // ~4 minutes total at plateau cadence

// ─── In-process relayer metadata caches ──────────────────────────────────────
// getCapabilities is essentially static (fee collector, token list never change
// mid-session). getFeeData changes with gas prices but is stable enough to reuse
// for 30 s — the minFee on testnet rarely shifts between two sequential actions.

const CAPABILITY_TTL_MS = 5 * 60 * 1_000; // 5 min
const FEE_DATA_TTL_MS = 30_000;            // 30 s

type CacheEntry<T> = { value: T; expiresAt: number };
const capabilityCache = new Map<number, CacheEntry<RelayerCapability>>();
const feeDataCache    = new Map<string,  CacheEntry<FeeData>>();

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
  prefundTxHash?: `0x${string}`;
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

export async function relayerRpc<T>(chainId: number, method: string, params: unknown): Promise<T> {
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

export function normalizePermissionContext(context: unknown): unknown[] {
  // Already an array of delegation objects — use directly
  if (Array.isArray(context)) return context;

  // Hex string — this is what MetaMask Flask returns as grant.context
  // Decode it into delegation objects using the Smart Accounts Kit
  if (typeof context === "string" && context.startsWith("0x")) {
    try {
      const delegations = decodeDelegations(context as `0x${string}`);
      if (Array.isArray(delegations) && delegations.length > 0) {
        return delegations;
      }
    } catch (err) {
      console.warn("[1Shot] Failed to decode hex permissionContext:", err);
    }
  }

  // JSON string array
  if (typeof context === "string") {
    const trimmed = context.trim();
    if (trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed;
    }
    if (trimmed.startsWith("{")) return [JSON.parse(trimmed)];
  }

  // Single delegation object
  if (typeof context === "object" && context !== null) return [context];

  throw new Error(
    "ERC-7715 permission context is not a 1Shot ERC-7710 delegation chain. " +
      "Re-release the fighter with a MetaMask/Smart Accounts Kit grant compatible with the public relayer.",
  );
}

export function decimalsOf(token: TokenDetails): number {
  return typeof token.decimals === "string" ? Number(token.decimals) : token.decimals;
}

export function feeAmountToAtoms(amount: string, decimals: number): bigint {
  if (/^\d+$/.test(amount)) return BigInt(amount);
  return parseUnits(amount, decimals);
}

export async function getCapabilities(chainId: number): Promise<RelayerCapability> {
  const cached = capabilityCache.get(chainId);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const caps = await relayerRpc<Record<string, RelayerCapability>>(
    chainId,
    "relayer_getCapabilities",
    [String(chainId)]
  );
  const capability = caps[String(chainId)];
  if (!capability) throw new Error(`1Shot relayer does not support chain ${chainId}`);
  capabilityCache.set(chainId, { value: capability, expiresAt: Date.now() + CAPABILITY_TTL_MS });
  return capability;
}

export async function getFeeData(chainId: number, token: `0x${string}`): Promise<FeeData> {
  const key = `${chainId}:${token}`;
  const cached = feeDataCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const data = await relayerRpc<FeeData>(chainId, "relayer_getFeeData", {
    chainId: String(chainId),
    token,
  });
  feeDataCache.set(key, { value: data, expiresAt: Date.now() + FEE_DATA_TTL_MS });
  return data;
}

export async function pollStatus(chainId: number, taskId: `0x${string}`): Promise<StatusResult> {
  let last: StatusResult | null = null;
  for (let i = 0; i < RELAYER_STATUS_MAX_ATTEMPTS; i++) {
    const status = await relayerRpc<StatusResult>(chainId, "relayer_getStatus", {
      id: taskId,
      logs: false,
    });
    last = status;
    if (status.status === 200 || status.status === 400 || status.status === 500) return status;
    const delay = RELAYER_POLL_SCHEDULE_MS[Math.min(i, RELAYER_POLL_SCHEDULE_MS.length - 1)];
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return last ?? { id: taskId, chainId: String(chainId), status: 100 };
}

/**
 * Re-delegate a session-key-scoped permission context to the 1Shot relayer target.
 *
 * With the single-grant model the user's ERC-7715 grant is issued to the agent
 * session key (ONE popup). Before sending arena actions to the relayer, the
 * session key creates an ERC-7710 sub-delegation pointing to the relayer's own
 * targetAddress — the relayer can then redeem it in the usual multi-hop chain:
 *   smart-account → session-key (grant) → 1Shot relayer (re-delegation).
 *
 * This runs client-side only — session private keys never leave the browser.
 */
async function redelegateContextToRelayer(
  req: OneShotExecuteRequest,
  sessionPrivateKey: `0x${string}`,
  sessionAddress: `0x${string}`,
  relayerTarget: `0x${string}`,
): Promise<OneShotExecuteRequest> {
  const { erc7710WalletActions } = await import("@metamask/smart-accounts-kit/actions");
  const { getSmartAccountsEnvironment } = await import("@metamask/smart-accounts-kit");
  const { createWalletClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { baseSepolia, base } = await import("viem/chains");

  const chain = req.chainId === 8453 ? base : baseSepolia;
  const account = privateKeyToAccount(sessionPrivateKey);
  const sessionClient = createWalletClient({ account, chain, transport: http() }).extend(
    erc7710WalletActions(),
  );

  const redelegation = await (sessionClient as unknown as {
    redelegatePermissionContext: (opts: {
      environment: unknown;
      permissionContext: `0x${string}`;
      chainId: number;
      to: `0x${string}`;
    }) => Promise<{ permissionContext: `0x${string}` }>;
  }).redelegatePermissionContext({
    environment: getSmartAccountsEnvironment(req.chainId),
    permissionContext: req.permissionContext.context as `0x${string}`,
    chainId: req.chainId,
    to: relayerTarget,
  });

  console.log("[1Shot] Re-delegated context from session key", sessionAddress, "→ relayer", relayerTarget);
  return {
    ...req,
    permissionContext: {
      ...req.permissionContext,
      context: redelegation.permissionContext,
      sessionAddress: relayerTarget,
    },
  };
}

/**
 * Execute an ERC-7710 delegated bundle through the 1Shot public relayer.
 */
export async function execute1Shot(req: OneShotExecuteRequest): Promise<OneShotExecuteResult> {
  if (typeof window !== "undefined") {
    // ── Session-key re-delegation (single-grant model) ──────────────────────
    // If the stored permission context is scoped to the agent's session key
    // rather than directly to the relayer, re-delegate it to the relayer target
    // before forwarding to the API. Old-model grants (sessionAddress = relayer)
    // skip this step and continue to work as-is.
    let finalReq = req;
    try {
      const { getAgentSession } = await import("@/lib/metamask");
      const session = getAgentSession(req.permissionContext.walletAddress);
      if (
        session?.sessionPrivateKey &&
        session.sessionAddress &&
        req.permissionContext.sessionAddress?.toLowerCase() ===
          session.sessionAddress.toLowerCase()
      ) {
        const capability = await getCapabilities(req.chainId);
        finalReq = await redelegateContextToRelayer(
          req,
          session.sessionPrivateKey,
          session.sessionAddress,
          capability.targetAddress,
        );
      }
    } catch (err) {
      console.warn("[1Shot] Re-delegation step failed — falling through with original context:", err);
      // Non-fatal for backward-compatible old-model grants; new-model grants
      // will fail downstream at the relayer, which is the correct signal.
    }

    const res = await fetch("/api/autonomy/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finalReq),
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

  // ERC20PeriodTransferEnforcer only accepts one ERC-20 transfer execution per
  // redemption. Keep fee and action prefunds as separate redemption entries.
  const transactions = executions.map((execution) => ({
    permissionContext,
    executions: [execution],
  }));

  const taskId = await relayerRpc<`0x${string}`>(chainId, "relayer_send7710Transaction", {
    chainId: String(chainId),
    context: feeData.context,
    transactions,
  });

  const status = await pollStatus(chainId, taskId);
  if (status.status === 400 || status.status === 500) {
    throw new Error(`1Shot task ${taskId} failed: ${status.message ?? JSON.stringify(status.data ?? {})}`);
  }
  if (status.status !== 200) {
    const plateauMs = RELAYER_POLL_SCHEDULE_MS[RELAYER_POLL_SCHEDULE_MS.length - 1];
    const waitedSeconds = Math.round((plateauMs * RELAYER_STATUS_MAX_ATTEMPTS) / 1000);
    throw new Error(`1Shot task ${taskId} did not confirm within ${waitedSeconds}s (last status ${status.status})`);
  }
  if (!status.receipt?.transactionHash && !status.hash) {
    throw new Error(`1Shot task ${taskId} confirmed without an explorer transaction hash`);
  }

  return {
    status: "confirmed",
    taskId,
    txHash: status.receipt?.transactionHash ?? status.hash,
    actionType: req.actionType,
    timestamp: Date.now(),
  };
}
