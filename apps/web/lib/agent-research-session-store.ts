import type { AgentSession } from "@/lib/metamask";
import type { PermissionMetadata } from "@/lib/types";

export interface ServerResearchSession {
  walletAddress: `0x${string}`;
  sessionAddress: `0x${string}`;
  sessionPrivateKey: `0x${string}`;
  researchPermission: PermissionMetadata;
  updatedAt: number;
}

const sessions = new Map<string, ServerResearchSession>();

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
  return entry;
}

export function getServerResearchSession(walletAddress: string): ServerResearchSession | null {
  return sessions.get(walletAddress.toLowerCase()) ?? null;
}
