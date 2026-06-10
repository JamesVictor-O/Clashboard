"use client";

import { createPublicClient, createWalletClient, custom, http, parseUnits } from "viem";
import { baseSepolia, base } from "viem/chains";
import {
  Implementation,
  getSmartAccountsEnvironment,
  toMetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";
import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, USDC_ADDRESS } from "@/lib/contracts";

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
  smartAccountAddress?: `0x${string}`;
  smartAccountImplementation?: "Stateless7702";
  smartAccountReady?: boolean;
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

export interface SmartAccountUpgradeStatus {
  walletAddress: `0x${string}`;
  smartAccountAddress: `0x${string}`;
  implementation: "Stateless7702";
  delegationManager: `0x${string}`;
  entryPoint: `0x${string}`;
  isValid7702Implementation: boolean;
  checkedAt: number;
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
  const chainId = CHAIN_ID;

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
  const chainId = CHAIN_ID;
  return chainId === 8453 ? base : baseSepolia;
}

const SA_STATUS_CACHE_TTL = 300; // 5 minutes
const saStatusKey = (addr: string) =>
  `clashboard_sa_status_${addr.toLowerCase()}`;

function loadCachedSmartAccountStatus(
  addr: string
): SmartAccountUpgradeStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(saStatusKey(addr));
    if (!raw) return null;
    const status = JSON.parse(raw) as SmartAccountUpgradeStatus;
    if (Math.floor(Date.now() / 1000) - status.checkedAt > SA_STATUS_CACHE_TTL) return null;
    return status;
  } catch {
    return null;
  }
}

function cacheSmartAccountStatus(status: SmartAccountUpgradeStatus): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(saStatusKey(status.walletAddress), JSON.stringify(status));
  } catch {}
}

