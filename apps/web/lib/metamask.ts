"use client";

import { MetaMaskSDK, type SDKProvider } from "@metamask/sdk";
import { createWalletClient, custom, parseUnits } from "viem";
import { baseSepolia, base } from "viem/chains";
import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// ─── SDK Singleton ────────────────────────────────────────────────────────────

let _sdk: MetaMaskSDK | null = null;
let _provider: SDKProvider | null = null;

export function getMetaMaskSDK(): MetaMaskSDK {
  if (!_sdk) {
    _sdk = new MetaMaskSDK({
      dappMetadata: {
        name: "Clashboard",
        url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        iconUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/icon.png`,
        base64Icon: undefined,
      },
    });
  }
  return _sdk;
}

export async function connectWallet(): Promise<string[]> {
  const sdk = getMetaMaskSDK();
  const provider = sdk.getProvider();
  if (!provider) throw new Error("MetaMask provider not available");
  _provider = provider;
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  return accounts;
}

export function getProvider(): SDKProvider | null {
  if (_provider) return _provider;
  // Use window.ethereum directly — avoids MetaMask SDK initialization which
  // triggers the "choose wallet" modal on every provider request.
  if (typeof window !== "undefined") {
    const eth = (window as unknown as { ethereum?: SDKProvider }).ethereum;
    if (eth) return eth;
  }
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Persistent agent session — the AI fighter's stable EOA identity.
 *
 * The session key is the EOA that MetaMask Flask delegates execution to via
 * ERC-7715. It is stored separately from permission metadata so that:
 *   - The fighter's identity survives permission expiry and renewal.
 *   - The private key is never serialised inside a GrantedPermission object.
 *
 * HACKATHON / DEMO NOTE:
 *   Persisting a raw private key in localStorage is acceptable for this demo
 *   because the key only controls a delegated spending cap — it cannot move
 *   funds beyond what the user explicitly authorised in MetaMask Flask.
 *   In production this key should be:
 *     • Derived deterministically from a wallet signature (BIP-32 / HD path)
 *     • Encrypted with the user's public key before storage
 *     • Or managed by a hardware-backed MPC / secure-enclave service
 */
export interface AgentSession {
  sessionAddress: `0x${string}`;
  sessionPrivateKey: `0x${string}`;
  createdAt: number; // unix seconds
  walletAddress: string;
  chainId: number;
}

/**
 * Permission metadata returned after a successful ERC-7715 grant.
 * Contains only what is needed to use and display the delegation — never
 * the session private key, which lives exclusively in AgentSession.
 */
export interface GrantedPermission {
  context: `0x${string}`;
  delegationManager: `0x${string}`;
  sessionAddress: `0x${string}`;
  walletAddress: `0x${string}`;
  expiry: number; // unix seconds
  budgetUSDC: number;
  budgetPeriod: string;
  chainId: number;
  permissionType: string;
  createdAt: number;
  active: boolean;
}

export interface GrantPermissionsParams {
  account: string;
  expiry: number;
  budgetUSDC: number;
}

// ─── Agent Session Storage ────────────────────────────────────────────────────

const AGENT_SESSION_KEY = (addr: string) =>
  `clashboard_agent_session_${addr.toLowerCase()}`;

/**
 * Return the existing agent session, or generate and persist a new one.
 * Migrates from the legacy single-key format (`clashboard_session_key_*`)
 * if found, preserving the fighter's identity across the refactor.
 */
export function getOrCreateAgentSession(walletAddress: string): AgentSession {
  if (typeof window === "undefined") throw new Error("Not in browser");

  const storageKey = AGENT_SESSION_KEY(walletAddress);
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");

  // Try new format first
  const existing = localStorage.getItem(storageKey);
  if (existing) {
    try {
      return JSON.parse(existing) as AgentSession;
    } catch {
      // Corrupted — fall through to regenerate
    }
  }

  // Migrate from legacy single-key storage (clashboard_session_key_*)
  const legacyKey = `clashboard_session_key_${walletAddress.toLowerCase()}`;
  const legacyPrivKey = localStorage.getItem(legacyKey) as `0x${string}` | null;
  const sessionPrivateKey = legacyPrivKey ?? generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);

  const session: AgentSession = {
    sessionAddress: sessionAccount.address,
    sessionPrivateKey,
    createdAt: Math.floor(Date.now() / 1000),
    walletAddress: walletAddress.toLowerCase(),
    chainId,
  };

  localStorage.setItem(storageKey, JSON.stringify(session));
  // Clean up legacy key now that it is migrated
  if (legacyPrivKey) localStorage.removeItem(legacyKey);

  return session;
}

/** Read the stored agent session without creating one. Returns null if absent. */
export function getAgentSession(walletAddress: string): AgentSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AGENT_SESSION_KEY(walletAddress));
    if (!raw) return null;
    return JSON.parse(raw) as AgentSession;
  } catch {
    return null;
  }
}

// ─── Chain helpers ────────────────────────────────────────────────────────────

function getActiveChain() {
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");
  return chainId === 8453 ? base : baseSepolia;
}

// ─── ERC-7715 Permissions ─────────────────────────────────────────────────────

const REQUIRED_PERMISSION_TYPE = "erc20-token-periodic" as const;

/**
 * Request an ERC-7715 execution permission from MetaMask Flask.
 *
 * Flow:
 *   1. Build a viem WalletClient extended with erc7715ProviderActions.
 *      Must use window.ethereum directly — MetaMask SDK blocks
 *      wallet_grantPermissions with -32601 when called through its wrapper.
 *   2. Call getSupportedExecutionPermissions (best-effort) to verify that
 *      erc20-token-periodic is available before showing the Flask UI.
 *   3. Call requestExecutionPermissions targeting the agent's session EOA.
 *   4. Return only permission metadata (GrantedPermission).
 *      The session private key stays in AgentSession — it never appears here.
 */
export async function grantPermissions(
  params: GrantPermissionsParams
): Promise<GrantedPermission> {
  if (typeof window === "undefined") throw new Error("Not in browser");

  const chain = getActiveChain();
  const ethereum = (window as unknown as { ethereum: unknown }).ethereum as
    Parameters<typeof custom>[0];

  if (!ethereum) {
    throw new Error(
      "MetaMask Flask not detected — install it at metamask.io/flask"
    );
  }

  const walletClient = createWalletClient({
    chain,
    transport: custom(ethereum),
  }).extend(erc7715ProviderActions());

  // ── Step 1: check supported permission types (best-effort) ────────────────
  // getSupportedExecutionPermissions is not available on all Flask builds;
  // skip gracefully if it throws a "method not found" style error.
  try {
    const supported = await (
      walletClient as unknown as {
        getSupportedExecutionPermissions?: () => Promise<
          Array<{ permissionType: string }>
        >;
      }
    ).getSupportedExecutionPermissions?.();

    if (Array.isArray(supported) && supported.length > 0) {
      const types = supported.map((p) => p.permissionType);
      if (!types.includes(REQUIRED_PERMISSION_TYPE)) {
        throw new Error(
          `MetaMask Flask does not support '${REQUIRED_PERMISSION_TYPE}'. ` +
            `Supported: ${types.join(", ")}. ` +
            `Ensure Smart Accounts Kit is enabled in Flask settings.`
        );
      }
    }
  } catch (err) {
    // Re-throw only if it is our explicit capability error.
    if (err instanceof Error && err.message.includes("does not support")) {
      throw err;
    }
    // Otherwise getSupportedExecutionPermissions is absent on this build — proceed.
  }

  // ── Step 2: resolve agent session (creates one if this is a new fighter) ──
  const session = getOrCreateAgentSession(params.account);

  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;
  if (!usdcAddress) throw new Error("NEXT_PUBLIC_USDC_ADDRESS is not configured");

  const periodAmount = parseUnits(params.budgetUSDC.toString(), 6);

  // ── Step 3: request the delegation grant from Flask ────────────────────────
  const grantedPermissions = await walletClient.requestExecutionPermissions([
    {
      chainId: chain.id,
      expiry: params.expiry,
      to: session.sessionAddress,
      permission: {
        type: REQUIRED_PERMISSION_TYPE,
        data: {
          tokenAddress: usdcAddress,
          periodAmount,
          periodDuration: 86400, // 24-hour rolling window
          justification:
            "Clashboard arena budget — limited USDC/day for agent research and demo arena actions.",
        },
        isAdjustmentAllowed: true,
      },
    },
  ]);

  if (!grantedPermissions || grantedPermissions.length === 0) {
    throw new Error("No permissions were granted by the wallet.");
  }

  const grant = grantedPermissions[0];

  // ── Step 4: return metadata only — private key stays in AgentSession ───────
  return {
    context: grant.context as `0x${string}`,
    delegationManager: grant.delegationManager as `0x${string}`,
    sessionAddress: session.sessionAddress,
    walletAddress: params.account as `0x${string}`,
    expiry: params.expiry,
    budgetUSDC: params.budgetUSDC,
    budgetPeriod: "1 day",
    chainId: chain.id,
    permissionType: REQUIRED_PERMISSION_TYPE,
    createdAt: Math.floor(Date.now() / 1000),
    active: true,
  };
}

/**
 * Switch the connected wallet to the active chain (Base Sepolia by default).
 */
export async function switchToBaseSepolia(): Promise<void> {
  const provider = getProvider();
  if (!provider) throw new Error("Wallet not connected");

  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");
  const chainIdHex = `0x${chainId.toString(16)}`;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: "Base Sepolia",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://sepolia.base.org"],
            blockExplorerUrls: ["https://sepolia.basescan.org"],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}
