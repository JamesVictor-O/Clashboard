/**
 * In-process store for autonomous agent-loop activity entries.
 * Separate from the executor log so dashboard can display loop scans
 * alongside manual 1Shot executions without mixing the two sources.
 */

export interface LoopLogEntry {
  id: string;
  agentOwner: `0x${string}`;
  actionType: "ACCEPT_CHALLENGE" | "ISSUE_CHALLENGE" | "SKIPPED" | "BLOCKED";
  status: "success" | "failed" | "skipped";
  txHash?: `0x${string}`;
  roomId?: string;
  topic?: string;
  stakeUsdc?: number;
  reason?: string;
  timestamp: number;
}

const g = globalThis as typeof globalThis & {
  __clashboardLoopLog?: LoopLogEntry[];
};

if (!g.__clashboardLoopLog) g.__clashboardLoopLog = [];
const log = g.__clashboardLoopLog;

export function pushLoopEntry(entry: LoopLogEntry): void {
  log.unshift(entry);
  if (log.length > 100) log.pop();
}

export function getLoopLog(agentOwner?: string): LoopLogEntry[] {
  if (!agentOwner) return [...log];
  const addr = agentOwner.toLowerCase();
  return log.filter((e) => e.agentOwner.toLowerCase() === addr);
}

// Re-export executor log so the dashboard only needs one import
export { getExecutionLog } from "@/lib/autonomy/executor";
