/**
 * Official x402 buyer setup for autonomous research purchases.
 *
 * MetaMask's x402 adapter creates ERC-7710 payment payloads. @x402/fetch
 * handles the HTTP cycle: request -> 402 -> create payment -> retry.
 */

import { getAgentSession } from "@/lib/metamask";
import { getResearchPermissionContext } from "@/lib/permissions";
import {
  createResearchBuyer as createResearchBuyerCore,
  createResearchBuyerFromSession,
  type ResearchBuyerParams,
} from "@/lib/x402/buyer";

export { type ResearchBuyerParams };
export const createResearchBuyer = createResearchBuyerCore;

export interface StoredResearchBuyerParams {
  walletAddress: `0x${string}`;
  fetchImpl?: typeof fetch;
}

export function createResearchBuyerFromStoredGrant(
  params: StoredResearchBuyerParams
): typeof fetch {
  if (typeof window === "undefined") {
    throw new Error("Stored x402 research buyer is only available in the browser");
  }

  const permission = getResearchPermissionContext(params.walletAddress);
  if (!permission) {
    throw new Error("No active x402 research permission found. Re-release your fighter.");
  }

  const session = getAgentSession(params.walletAddress);
  if (!session) {
    throw new Error("No agent session found. Re-release your fighter.");
  }

  return createResearchBuyerFromSession({
    permission,
    sessionPrivateKey: session.sessionPrivateKey,
    fetchImpl: params.fetchImpl,
  });
}
