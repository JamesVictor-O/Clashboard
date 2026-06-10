/**
 * 1Shot server configuration — permissionless relayer only.
 * The private API (apiKey/secret/businessId/walletId) was used by the legacy
 * payments path which has been removed. Only the public relayer is used now.
 */

export interface OneShotConfig {
  relayerUrl: string | null;
  executorAddress: `0x${string}` | null;
  mockEnabled: boolean;
}

export function getOneShotConfig(): OneShotConfig {
  return {
    relayerUrl: process.env.ONESHOT_RELAYER_URL ?? null,
    executorAddress: (process.env.ONESHOT_EXECUTOR_ADDRESS as `0x${string}` | undefined) ?? null,
    mockEnabled: process.env.ONESHOT_MOCK === "true",
  };
}

export function requireOneShotConfig(): OneShotConfig {
  const config = getOneShotConfig();
  if (config.mockEnabled) return config;
  if (!config.executorAddress) {
    throw new Error("ONESHOT_EXECUTOR_ADDRESS is not set.");
  }
  return config;
}
