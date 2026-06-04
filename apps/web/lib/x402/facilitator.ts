import { x402ExactEvmErc7710ServerScheme } from "@metamask/x402";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";

export const X402_NETWORK_ID = "eip155:84532" as const;

export const X402_FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ??
  "https://tx-sentinel-base-sepolia.dev-api.cx.metamask.io/platform/v2/x402";

let resourceServerPromise: Promise<x402ResourceServer> | null = null;

export function getX402PayToAddress(): `0x${string}` {
  const address =
    process.env.DATA_WALLET_ADDRESS ??
    process.env.PLATFORM_TREASURY_ADDRESS;

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    if (process.env.X402_ENFORCE !== "true") {
      return "0x0000000000000000000000000000000000000000";
    }

    throw new Error("DATA_WALLET_ADDRESS or PLATFORM_TREASURY_ADDRESS must be configured for x402 research payments");
  }

  return address as `0x${string}`;
}

export function getX402ResourceServer(): Promise<x402ResourceServer> {
  if (!resourceServerPromise) {
    const facilitatorClient = new HTTPFacilitatorClient({
      url: X402_FACILITATOR_URL,
    });

    const server = new x402ResourceServer(facilitatorClient).register(
      X402_NETWORK_ID,
      new x402ExactEvmErc7710ServerScheme()
    );

    resourceServerPromise = server.initialize().then(() => server);
  }

  return resourceServerPromise;
}
