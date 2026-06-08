/**
 * Server-side store for arena ERC-7715 permission contexts.
 *
 * The arena permission grants the 1Shot public relayer authority to execute
 * USDC transfers on the agent owner's behalf. The `context` field is an
 * on-chain delegation proof — no private key is involved.
 *
 * Persisted to .clashboard-arena-perms.json so permissions survive server
 * restarts. globalThis guards against Next.js HMR re-initialisation.
 */
import fs from "fs";
import path from "path";
import type { PermissionMetadata } from "@/lib/types";

const PERM_FILE = path.join(process.cwd(), ".clashboard-arena-perms.json");

const g = globalThis as typeof globalThis & {
  __clashboardArenaPerms?: Map<string, PermissionMetadata>;
};

function loadFromDisk(): Map<string, PermissionMetadata> {
  try {
    const raw = fs.readFileSync(PERM_FILE, "utf8");
    const entries = JSON.parse(raw) as [string, PermissionMetadata][];
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function saveToDisk(map: Map<string, PermissionMetadata>): void {
  try {
    fs.writeFileSync(PERM_FILE, JSON.stringify([...map.entries()], null, 2), "utf8");
  } catch (err) {
    console.warn("[arena-perm-store] Could not write to disk:", err);
  }
}

if (!g.__clashboardArenaPerms) {
  g.__clashboardArenaPerms = loadFromDisk();
}

const store = g.__clashboardArenaPerms;

export function registerArenaPermission(perm: PermissionMetadata): void {
  store.set(perm.walletAddress.toLowerCase(), perm);
  saveToDisk(store);
}

export function getArenaPermission(walletAddress: string): PermissionMetadata | null {
  return store.get(walletAddress.toLowerCase()) ?? null;
}
