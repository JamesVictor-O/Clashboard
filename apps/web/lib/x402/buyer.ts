import { x402Erc7710Client, type x402DelegationProvider } from "@metamask/x402";
import { erc7710WalletActions } from "@metamask/smart-accounts-kit/actions";
import { getSmartAccountsEnvironment } from "@metamask/smart-accounts-kit";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { Network } from "@x402/core/types";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { X402_NETWORK_ID } from "@/lib/x402/facilitator";
import type { PermissionMetadata } from "@/lib/types";

export interface ResearchBuyerParams {
  delegationProvider: x402DelegationProvider;
  fetchImpl?: typeof fetch;
  network?: Network;
}

export interface ResearchBuyerFromSessionParams {
  permission: PermissionMetadata;
  sessionPrivateKey: `0x${string}`;
  fetchImpl?: typeof fetch;
}

export function createResearchBuyer(params: ResearchBuyerParams): typeof fetch {
  const erc7710Client = new x402Erc7710Client({
    delegationProvider: params.delegationProvider,
  });

  const coreClient = new x402Client().register(
    params.network ?? X402_NETWORK_ID,
    erc7710Client
  );

  return wrapFetchWithPayment(
    params.fetchImpl ?? fetch,
    new x402HTTPClient(coreClient)
  );
}

export function createResearchBuyerFromSession(
  params: ResearchBuyerFromSessionParams
): typeof fetch {
  const chain = params.permission.chainId === 8453 ? base : baseSepolia;
  const sessionAccount = privateKeyToAccount(params.sessionPrivateKey);
  const walletClient = createWalletClient({
    account: sessionAccount,
    chain,
    transport: http(),
  }).extend(erc7710WalletActions());

  const delegationProvider: x402DelegationProvider = async (paymentRequirements) => {
    const facilitatorAddress = selectFacilitatorAddress(paymentRequirements);
    const redelegation = await walletClient.redelegatePermissionContext({
      environment: getSmartAccountsEnvironment(chain.id),
      permissionContext: params.permission.context as `0x${string}`,
      chainId: chain.id,
      to: facilitatorAddress,
    });

    return {
      delegationManager: params.permission.delegationManager,
      permissionContext: redelegation.permissionContext,
      delegator: params.permission.walletAddress,
    };
  };

  return createResearchBuyer({
    delegationProvider,
    fetchImpl: params.fetchImpl,
    network: `eip155:${chain.id}` as Network,
  });
}

function selectFacilitatorAddress(paymentRequirements: {
  extra?: Record<string, unknown>;
}): `0x${string}` {
  const configured = process.env.FACILITATOR_SIGNER_ADDRESS;
  const advertised = paymentRequirements.extra?.facilitatorAddresses;
  const candidates = Array.isArray(advertised) ? advertised : [];
  const address = candidates.find(
    (value): value is string => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
  ) ?? configured;

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(
      "x402 facilitator signer address was not advertised. Check /api/facilitator/supported and FACILITATOR_SIGNER_ADDRESS."
    );
  }

  return address as `0x${string}`;
}
