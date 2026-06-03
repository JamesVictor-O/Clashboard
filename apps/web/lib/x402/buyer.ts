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

  const delegationProvider: x402DelegationProvider = async () => {
    const redelegation = await walletClient.redelegatePermissionContextOpen({
      environment: getSmartAccountsEnvironment(chain.id),
      permissionContext: params.permission.context as `0x${string}`,
      chainId: chain.id,
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
