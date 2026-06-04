import { createHash } from "crypto";
import { encodeFunctionData, parseAbi, parseUnits, type Hex } from "viem";
import {
  decimalsOf,
  feeAmountToAtoms,
  getCapabilities,
  getFeeData,
  normalizePermissionContext,
  pollStatus,
  relayerRpc,
} from "@/lib/oneshot/client";
import { getFacilitatorSignerAddress, logFacilitatorRedeemerAddresses } from "./signer";

const ERC20_TRANSFER_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const settledPayments = new Map<string, { txHash: `0x${string}`; settledAt: number }>();

type PaymentPayload = {
  x402Version?: number;
  payload?: {
    delegationManager?: `0x${string}`;
    permissionContext?: unknown;
    delegator?: `0x${string}`;
  };
  [key: string]: unknown;
};

type PaymentRequirements = {
  scheme?: string;
  network?: string;
  asset?: `0x${string}`;
  amount?: string;
  payTo?: `0x${string}`;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
};

type FacilitatorInput = {
  x402Version?: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

type Execution = {
  target: `0x${string}`;
  value: "0x0";
  data: Hex;
};

function chainIdFromNetwork(network: string | undefined): number {
  const match = /^eip155:(\d+)$/.exec(network ?? "");
  if (!match) throw new Error(`Unsupported x402 network: ${network}`);
  return Number(match[1]);
}

function assertAddress(value: unknown, name: string): `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} missing or invalid`);
  }
  return value as `0x${string}`;
}

function amountToAtoms(amount: unknown, decimals = 6): bigint {
  if (typeof amount === "number" && Number.isFinite(amount)) {
    return parseUnits(amount.toString(), decimals);
  }
  if (typeof amount !== "string") throw new Error("paymentRequirements.amount missing or invalid");
  if (/^\d+$/.test(amount)) return BigInt(amount);
  return parseUnits(amount, decimals);
}

function transferExecution(token: `0x${string}`, to: `0x${string}`, amount: bigint): Execution {
  return {
    target: token,
    value: "0x0",
    data: encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [to, amount],
    }) as Hex,
  };
}

function paymentId(input: FacilitatorInput): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

function extract(input: FacilitatorInput) {
  const requirements = input.paymentRequirements;
  const payload = input.paymentPayload.payload;
  if (!payload) throw new Error("paymentPayload.payload missing");
  if (requirements.scheme !== "exact") throw new Error(`Unsupported scheme: ${requirements.scheme}`);

  const chainId = chainIdFromNetwork(requirements.network);
  const token = assertAddress(requirements.asset, "paymentRequirements.asset");
  const payTo = assertAddress(requirements.payTo, "paymentRequirements.payTo");
  const delegator = assertAddress(payload.delegator, "paymentPayload.payload.delegator");
  const delegationManager = assertAddress(payload.delegationManager, "paymentPayload.payload.delegationManager");
  const permissionContext = normalizePermissionContext(payload.permissionContext);
  const amount = amountToAtoms(requirements.amount);

  if (amount <= 0n) throw new Error("payment amount must be greater than zero");

  return {
    chainId,
    token,
    payTo,
    amount,
    delegator,
    delegationManager,
    permissionContext,
    requirements,
  };
}

async function buildRelayerTransactions(input: FacilitatorInput) {
  const parsed = extract(input);
  const [capability, feeData] = await Promise.all([
    getCapabilities(parsed.chainId),
    getFeeData(parsed.chainId, parsed.token),
  ]);

  const targetAddress = feeData.targetAddress ?? capability.targetAddress;
  logFacilitatorRedeemerAddresses({ relayerTargetAddress: targetAddress });

  const accepted = capability.tokens.some((t) => t.address.toLowerCase() === parsed.token.toLowerCase());
  if (!accepted) throw new Error(`Token ${parsed.token} is not accepted by 1Shot relayer on chain ${parsed.chainId}`);

  const feeCollector = feeData.feeCollector ?? capability.feeCollector;
  const feeAmount = feeAmountToAtoms(feeData.minFee, decimalsOf(feeData.token));

  const executions = [
    transferExecution(parsed.token, feeCollector, feeAmount),
    transferExecution(parsed.token, parsed.payTo, parsed.amount),
  ];

  return {
    ...parsed,
    relayerContext: feeData.context,
    // ERC20PeriodTransferEnforcer only accepts one ERC-20 transfer execution
    // per redemption. Keep relayer fee and seller payment as separate
    // redemption entries, matching lib/oneshot/client.ts.
    transactions: executions.map((execution) => ({
      permissionContext: parsed.permissionContext,
      executions: [execution],
    })),
  };
}

