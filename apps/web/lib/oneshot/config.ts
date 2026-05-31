/**
 * 1Shot server configuration.
 *
 * Preferred env names follow the current 1Shot SDK docs. ONESHOTAPI_KEY is
 * accepted as a legacy alias so older local setups keep working during the
 * hackathon, but new deployments should use ONESHOT_API_KEY.
 */

export interface OneShotConfig {
  baseUrl: string;
  relayerUrl: string | null;
  apiKey: string | null;
  apiSecret: string | null;
  businessId: string | null;
  walletId: string | null;
  delegationManager: `0x${string}` | null;
  executorAddress: `0x${string}` | null;
  mockEnabled: boolean;
}

export function getOneShotConfig(): OneShotConfig {
  return {
    baseUrl: process.env.ONESHOT_BASE_URL ?? "https://api.1shotapi.com/v0",
    relayerUrl: process.env.ONESHOT_RELAYER_URL ?? null,
    apiKey: process.env.ONESHOT_API_KEY ?? process.env.ONESHOTAPI_KEY ?? null,
    apiSecret: process.env.ONESHOT_API_SECRET ?? null,
    businessId: process.env.ONESHOT_BUSINESS_ID ?? null,
    walletId: process.env.ONESHOT_WALLET_ID ?? null,
    delegationManager: (process.env.ONESHOT_DELEGATION_MANAGER as `0x${string}` | undefined) ?? null,
    executorAddress: (process.env.ONESHOT_EXECUTOR_ADDRESS as `0x${string}` | undefined) ?? null,
    mockEnabled: process.env.ONESHOT_MOCK === "true",
  };
}

export function requireOneShotConfig(): OneShotConfig {
  const config = getOneShotConfig();
  if (config.mockEnabled) return config;
  if (!config.apiKey) {
    throw new Error("ONESHOT_API_KEY is not set. Set ONESHOT_MOCK=true only for local demos.");
  }
  if (!config.apiSecret) {
    throw new Error("ONESHOT_API_SECRET is not set. Set ONESHOT_MOCK=true only for local demos.");
  }
  if (!config.businessId) {
    throw new Error("ONESHOT_BUSINESS_ID is not set.");
  }
  if (!config.walletId) {
    throw new Error("ONESHOT_WALLET_ID must be the 1Shot wallet UUID, not the wallet address.");
  }
  if (!config.executorAddress) {
    throw new Error("ONESHOT_EXECUTOR_ADDRESS is not set.");
  }
  return config;
}
