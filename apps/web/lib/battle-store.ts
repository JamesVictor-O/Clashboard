import type { Battle, Round, BattlePhase } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export { BattlePhase };

export interface StoredBet {
  side: 1 | 2;
  amount: bigint; // USDC 6-decimal
}

export interface PendingRound {
  roundIndex: number;
  agentAText?: string;
  agentATxHash?: string;
  agentBText?: string;
  agentBTxHash?: string;
}

export interface StoredBattle {
  battle: Battle;
  rubricPreimage: string;
  rounds: Round[];
  bets: Map<string, StoredBet>; // address → bet
  phase: BattlePhase;
  /** Research context strings persisted between step invocations */
  researchContextA?: string;
  researchContextB?: string;
  /** Partial-round progress for the step-based state machine runner */
  pendingRound?: PendingRound;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────
// In production, replace with Redis or a persistent store.
// This works for single-instance deployments and development.

class BattleStore {
  private store = new Map<string, StoredBattle>();

  set(battleId: string, data: StoredBattle): void {
    this.store.set(battleId, data);
  }

  get(battleId: string): StoredBattle | undefined {
    return this.store.get(battleId);
  }

  has(battleId: string): boolean {
    return this.store.has(battleId);
  }

  delete(battleId: string): boolean {
    return this.store.delete(battleId);
  }

  /** List all active battles (not settled) */
  listActive(): StoredBattle[] {
    return Array.from(this.store.values()).filter(
      (s) => s.phase !== "SETTLED"
    );
  }

  /** List all battles */
  listAll(): StoredBattle[] {
    return Array.from(this.store.values());
  }

  /** Clean up settled battles older than 24h */
  cleanup(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const entries = Array.from(this.store.entries());
    for (const [id, stored] of entries) {
      if (
        stored.phase === "SETTLED" &&
        stored.battle.createdAt < cutoff
      ) {
        this.store.delete(id);
      }
    }
  }

  get size(): number {
    return this.store.size;
  }
}

// Singleton — shared across all API route handlers in the same process
export const battleStore = new BattleStore();

// Run cleanup every hour
if (typeof setInterval !== "undefined") {
  setInterval(() => battleStore.cleanup(), 60 * 60 * 1000);
}
