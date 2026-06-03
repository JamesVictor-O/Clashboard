"use client";

import { createWalletClient, custom, parseUnits } from "viem";
import { baseSepolia, base } from "viem/chains";
import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// ─── Provider Helpers ─────────────────────────────────────────────────────────

export type EthereumProvider = Parameters<typeof custom>[0] & {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  selectedAddress?: string;
  isMetaMask?: boolean;
  isPhantom?: boolean;
  providers?: EthereumProvider[];
};

let _provider: EthereumProvider | null = null;
let _discoveredProviders: EthereumProvider[] = [];

type Eip6963ProviderDetail = {
  info?: { name?: string; rdns?: string };
  provider?: EthereumProvider;
};

function rememberProvider(provider: EthereumProvider | undefined) {
  if (!provider || _discoveredProviders.includes(provider)) return;
  _discoveredProviders.push(provider);
}

function isMetaMaskProvider(provider: EthereumProvider | undefined): provider is EthereumProvider {
  return Boolean(provider?.isMetaMask && !provider?.isPhantom);
}

function pickMetaMaskProvider(providers: EthereumProvider[]): EthereumProvider | null {
  return (
    providers.find(isMetaMaskProvider) ??
    providers.find((p) => Boolean(p.isMetaMask)) ??
    null
  );
}

function injectedProviders(): EthereumProvider[] {
  if (typeof window === "undefined") return [];
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  const providers = eth?.providers ?? [];
  return [..._discoveredProviders, ...providers, ...(eth ? [eth] : [])];
}

async function discoverMetaMaskProvider(): Promise<EthereumProvider | null> {
  const immediate = pickMetaMaskProvider(injectedProviders());
  if (immediate) return immediate;

  if (typeof window === "undefined") return null;

  return new Promise((resolve) => {
    const found: EthereumProvider[] = [];
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      if (detail?.provider) {
        rememberProvider(detail.provider);
        const name = `${detail.info?.name ?? ""} ${detail.info?.rdns ?? ""}`.toLowerCase();
        if (isMetaMaskProvider(detail.provider) || name.includes("metamask")) {
          found.push(detail.provider);
        }
      }
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve(pickMetaMaskProvider(found) ?? found[0] ?? pickMetaMaskProvider(injectedProviders()));
    }, 120);
  });
}

export async function connectWallet(): Promise<string[]> {
  const provider = await discoverMetaMaskProvider();
  if (!provider) throw new Error("MetaMask provider not available");
  _provider = provider;
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  return accounts;
}

export function getProvider(): EthereumProvider | null {
  if (_provider) return _provider;
  // Prefer MetaMask's injected provider directly. Multi-wallet aggregators can
  // show a wallet chooser even for "silent" account checks.
  const provider = pickMetaMaskProvider(injectedProviders());
  if (provider) {
    _provider = provider;
    return provider;
  }
  return null;
}

export function getSelectedWalletAddress(): `0x${string}` | null {
  const selected = getProvider()?.selectedAddress;
  return selected && selected.startsWith("0x") ? (selected as `0x${string}`) : null;
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
  context: unknown;
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
  rail?: "arena" | "research";
  totalBudgetUSDC?: number;
}

export interface GrantedPermissionBundle extends GrantedPermission {
  arenaPermission: GrantedPermission;
  researchPermission: GrantedPermission;
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

async function getOneShotRelayerTargetAddress(chainId: number): Promise<`0x${string}`> {
  const relayerUrl =
    process.env.NEXT_PUBLIC_ONESHOT_RELAYER_URL ??
    (chainId === 84532 || chainId === 11155111
      ? "https://relayer.1shotapi.dev/relayers"
      : "https://relayer.1shotapi.com/relayers");

  const res = await fetch(relayerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "relayer_getCapabilities",
      params: [String(chainId)],
    }),
  });

  if (!res.ok) {
    throw new Error(`Unable to load 1Shot relayer capabilities: ${res.status}`);
  }

  const data = (await res.json()) as {
    result?: Record<string, { targetAddress?: `0x${string}` }>;
    error?: { message?: string };
  };
  if (data.error) {
    throw new Error(data.error.message ?? "1Shot relayer capability lookup failed");
  }

  const targetAddress = data.result?.[String(chainId)]?.targetAddress;
  if (!targetAddress) {
    throw new Error(`1Shot relayer does not advertise a target address for chain ${chainId}`);
  }
  return targetAddress;
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
 *   3. Call requestExecutionPermissions once for two grants:
 *      - arena grant scoped to the 1Shot relayer targetAddress
 *      - research grant scoped to the agent session address for x402
 *   4. Return only permission metadata (GrantedPermissionBundle).
 *      The session private key stays in AgentSession — it never appears here.
 */
