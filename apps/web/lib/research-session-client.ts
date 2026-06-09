"use client";

import { getAgentSession } from "@/lib/metamask";
import { getResearchPermissionContext } from "@/lib/permissions";

export async function registerResearchSessionForBackend(
  walletAddress: `0x${string}`
): Promise<void> {
  const session = getAgentSession(walletAddress);
  const researchPermission = getResearchPermissionContext(walletAddress);

  if (!session) {
    throw new Error(
      `Missing local agent session for ${walletAddress}. Re-forge or re-authorize this agent before starting a live battle.`
    );
  }

  if (!researchPermission) {
    throw new Error(
      `Missing x402 research permission for ${walletAddress}. Add permission from the agent page before starting a live battle.`
    );
  }

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
