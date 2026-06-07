import fs from "fs";
import path from "path";
import type { AgentSession } from "@/lib/metamask";
import type { PermissionMetadata } from "@/lib/types";

export interface ServerResearchSession {
  walletAddress: `0x${string}`;
  sessionAddress: `0x${string}`;
  sessionPrivateKey: `0x${string}`;
  researchPermission: PermissionMetadata;
  updatedAt: number;
}

// ── Persistence ───────────────────────────────────────────────────────────────
// Sessions are written to a JSON file so they survive server hot-reloads and
// process restarts. Without this, the A2A x402 purchase fails every time the
// Next.js dev server reloads between forge and battle.

const SESSION_FILE = path.join(process.cwd(), ".clashboard-sessions.json");

function loadFromDisk(): Map<string, ServerResearchSession> {
  try {
    const raw = fs.readFileSync(SESSION_FILE, "utf8");
    const entries = JSON.parse(raw) as [string, ServerResearchSession][];
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function saveToDisk(map: Map<string, ServerResearchSession>): void {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify([...map.entries()], null, 2), "utf8");
  } catch (err) {
    console.warn("[session-store] Could not write sessions to disk:", err);
  }
}

// Use globalThis so the Map survives Next.js hot-module replacement in dev.
const g = globalThis as typeof globalThis & {
  __clashboardSessions?: Map<string, ServerResearchSession>;
};

if (!g.__clashboardSessions) {
  g.__clashboardSessions = loadFromDisk();
}

const sessions = g.__clashboardSessions;

// ── Public API ────────────────────────────────────────────────────────────────

export function registerServerResearchSession(params: {
  session: AgentSession;
  researchPermission: PermissionMetadata;
}): ServerResearchSession {
  const walletAddress = params.researchPermission.walletAddress.toLowerCase() as `0x${string}`;
  const entry: ServerResearchSession = {
    walletAddress,
    sessionAddress: params.session.sessionAddress,
    sessionPrivateKey: params.session.sessionPrivateKey,
    researchPermission: params.researchPermission,
    updatedAt: Date.now(),
  };
  sessions.set(walletAddress, entry);
  saveToDisk(sessions);
  return entry;
}

export function getServerResearchSession(walletAddress: string): ServerResearchSession | null {
  return sessions.get(walletAddress.toLowerCase()) ?? null;
}