async function getSmartAccountUpgradeStatus(
  account: string
): Promise<SmartAccountUpgradeStatus> {
  const chain = getActiveChain();
  const environment = getSmartAccountsEnvironment(chain.id);
  const publicClient = createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
  });

  const smartAccount = await toMetaMaskSmartAccount({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: publicClient as any,
    implementation: Implementation.Stateless7702,
    address: account as `0x${string}`,
    environment,
  });

  const smartAccountAddress = await smartAccount.getAddress();
  const isValid7702Implementation = await smartAccount.isDeployed();

  return {
    walletAddress: account as `0x${string}`,
    smartAccountAddress,
    implementation: "Stateless7702",
    delegationManager: environment.DelegationManager,
    entryPoint: environment.EntryPoint,
    isValid7702Implementation,
    checkedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Check whether a connected EOA has been upgraded to a MetaMask 7702 smart
 * account. Results are cached in localStorage for 5 minutes to avoid an RPC
 * call on every page navigation. Pass `forceRefresh` to bypass the cache
 * (e.g. immediately after a permissions grant).
 */
export async function checkSmartAccountStatus(
  account: string,
  forceRefresh = false
): Promise<SmartAccountUpgradeStatus> {
  if (!forceRefresh) {
    const cached = loadCachedSmartAccountStatus(account);
    if (cached) return cached;
  }
  const status = await getSmartAccountUpgradeStatus(account);
  cacheSmartAccountStatus(status);
  return status;
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
 *   2. Resolve the connected EOA as a MetaMask Stateless7702 smart account
 *      using Smart Accounts Kit. This verifies the DelegationManager/7702
 *      environment the permission will use.
 *   3. Call getSupportedExecutionPermissions (best-effort) to verify that
 *      erc20-token-periodic is available before showing the Flask UI.
 *   4. Call requestExecutionPermissions once for two grants:
 *      - arena grant scoped to the 1Shot relayer targetAddress
 *      - research grant scoped to the agent session address for x402
 *   5. Return only permission metadata (GrantedPermissionBundle).
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

  // ── Step 0: Smart Accounts Kit 7702 preflight ─────────────────────────────
  // ERC-7715 grants are intended to execute through MetaMask's smart-account
  // delegation environment. If this returns false, MetaMask can still complete
  // the setup during the permission request, but we record the preflight state
  // so the UI/backend can prove this wallet is on the 7702 smart-account path.
  const smartAccountStatus = await getSmartAccountUpgradeStatus(params.account);

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

  // ── Step 2: resolve agent session ────────────────────────────────────────
  const session = getOrCreateAgentSession(params.account);

  const usdcAddress = USDC_ADDRESS;

  const totalPeriodAmount = parseUnits(params.budgetUSDC.toString(), 6);
  // Budget split is informational — the session key holds the full grant and
  // sub-delegates to arena/research executors separately at use time.
  const arenaAmount      = (totalPeriodAmount * 70n) / 100n;
  const researchAmount   = totalPeriodAmount - arenaAmount;
  const arenaBudgetUSDC  = Number(arenaAmount)   / 1_000_000;
  const researchBudgetUSDC = Number(researchAmount) / 1_000_000;

  // ── Step 3: request the delegation grant from Flask ────────────────────────
  // ONE popup, ONE grant — scoped to the agent's session key.
  //
  // EIP-7715 issues one MetaMask confirmation dialog per wallet_grantPermissions
  // call. Two different `to` addresses require two calls → two popups. Instead we
  // grant the full budget to the session key once. The session key sub-delegates to
  // each executor at use time via ERC-7710 redelegatePermissionContext:
  //   arena    → execute1Shot re-delegates to 1Shot relayer target
  //   research → createResearchBuyerFromSession re-delegates to x402 facilitator
  const grantedPermissions = await walletClient.requestExecutionPermissions([
    {
      chainId: chain.id,
      expiry: params.expiry,
      to: session.sessionAddress,
      permission: {
        type: REQUIRED_PERMISSION_TYPE,
        data: {
          tokenAddress: usdcAddress,
          periodAmount: totalPeriodAmount, // full budget — session key manages the split
          periodDuration: 86400,           // 24-hour rolling window
          justification:
            "Clashboard — limited testnet USDC/day for arena battles and agent research purchases.",
        },
        isAdjustmentAllowed: true,
      },
    },
  ]);

  if (!grantedPermissions || grantedPermissions.length < 1) {
    throw new Error("No permissions were granted by the wallet.");
  }

  const singleGrant = grantedPermissions[0];
  const createdAt = Math.floor(Date.now() / 1000);

  // ── Step 4: return metadata only — private key stays in AgentSession ───────
  // Both rails share the same context; rail-specific budgetUSDC is informational.
  const basePermission: GrantedPermission = {
    context: singleGrant.context,
    delegationManager: singleGrant.delegationManager as `0x${string}`,
    sessionAddress: session.sessionAddress,
    walletAddress: params.account as `0x${string}`,
    smartAccountAddress: smartAccountStatus.smartAccountAddress,
    smartAccountImplementation: smartAccountStatus.implementation,
    smartAccountReady: smartAccountStatus.isValid7702Implementation,
    expiry: params.expiry,
    budgetUSDC: params.budgetUSDC,
    budgetPeriod: "1 day",
    chainId: chain.id,
    permissionType: REQUIRED_PERMISSION_TYPE,
    createdAt,
    active: true,
    totalBudgetUSDC: params.budgetUSDC,
  };

  const arenaPermission: GrantedPermission    = { ...basePermission, rail: "arena",    budgetUSDC: arenaBudgetUSDC };
  const researchPermission: GrantedPermission = { ...basePermission, rail: "research", budgetUSDC: researchBudgetUSDC };

  // After a successful grant, MetaMask Flask sets the EIP-7702 authorization so
  // the EOA is now a smart account. Force-refresh the cached status so the
  // ConnectWallet badge flips to green on next render.
  try {
    await checkSmartAccountStatus(params.account, true);
  } catch {
    // Non-fatal — cache will be updated on the next natural check.
  }

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

  const chainId = CHAIN_ID;
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
