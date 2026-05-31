import { OneShotClient } from "@1shotapi/client-sdk";
import { requireOneShotConfig } from "./config";

/**
 * Server-only 1Shot SDK client.
 *
 * Keep this out of client components. API keys/secrets must never be bundled
 * into browser JavaScript.
 */
export function getOneShotSdkClient(): OneShotClient {
  if (typeof window !== "undefined") {
    throw new Error("1Shot SDK client is server-only");
  }

  const config = requireOneShotConfig();
  if (config.mockEnabled) {
    throw new Error("1Shot SDK client is disabled while ONESHOT_MOCK=true");
  }
  if (!config.apiKey || !config.apiSecret) {
    throw new Error("ONESHOT_API_KEY and ONESHOT_API_SECRET are required");
  }

  return new OneShotClient({
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
    baseUrl: config.baseUrl,
  });
}
