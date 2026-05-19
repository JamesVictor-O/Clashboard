"use client";

import { MetaMaskSDK, type SDKProvider } from "@metamask/sdk";

// ─── SDK Singleton ────────────────────────────────────────────────────────────

let _sdk: MetaMaskSDK | null = null;
let _provider: SDKProvider | null = null;

export function getMetaMaskSDK(): MetaMaskSDK {
  if (!_sdk) {
    _sdk = new MetaMaskSDK({
      appMetadata: {
        name: "Clashboard",
        iconUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/icon.png`,
        description: "AI debate arena — bet on your agent",
        url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      },
      dappMetadata: {
        name: "Clashboard",
        url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      },
      // Celo Alfajores by default
      defaultReadOnlyChainId: `0x${(44787).toString(16)}`,
    });
  }
  return _sdk;
}

export async function connectWallet(): Promise<string[]> {
  const sdk = getMetaMaskSDK();
  const provider = sdk.getProvider();

  if (!provider) {
    throw new Error("MetaMask provider not available");
  }

  _provider = provider;

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];

  return accounts;
}

export function getProvider(): SDKProvider | null {
  return _provider ?? getMetaMaskSDK().getProvider() ?? null;
}

// ─── ERC-7715 Permissions ─────────────────────────────────────────────────────

export interface PermissionSpec {
  type: string;
  data: Record<string, unknown>;
}

export interface GrantPermissionsParams {
  /** The smart account address to grant permissions for */
  account: string;
  /** Expiry timestamp (unix seconds) */
  expiry: number;
  /** Array of permission specs */
  permissions: PermissionSpec[];
}

/**
 * Request ERC-7715 session permissions from the user's wallet.
 * Used to set the "arena budget" — a pre-approved spending limit
 * that lets the platform deduct bets without per-tx confirmations.
 */
export async function grantPermissions(
  params: GrantPermissionsParams
): Promise<{ permissionsContext: string; grantedPermissions: PermissionSpec[] }> {
  const provider = getProvider();

  if (!provider) {
    throw new Error("Wallet not connected");
  }

  const result = await provider.request({
    method: "wallet_grantPermissions",
    params: [
      {
        account: params.account,
        expiry: params.expiry,
        permissions: params.permissions,
      },
    ],
  });

  return result as {
    permissionsContext: string;
    grantedPermissions: PermissionSpec[];
  };
}

/**
 * Build a standard ERC-7715 native token spending permission.
 * Used for the arena budget — allows the platform to deduct USDC
 * up to `limitUSDC` without per-transaction approval.
 */
export function buildSpendingPermission(limitUSDC: number): PermissionSpec {
  const limitMicro = BigInt(Math.round(limitUSDC * 1_000_000));

  return {
    type: "erc20-token-transfer",
    data: {
      address: process.env.NEXT_PUBLIC_USDC_ADDRESS,
      allowance: limitMicro.toString(),
    },
  };
}

/**
 * Switch the connected wallet to Celo Alfajores (testnet).
 */
export async function switchToCelo(): Promise<void> {
  const provider = getProvider();
  if (!provider) throw new Error("Wallet not connected");

  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "44787");
  const chainIdHex = `0x${chainId.toString(16)}`;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (err: unknown) {
    // Chain not added — add it
    if ((err as { code?: number }).code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: "Celo Alfajores Testnet",
            nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
            rpcUrls: ["https://alfajores-forno.celo-testnet.org"],
            blockExplorerUrls: ["https://alfajores.celoscan.io"],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}
