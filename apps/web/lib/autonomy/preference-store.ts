import {
  defaultAutonomyPreferences,
  normalizeAutonomyPreferences,
  type AgentAutonomyPreferences,
} from "@/lib/autonomy/preferences";

const globalStore = globalThis as typeof globalThis & {
  __clashboardAutonomyPreferences?: Map<string, AgentAutonomyPreferences>;
};

const store =
  globalStore.__clashboardAutonomyPreferences ??
  (globalStore.__clashboardAutonomyPreferences = new Map());

export function getStoredAutonomyPreferences(
  agentOwner: `0x${string}`
): AgentAutonomyPreferences {
  return store.get(agentOwner.toLowerCase()) ?? defaultAutonomyPreferences(agentOwner);
}

export function setStoredAutonomyPreferences(
  prefs: AgentAutonomyPreferences
): AgentAutonomyPreferences {
  const normalized = normalizeAutonomyPreferences(prefs, prefs.agentOwner);
  store.set(normalized.agentOwner.toLowerCase(), normalized);
  return normalized;
}