export async function getSupported() {
  const signer = getFacilitatorSignerAddress();
  return {
    kinds: [
      {
        x402Version: 2,
        scheme: "exact",
        network: "eip155:84532",
        extra: {
          assetTransferMethod: "erc7710",
          facilitatorAddresses: [signer],
        },
      },
    ],
    extensions: [],
    signers: {
      "eip155:84532": [signer],
    },
  };
}

export async function verify(input: FacilitatorInput) {
  try {
    const built = await buildRelayerTransactions(input);
    const estimatePayload = {
      chainId: String(built.chainId),
      context: built.relayerContext,
      transactions: built.transactions,
    };

    try {
      await relayerRpc<unknown>(built.chainId, "relayer_estimate7710Transaction", estimatePayload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (process.env.X402_VERIFY_STRICT === "true") {
        return { isValid: false, invalidReason: `1Shot estimate failed: ${message}` };
      }
      // Some public relayer deployments do not expose estimate yet. In that
      // case we still perform strict structural checks above and let /settle
      // return the final relayer failure if the delegation cannot redeem.
      return {
        isValid: true,
        invalidReason: undefined,
        payer: built.delegator,
        extra: { estimate: "unavailable", warning: message },
      };
    }

    return { isValid: true, payer: built.delegator };
  } catch (err) {
    return {
      isValid: false,
      invalidReason: err instanceof Error ? err.message : "Invalid x402 ERC-7710 payment",
    };
  }
}

export async function settle(input: FacilitatorInput) {
  const id = paymentId(input);
  const existing = settledPayments.get(id);
  if (existing) {
    return {
      success: true,
      transaction: existing.txHash,
      txHash: existing.txHash,
      network: input.paymentRequirements.network ?? "eip155:84532",
      amount: input.paymentRequirements.amount,
      extra: { idempotent: true },
    };
  }

  try {
    const built = await buildRelayerTransactions(input);
    const taskId = await relayerRpc<`0x${string}`>(built.chainId, "relayer_send7710Transaction", {
      chainId: String(built.chainId),
      context: built.relayerContext,
      transactions: built.transactions,
    });

    const status = await pollStatus(built.chainId, taskId);
    if (status.status !== 200) {
      return {
        success: false,
        errorReason: status.message ?? `1Shot task ${taskId} did not confirm`,
        transaction: "",
        network: built.requirements.network,
        amount: built.requirements.amount,
      };
    }

    const txHash = status.receipt?.transactionHash ?? status.hash;
    if (!txHash) {
      return {
        success: false,
        errorReason: `1Shot task ${taskId} confirmed without transaction hash`,
        transaction: "",
        network: built.requirements.network,
        amount: built.requirements.amount,
      };
    }

    settledPayments.set(id, { txHash, settledAt: Date.now() });

    return {
      success: true,
      transaction: txHash,
      txHash,
      network: built.requirements.network,
      amount: built.requirements.amount,
      payer: built.delegator,
    };
  } catch (err) {
    return {
      success: false,
      errorReason: err instanceof Error ? err.message : "1Shot x402 settlement failed",
      transaction: "",
      network: input.paymentRequirements.network ?? "eip155:84532",
      amount: input.paymentRequirements.amount,
    };
  }
}
