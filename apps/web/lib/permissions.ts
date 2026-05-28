"use client";

import type { GrantedPermission } from "@/lib/metamask";

// ─── ERC-7715 permission context storage ─────────────────────────────────────
//
// This module stores and retrieves ERC-7715 permission metadata only.
// It intentionally does NOT store the agent session private key — that lives
// exclusively in AgentSession (see lib/metamask.ts getOrCreateAgentSession).
//
// Two-layer storage design:
//   clashboard_perms_<addr>         ← this file  (permission metadata, safe)
//   clashboard_agent_session_<addr> ← metamask.ts (session identity, includes key)

/**
 * Permission metadata as persisted to localStorage.
 * Extends GrantedPermission with a client-side timestamp.
 * Never contains a private key.
 */
export interface StoredPermission extends GrantedPermission {
  createdAt: number;
  grantedAt: number; // unix seconds — when the grant was first stored
  active: boolean;
}

const PERMISSION_KEY = (addr: string) =>
  `clashboard_perms_${addr.toLowerCase()}`;

// ─── Write ────────────────────────────────────────────────────────────────────

export function storePermissionContext(
  address: string,
  grant: GrantedPermission
): void {
  if (typeof window === "undefined") return;
  const now = Math.floor(Date.now() / 1000);
  const data: StoredPermission = {
    ...grant,
    walletAddress: (grant.walletAddress ?? address) as `0x${string}`,
    budgetPeriod: grant.budgetPeriod ?? "1 day",
    createdAt: grant.createdAt ?? now,
    active: grant.active ?? true,
    grantedAt: now,
  };
  localStorage.setItem(PERMISSION_KEY(address), JSON.stringify(data));
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Return the stored permission if it exists and has not expired.
 * Clears stale entries automatically.
 * Returns null if absent, malformed, or within 60 s of expiry.
 */
export function getPermissionContext(address: string): StoredPermission | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PERMISSION_KEY(address));
    if (!raw) return null;

    const stored: StoredPermission = JSON.parse(raw);

    // Validate minimum required shape before trusting the data
    if (
      typeof stored.context !== "string" ||
      typeof stored.expiry !== "number" ||
      typeof stored.sessionAddress !== "string"
    ) {
      localStorage.removeItem(PERMISSION_KEY(address));
      return null;
    }

    const migrated: StoredPermission = {
      ...stored,
      walletAddress: (stored.walletAddress ?? address) as `0x${string}`,
      budgetPeriod: stored.budgetPeriod ?? "1 day",
      createdAt: stored.createdAt ?? stored.grantedAt ?? Math.floor(Date.now() / 1000),
      active: stored.active ?? true,
    };

    if (!migrated.active) return null;

    // Expire 60 s early to avoid edge-case denials at the exact boundary
    if (Math.floor(Date.now() / 1000) >= migrated.expiry - 60) {
      localStorage.removeItem(PERMISSION_KEY(address));
      return null;
    }

    return migrated;
  } catch {
    // Malformed JSON or unexpected parse error — discard
    localStorage.removeItem(PERMISSION_KEY(address));
    return null;
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function clearPermissionContext(address: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PERMISSION_KEY(address));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isPermissionValid(address: string): boolean {
  return getPermissionContext(address) !== null;
}

/** Human-readable label for how long a permission has until it expires. */
export function permissionExpiryLabel(expiry: number): string {
  const remaining = expiry - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return "expired";
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
