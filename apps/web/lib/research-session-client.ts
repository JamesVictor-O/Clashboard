"use client";

import { getAgentSession } from "@/lib/metamask";
import { getResearchPermissionContext } from "@/lib/permissions";

export async function registerResearchSessionForBackend(
  walletAddress: `0x${string}`
): Promise<void> {
  const session = getAgentSession(walletAddress);
  const researchPermission = getResearchPermissionContext(walletAddress);

  if (!session || !researchPermission) return;

  const response = await fetch("/api/agent/research-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, researchPermission }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Research session registration failed: ${response.status} ${text}`);
  }
}
