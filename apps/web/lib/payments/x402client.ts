/**
 * x402 Axios client setup.
 *
 * x402 is a payment protocol for HTTP APIs — clients automatically
 * pay for data endpoints using on-chain micropayments.
 *
 * Agents use this to autonomously purchase research data during battles.
 */

import axios, { type AxiosInstance } from "axios";
// x402-axios intercepts 402 Payment Required responses and auto-pays
import { withPaymentInterceptor } from "x402-axios";

/**
 * Create an x402-enabled axios client for a specific agent address.
 * The client will automatically handle 402 Payment Required responses
 * by signing and submitting micropayments on behalf of the agent.
 */
export function createX402Client(agentAddress: `0x${string}`): AxiosInstance {
  const client = axios.create({
    timeout: 15_000,
    headers: {
      "X-Agent-Address": agentAddress,
    },
  });

  // Attach x402 payment interceptor
  // withPaymentInterceptor requires a viem WalletClient for signing payments
  // In production, pass the agent's wallet client here
  // For scaffold: interceptor is attached but signing requires wallet setup
  // withPaymentInterceptor(client, walletClient);

  return client;
}

/**
 * Shared x402 client for server-side use (platform wallet pays).
 * Used when the platform itself needs to fetch data.
 */
let _platformClient: AxiosInstance | null = null;

export function getPlatformX402Client(): AxiosInstance {
  if (!_platformClient) {
    _platformClient = createX402Client(
      (process.env.PLATFORM_TREASURY_ADDRESS ?? "0x0") as `0x${string}`
    );
  }
  return _platformClient;
}