export async function grantPermissions(
  params: GrantPermissionsParams
): Promise<GrantedPermissionBundle> {
  if (typeof window === "undefined") throw new Error("Not in browser");

  const chain = getActiveChain();
  const ethereum = await discoverMetaMaskProvider();

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

  // ── Step 2: resolve agent session and 1Shot public relayer target ────────
  const session = getOrCreateAgentSession(params.account);
  const relayerTargetAddress = await getOneShotRelayerTargetAddress(chain.id);

  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;
  if (!usdcAddress) throw new Error("NEXT_PUBLIC_USDC_ADDRESS is not configured");

  const totalPeriodAmount = parseUnits(params.budgetUSDC.toString(), 6);
  const arenaAmount = (totalPeriodAmount * 70n) / 100n;
  const researchAmount = totalPeriodAmount - arenaAmount;
  const arenaBudgetUSDC = Number(arenaAmount) / 1_000_000;
  const researchBudgetUSDC = Number(researchAmount) / 1_000_000;

  // ── Step 3: request the delegation grant from Flask ────────────────────────
  // One wallet popup, two correctly scoped grants:
  //   arena    -> 1Shot relayer target address
  //   research -> local agent session address for x402 redelegation
  const grantedPermissions = await walletClient.requestExecutionPermissions([
    {
      chainId: chain.id,
      expiry: params.expiry,
      // The public relayer redeems grants scoped to its advertised targetAddress.
      // The local session key remains stored for demo agent identity only.
      to: relayerTargetAddress,
      permission: {
        type: REQUIRED_PERMISSION_TYPE,
        data: {
          tokenAddress: usdcAddress,
          periodAmount: arenaAmount,
          periodDuration: 86400, // 24-hour rolling window
          justification:
            "Clashboard arena — limited testnet USDC/day for demo arena actions and arena stakes.",
        },
        isAdjustmentAllowed: true,
      },
    },
    {
      chainId: chain.id,
      expiry: params.expiry,
      // x402 research payments are redelegated by the local agent session.
      // The session private key remains in AgentSession demo storage only.
      to: session.sessionAddress,
      permission: {
        type: REQUIRED_PERMISSION_TYPE,
        data: {
          tokenAddress: usdcAddress,
          periodAmount: researchAmount,
          periodDuration: 86400, // 24-hour rolling window
          justification:
            "Clashboard research — limited testnet USDC/day for agent data purchases via x402.",
        },
        isAdjustmentAllowed: true,
      },
    },
  ]);

  if (!grantedPermissions || grantedPermissions.length < 2) {
    throw new Error("No permissions were granted by the wallet.");
  }

  const arenaGrant = grantedPermissions[0];
  const researchGrant = grantedPermissions[1];
  const createdAt = Math.floor(Date.now() / 1000);

  // ── Step 4: return metadata only — private key stays in AgentSession ───────
  const arenaPermission: GrantedPermission = {
    context: arenaGrant.context,
    delegationManager: arenaGrant.delegationManager as `0x${string}`,
    sessionAddress: relayerTargetAddress,
    walletAddress: params.account as `0x${string}`,
    expiry: params.expiry,
    budgetUSDC: arenaBudgetUSDC,
    budgetPeriod: "1 day",
    chainId: chain.id,
    permissionType: REQUIRED_PERMISSION_TYPE,
    createdAt,
    active: true,
    rail: "arena",
    totalBudgetUSDC: params.budgetUSDC,
  };

  const researchPermission: GrantedPermission = {
    context: researchGrant.context,
    delegationManager: researchGrant.delegationManager as `0x${string}`,
    sessionAddress: session.sessionAddress,
    walletAddress: params.account as `0x${string}`,
    expiry: params.expiry,
    budgetUSDC: researchBudgetUSDC,
    budgetPeriod: "1 day",
    chainId: chain.id,
    permissionType: REQUIRED_PERMISSION_TYPE,
    createdAt,
    active: true,
    rail: "research",
    totalBudgetUSDC: params.budgetUSDC,
  };

  return {
    ...arenaPermission,
    arenaPermission,
    researchPermission,
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
