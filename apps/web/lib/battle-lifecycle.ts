import { runDebateRound, runResearchPhase, setupBattle } from "@/lib/agents/orchestrator";
import {
  battleStore,
  type DebateTurnKey,
  type DebateTurnState,
  type StoredBattle,
} from "@/lib/battle-store";
import { deterministicRubricJson, ensureBattleRuntime } from "@/lib/battle-runtime";
import { researchStore } from "@/lib/research-store";
import {
  advanceRoundOnChain,
  argContentHash,
  buildRubricCommitment,
  closeBettingOnChain,
  commitRubricOnChain,
  getArenaBattleSnapshot,
  getBattlePhase,
  isArgumentSubmittedOnChain,
  getPublicClient,
  startDebateOnChain,
  submitArgumentOnChain,
} from "@/lib/chain";
import type { BattlePhase, ResearchPurchase, Round } from "@/lib/types";
import { settleBattleWithVenice } from "@/lib/battle-settlement";

export type BattleLifecycleEvent =
  | { type: "phase"; data: "RESEARCH" | "DEBATE" | "DONE" }
  | { type: "round_start"; data: { round: number; totalRounds: number } }
  | { type: "turn"; data: { agent: "A" | "B"; round: number } }
  | { type: "research"; data: ResearchPurchase }
  | { type: "token"; data: { agent: "A" | "B"; text: string } }
  | { type: "round"; data: Round & { txA?: string; txB?: string } }
  | { type: "error"; data: string };

export interface RunBattleLifecycleOptions {
  rounds?: number;
  onEvent?: (event: BattleLifecycleEvent) => void;
}

export interface BattleLifecycleResult {
  battleId: `0x${string}`;
  phase: StoredBattle["phase"];
  roundsCompleted: number;
  researchPurchases: ResearchPurchase[];
}

const inFlight = new Map<string, Promise<BattleLifecycleResult>>();

function isRoundPhase(phase: string) {
  return phase === "ROUND_1" || phase === "ROUND_2" || phase === "ROUND_3";
}

async function waitForTx(hash?: string) {
  if (!hash) return;
  await getPublicClient().waitForTransactionReceipt({
    hash: hash as `0x${string}`,
    confirmations: 1,
  });
}

async function safeWrite(label: string, action: () => Promise<string>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const hash = await action();
      await waitForTx(hash);
      return hash;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("Not betting") ||
        message.includes("Not preparing") ||
        message.includes("Rubric already committed") ||
        message.includes("Argument already submitted")
      ) {
        console.warn(`${label} skipped: ${summarizeContractSkip(message)}`);
        return undefined;
      }

      if (isTransientArenaWriteError(message) && attempt < 4) {
        const delayMs = 4_000 + attempt * 3_000;
        console.warn(`${label} retrying after transient RPC limit (${attempt + 1}/5)`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw err;
    }
  }
}

function summarizeContractSkip(message: string): string {
  const reasonMatch = message.match(/reason:\n([^\n]+)/);
  const detailsMatch = message.match(/Details:\s*execution reverted:\s*([^\n]+)/);
  return reasonMatch?.[1]?.trim() ?? detailsMatch?.[1]?.trim() ?? message.split("\n")[0] ?? "already handled";
}

function isTransientArenaWriteError(message: string): boolean {
  return (
    message.includes("in-flight transaction limit reached") ||
    message.includes("replacement transaction underpriced") ||
    message.includes("nonce too low") ||
    message.includes("already known")
  );
}

export async function runBattleLifecycle(
  battleId: `0x${string}`,
  options: RunBattleLifecycleOptions = {}
): Promise<BattleLifecycleResult> {
  const existingJob = inFlight.get(battleId);
  if (existingJob) return existingJob;

  const job = runBattleLifecycleOnce(battleId, options).finally(() => {
    inFlight.delete(battleId);
  });
  inFlight.set(battleId, job);
  return job;
}

async function runBattleLifecycleOnce(
  battleId: `0x${string}`,
  options: RunBattleLifecycleOptions
): Promise<BattleLifecycleResult> {
  const emit = (event: BattleLifecycleEvent) => options.onEvent?.(event);
  const stored = await ensureBattleRuntime(battleId);

  if (!stored) throw new Error("Battle not found");
  if (stored.phase === "BETTING") throw new Error("Battle is still in betting phase");
  if (stored.phase === "JUDGING_READY" || stored.phase === "SETTLED") {
    return {
      battleId,
      phase: stored.phase,
      roundsCompleted: stored.rounds.length,
      researchPurchases: stored.battle.researchPurchases ?? [],
    };
  }
  if (!isRoundPhase(stored.phase) && stored.phase !== "PREPARING" && stored.phase !== "RESEARCH" && stored.phase !== "LIVE") {
    throw new Error("Battle is not in an active round");
  }

  const rubric = buildRubricCommitment(
    deterministicRubricJson(battleId, stored.battle.topic)
  );
  await safeWrite("commitRubric", () =>
    commitRubricOnChain({ battleId, rubricHash: rubric.hash })
  );

  await safeWrite("closeBetting", () => closeBettingOnChain({ battleId }));

  const { agentAConfig, agentBConfig } = await setupBattle(stored.battle);
  const existingPurchases = researchStore.listBattlePurchases(battleId);

  if (existingPurchases.length > 0) {
    stored.battle.researchPurchases = existingPurchases;
    existingPurchases.forEach((purchase) => emit({ type: "research", data: purchase }));
  } else {
    emit({ type: "phase", data: "RESEARCH" });
    stored.phase = "RESEARCH";

    await runResearchPhase(stored.battle, agentAConfig, agentBConfig, (purchase) => {
      researchStore.recordBattlePurchase(battleId, purchase);
      stored.battle.researchPurchases = [
        ...(stored.battle.researchPurchases ?? []),
        purchase,
      ];
      emit({ type: "research", data: purchase });
    });
  }

  emit({ type: "phase", data: "DEBATE" });
  stored.phase = "LIVE";

  const totalRounds = Math.min(options.rounds ?? 2, stored.battle.totalRounds ?? 2);
  await safeWrite("startDebate", () => startDebateOnChain({ battleId }));

  for (let i = stored.rounds.length; i < totalRounds; i++) {
    emit({ type: "round_start", data: { round: i + 1, totalRounds } });

    let agentAText = "";
    emit({ type: "turn", data: { agent: "A", round: i + 1 } });
    await runDebateRound(stored.battle, agentAConfig, "A", stored.rounds, (token) => {
      agentAText += token;
      emit({ type: "token", data: { agent: "A", text: token } });
    });

    let agentBText = "";
    emit({ type: "turn", data: { agent: "B", round: i + 1 } });
    await runDebateRound(stored.battle, agentBConfig, "B", stored.rounds, (token) => {
      agentBText += token;
      emit({ type: "token", data: { agent: "B", text: token } });
    });

    let txA: string | undefined;
    let txB: string | undefined;
    try {
      txA = await safeWrite(`submitArgument A round ${i + 1}`, () =>
        submitArgumentOnChain({
          battleId,
          side: 1,
          contentHash: argContentHash(agentAText),
        })
      );
      txB = await safeWrite(`submitArgument B round ${i + 1}`, () =>
        submitArgumentOnChain({
          battleId,
          side: 2,
          contentHash: argContentHash(agentBText),
        })
      );
    } catch (err) {
      console.error(`submitArgument round ${i + 1} failed:`, err);
      emit({ type: "error", data: `Round ${i + 1} on-chain submission failed` });
      throw err;
    }

    const round = {
      index: i,
      agentAText,
      agentBText,
      timestamp: Date.now(),
      txA,
      txB,
    };
    stored.rounds.push(round);
    emit({ type: "round", data: round });

    await safeWrite(`advanceRound ${i + 1}`, () => advanceRoundOnChain({ battleId }));
  }

  emit({ type: "phase", data: "DONE" });
  stored.phase = "JUDGING_READY";
  battleStore.set(battleId, stored);

  return {
    battleId,
    phase: stored.phase,
    roundsCompleted: stored.rounds.length,
    researchPurchases: stored.battle.researchPurchases ?? [],
  };
}

// ─── State-Machine Step Runner ────────────────────────────────────────────────

export type BattleStepAction =
  | "WAITING"         // betting deadline not yet reached
  | "CLOSE_BETTING"   // closed betting → PREPARING
  | "START_DEBATE"    // research done, debate started → ROUND_1
  | "SUBMITTED_A"     // generated + on-chain submitted Agent A argument only
  | "SUBMITTED_B"     // generated + on-chain submitted Agent B argument only
  | "SUBMITTED_BOTH"  // generated + submitted both agents in one step (normal path)
  | "ADVANCED_ROUND"  // both args submitted, round advanced to next phase
  | "SETTLED"         // judging complete, battle settled
  | "NO_OP";          // terminal state, nothing to do

export interface BattleStepResult {
  battleId: `0x${string}`;
  action: BattleStepAction;
  /** Contract phase AFTER this step completes */
  phase: BattlePhase;
  roundIndex?: number;
  txHash?: string;
  details?: string;
  logs: string[];
  /** Debate text produced in this step — present for SUBMITTED_A / SUBMITTED_B / ADVANCED_ROUND */
  agentAText?: string;
  agentBText?: string;
  /** Winner side — present for SETTLED */
  winnerSide?: "A" | "B";
  /** Aggregate judge scores (0-100 each) — present for SETTLED */
  judgeScores?: { A: number; B: number };
}

function phaseFromContractNum(n: number): BattlePhase {
  if (n === 0) return "BETTING";
  if (n === 1) return "PREPARING";
  if (n === 2) return "ROUND_1";
  if (n === 3) return "ROUND_2";
  if (n === 4) return "ROUND_3";
  if (n === 5) return "JUDGING_READY";
  if (n === 6) return "SETTLED";
  if (n === 7) return "CANCELLED";
  if (n === 8) return "EXPIRED";
  return "SETTLED";
}

/** Concurrent step guard — prevents two ticks from racing on the same battle. */
const stepInFlight = new Set<string>();

/** Prefetch guard — at most one lookahead generation per battle turn at a time. */
const prefetchInFlight = new Set<string>();

function debateTurnKey(roundIndex: number, side: "A" | "B"): DebateTurnKey | null {
  if (roundIndex === 0 && side === "A") return "round1_agentA";
  if (roundIndex === 0 && side === "B") return "round1_agentB";
  if (roundIndex === 1 && side === "A") return "round2_agentA";
  if (roundIndex === 1 && side === "B") return "round2_agentB";
  return null;
}

function setDebateTurnState(
  stored: StoredBattle,
  key: DebateTurnKey,
  state: Omit<DebateTurnState, "updatedAt">
) {
  stored.debateTurns = {
    ...(stored.debateTurns ?? {}),
    [key]: { ...state, updatedAt: Date.now() },
  };
}

function completedRoundFromPending(stored: StoredBattle): Round | null {
  const pending = stored.pendingRound;
  if (!pending?.agentAText || !pending?.agentBText) return null;
  return {
    index: pending.roundIndex,
    agentAText: pending.agentAText,
    agentBText: pending.agentBText,
    timestamp: Date.now(),
  };
}

function roundsForGeneration(stored: StoredBattle, roundIndex: number, side: "A" | "B"): Round[] | null {
  if (roundIndex === 0) return stored.rounds;

  const rounds = [...stored.rounds];
  const currentPendingAsPrior = completedRoundFromPending(stored);
  if (currentPendingAsPrior && currentPendingAsPrior.index === roundIndex - 1) {
    rounds.push(currentPendingAsPrior);
  }

  if (side === "B" && roundIndex === 1) {
    const key = debateTurnKey(roundIndex, "A");
    const agentAText = key ? stored.debateTurns?.[key]?.text ?? stored.pendingRound?.agentAText : stored.pendingRound?.agentAText;
    if (!agentAText) return null;
    const roundOne = rounds.find((round) => round.index === 0);
    if (!roundOne) return null;
    return [
      roundOne,
      {
        index: roundIndex,
        agentAText,
        agentBText: "",
        timestamp: Date.now(),
      },
    ];
  }

  return rounds;
}

async function generateTurnText(stored: StoredBattle, roundIndex: number, side: "A" | "B"): Promise<string | null> {
  const rounds = roundsForGeneration(stored, roundIndex, side);
  if (!rounds) return null;

  const { agentAConfig, agentBConfig } = await setupBattle(stored.battle);
  if (stored.researchContextA) agentAConfig.researchContext = stored.researchContextA;
  if (stored.researchContextB) agentBConfig.researchContext = stored.researchContextB;
  const agentConfig = side === "A" ? agentAConfig : agentBConfig;

  let text = "";
  await runDebateRound(stored.battle, agentConfig, side, rounds, (token) => {
    text += token;
  });
  return text;
}

/**
 * Pre-generate a single upcoming debate turn while the opponent is speaking.
 * Round 2 A sees both round 1 openings. Round 2 B sees round 1 plus A's
 * round 2 rebuttal, so the second rebuttal is actually reactive.
 */
export async function prefetchDebateTurn(
  battleId: `0x${string}`,
  params: { roundIndex: number; side: "A" | "B" }
): Promise<DebateTurnState | undefined> {
  const key = debateTurnKey(params.roundIndex, params.side);
  if (!key) return undefined;

  const flightKey = `${battleId}:${key}`;
  if (prefetchInFlight.has(flightKey)) {
    return battleStore.get(battleId)?.debateTurns?.[key];
  }
  prefetchInFlight.add(flightKey);
  try {
    const stored = battleStore.get(battleId);
    if (!stored) return undefined;

    const existing = stored.debateTurns?.[key];
    if (existing?.status === "ready" && existing.text) return existing;

    setDebateTurnState(stored, key, { status: "generating" });
    battleStore.set(battleId, stored);
    console.log(`[Prefetch] generating ${key} for battle ${battleId}`);

    const text = await generateTurnText(stored, params.roundIndex, params.side);
    const latest = battleStore.get(battleId) ?? stored;
    if (latest.debateTurns?.[key]?.status === "completed") {
      return latest.debateTurns[key];
    }
    if (!text) {
      setDebateTurnState(latest, key, {
        status: "failed",
        error: "Required prior turn context is not ready.",
      });
      battleStore.set(battleId, latest);
      return latest.debateTurns?.[key];
    }

    setDebateTurnState(latest, key, { status: "ready", text });
    battleStore.set(battleId, latest);
    console.log(`[Prefetch] ${key} ready for battle ${battleId}`);
    return latest.debateTurns?.[key];
  } catch (err) {
    const stored = battleStore.get(battleId);
    if (stored) {
      setDebateTurnState(stored, key, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      battleStore.set(battleId, stored);
    }
    console.warn(`[Prefetch] background generation failed for ${battleId}:${key}:`, err);
    // Non-fatal — the main step runner will generate normally on the next tick.
    return stored?.debateTurns?.[key];
  } finally {
    prefetchInFlight.delete(flightKey);
  }
}

/**
 * Advance a battle by exactly one logical step based on the current contract phase.
 *
 * Callers (worker, cron, admin) invoke this repeatedly until the battle is SETTLED.
 * Each invocation reads the authoritative on-chain phase, performs one action, and
 * returns immediately — it never loops through multiple rounds in one call.
 *
 * Sub-round progress (which agent has argued this round) is persisted in
 * StoredBattle.pendingRound so the step is fully restartable and idempotent.
 */
export async function processBattleStep(
  battleId: `0x${string}`,
  options: { onEvent?: (event: BattleLifecycleEvent) => void } = {}
): Promise<BattleStepResult> {
  if (stepInFlight.has(battleId)) {
    throw new Error(`Step already in progress for battle ${battleId}`);
  }
  stepInFlight.add(battleId);
  try {
    return await _runStep(battleId, options);
  } finally {
    stepInFlight.delete(battleId);
  }
}

async function _runStep(
  battleId: `0x${string}`,
  options: { onEvent?: (event: BattleLifecycleEvent) => void }
): Promise<BattleStepResult> {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    console.log(`[STEP] ${msg}`);
  };
  const emit = (event: BattleLifecycleEvent) => options.onEvent?.(event);

  const stored = await ensureBattleRuntime(battleId);
  if (!stored) throw new Error("Battle not found");

  // Contract phase is the single source of truth — never trust stored.phase alone.
  const contractPhaseNum = await getBattlePhase(battleId);
  const contractPhase = phaseFromContractNum(contractPhaseNum);
  log(`phase=${contractPhase}`);

  // ── BETTING ───────────────────────────────────────────────────────────────
  if (contractPhase === "BETTING") {
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    if (nowSec < stored.battle.bettingDeadline) {
      const secsLeft = Number(stored.battle.bettingDeadline - nowSec);
      return {
        battleId, action: "WAITING", phase: "BETTING", logs,
        details: `Betting still open — ${secsLeft}s remaining`,
      };
    }
    const rubric = buildRubricCommitment(deterministicRubricJson(battleId, stored.battle.topic));
    const snapshot = await getArenaBattleSnapshot(battleId);
    if (snapshot.rubricCommitted) {
      log("commitRubric skipped — already committed on-chain");
    } else {
      await safeWrite("commitRubric", () => commitRubricOnChain({ battleId, rubricHash: rubric.hash }));
    }
    const hash = await safeWrite("closeBetting", () => closeBettingOnChain({ battleId }));
    stored.rubricPreimage = rubric.preimage;
    stored.phase = "PREPARING";
    battleStore.set(battleId, stored);
    log("betting closed → PREPARING");
    return { battleId, action: "CLOSE_BETTING", phase: "PREPARING", txHash: hash ?? undefined, logs };
  }

  // ── PREPARING ─────────────────────────────────────────────────────────────
  if (contractPhase === "PREPARING") {
    emit({ type: "phase", data: "RESEARCH" });
    log("research phase starting");

    const { agentAConfig, agentBConfig } = await setupBattle(stored.battle);

    // Restore previously saved research context (restart-safe)
    if (stored.researchContextA) agentAConfig.researchContext = stored.researchContextA;
    if (stored.researchContextB) agentBConfig.researchContext = stored.researchContextB;

    if (!stored.researchContextA && !stored.researchContextB) {
      const existingPurchases = researchStore.listBattlePurchases(battleId);
      if (existingPurchases.length > 0) {
        existingPurchases.forEach((p) => emit({ type: "research", data: p }));
        stored.battle.researchPurchases = existingPurchases;
      } else {
        await runResearchPhase(stored.battle, agentAConfig, agentBConfig, (purchase) => {
          researchStore.recordBattlePurchase(battleId, purchase);
          stored.battle.researchPurchases = [...(stored.battle.researchPurchases ?? []), purchase];
          emit({ type: "research", data: purchase });
        });
      }
      stored.researchContextA = agentAConfig.researchContext;
      stored.researchContextB = agentBConfig.researchContext;
    }

    log("research completed");

    // commitRubric may already be done (idempotent via safeWrite)
    const rubric = buildRubricCommitment(deterministicRubricJson(battleId, stored.battle.topic));
    const snapshot = await getArenaBattleSnapshot(battleId);
    if (snapshot.rubricCommitted) {
      log("commitRubric skipped — already committed on-chain");
    } else {
      await safeWrite("commitRubric", () => commitRubricOnChain({ battleId, rubricHash: rubric.hash }));
    }

    const hash = await safeWrite("startDebate", () => startDebateOnChain({ battleId }));
    log("debate started → ROUND_1");

    emit({ type: "phase", data: "DEBATE" });
    stored.phase = "ROUND_1";
    battleStore.set(battleId, stored);

    return {
      battleId, action: "START_DEBATE", phase: "ROUND_1",
      txHash: hash ?? undefined, logs,
    };
  }

  // ── ROUND PHASES ──────────────────────────────────────────────────────────
  if (contractPhase === "ROUND_1" || contractPhase === "ROUND_2" || contractPhase === "ROUND_3") {
    const roundIndex =
      contractPhase === "ROUND_1" ? 0 :
      contractPhase === "ROUND_2" ? 1 : 2;

    log(`roundIndex=${roundIndex}`);
    emit({ type: "round_start", data: { round: roundIndex + 1, totalRounds: stored.battle.totalRounds ?? 2 } });

    const { agentAConfig, agentBConfig } = await setupBattle(stored.battle);
    if (stored.researchContextA) agentAConfig.researchContext = stored.researchContextA;
    if (stored.researchContextB) agentBConfig.researchContext = stored.researchContextB;

    // Init or reset pending-round state when entering a new round
    if (!stored.pendingRound || stored.pendingRound.roundIndex !== roundIndex) {
      stored.pendingRound = { roundIndex };
    }
    const pending = stored.pendingRound;

    // ── Sub-step A: generate + submit Agent A ─────────────────────────────
    // Handles the rare restart/resume case where A was already on-chain.
    if (!pending.agentAText) {
      const aAlreadySubmitted = await isArgumentSubmittedOnChain({
        battleId, round: roundIndex + 1, side: 1,
      }).catch(() => false);

      if (aAlreadySubmitted) {
        pending.agentAText = `Agent A's round ${roundIndex + 1} argument was already submitted on-chain before this worker resumed.`;
        stored.pendingRound = pending;
        battleStore.set(battleId, stored);
        log("Agent A argument already submitted on-chain");
        // Fall through — will try to generate B below in the same return or
        // handle it in the next tick.
        return {
          battleId, action: "SUBMITTED_A", phase: contractPhase,
          roundIndex, logs,
          details: "Agent A argument already existed on-chain.",
        };
      }

      let agentAText = "";

      const turnKey = debateTurnKey(roundIndex, "A");
      const prefetchedA = turnKey ? stored.debateTurns?.[turnKey] : undefined;
      if (prefetchedA?.status === "ready" && prefetchedA.text) {
        log(`using prefetched ${turnKey}`);
        agentAText = prefetchedA.text;
      } else {
        if (prefetchedA?.status === "generating") {
          log(`${turnKey} still generating — waiting in foreground`);
        } else {
          log("generating Agent A argument");
        }
        emit({ type: "turn", data: { agent: "A", round: roundIndex + 1 } });

        await runDebateRound(stored.battle, agentAConfig, "A", roundsForGeneration(stored, roundIndex, "A") ?? stored.rounds, (token) => {
          agentAText += token;
          emit({ type: "token", data: { agent: "A", text: token } });
        });
      }

      const txA = await safeWrite(`submitArgument A round ${roundIndex + 1}`, () =>
        submitArgumentOnChain({ battleId, side: 1, contentHash: argContentHash(agentAText) })
      );

      pending.agentAText = agentAText;
      pending.agentATxHash = txA ?? undefined;
      stored.pendingRound = pending;
      if (turnKey) setDebateTurnState(stored, turnKey, { status: "completed", text: agentAText });

      // Round 1 is preloaded before playback starts, so send B too. Later
      // rounds intentionally return after A so B can react to A's new rebuttal.
      if (roundIndex > 0) {
        battleStore.set(battleId, stored);
        log("submitted Agent A argument");
        return {
          battleId, action: "SUBMITTED_A", phase: contractPhase,
          roundIndex, txHash: txA ?? undefined, logs,
          agentAText,
        };
      }

      let agentBText = "";
      log("generating Agent B argument");
      emit({ type: "turn", data: { agent: "B", round: roundIndex + 1 } });

      await runDebateRound(stored.battle, agentBConfig, "B", stored.rounds, (token) => {
        agentBText += token;
        emit({ type: "token", data: { agent: "B", text: token } });
      });

      const txB = await safeWrite(`submitArgument B round ${roundIndex + 1}`, () =>
        submitArgumentOnChain({ battleId, side: 2, contentHash: argContentHash(agentBText) })
      );

      pending.agentBText = agentBText;
      pending.agentBTxHash = txB ?? undefined;
      stored.pendingRound = pending;
      const bTurnKey = debateTurnKey(roundIndex, "B");
      if (bTurnKey) setDebateTurnState(stored, bTurnKey, { status: "completed", text: agentBText });
      battleStore.set(battleId, stored);
      log("submitted Agent A + Agent B arguments");

      return {
        battleId, action: "SUBMITTED_BOTH", phase: contractPhase,
        roundIndex, logs,
        agentAText,
        agentBText,
      };
    }

    // ── Sub-step B: generate + submit Agent B (restart/resume only) ───────
    if (!pending.agentBText) {
      const bAlreadySubmitted = await isArgumentSubmittedOnChain({
        battleId, round: roundIndex + 1, side: 2,
      }).catch(() => false);

      if (bAlreadySubmitted) {
        pending.agentBText = `Agent B's round ${roundIndex + 1} argument was already submitted on-chain before this worker resumed.`;
        stored.pendingRound = pending;
        battleStore.set(battleId, stored);
        log("Agent B argument already submitted on-chain");

        return {
          battleId, action: "SUBMITTED_B", phase: contractPhase,
          roundIndex, logs,
          details: "Agent B argument already existed on-chain.",
        };
      }

      let agentBText = "";
      const turnKey = debateTurnKey(roundIndex, "B");
      const prefetchedB = turnKey ? stored.debateTurns?.[turnKey] : undefined;
      if (prefetchedB?.status === "ready" && prefetchedB.text) {
        log(`using prefetched ${turnKey}`);
        agentBText = prefetchedB.text;
      } else {
        if (prefetchedB?.status === "generating") {
          log(`${turnKey} still generating — waiting in foreground`);
        } else {
          log("generating Agent B argument");
        }
        emit({ type: "turn", data: { agent: "B", round: roundIndex + 1 } });

        await runDebateRound(stored.battle, agentBConfig, "B", roundsForGeneration(stored, roundIndex, "B") ?? stored.rounds, (token) => {
          agentBText += token;
          emit({ type: "token", data: { agent: "B", text: token } });
        });
      }

      const txB = await safeWrite(`submitArgument B round ${roundIndex + 1}`, () =>
        submitArgumentOnChain({ battleId, side: 2, contentHash: argContentHash(agentBText) })
      );

      pending.agentBText = agentBText;
      pending.agentBTxHash = txB ?? undefined;
      stored.pendingRound = pending;
      if (turnKey) setDebateTurnState(stored, turnKey, { status: "completed", text: agentBText });
      battleStore.set(battleId, stored);
      log("submitted Agent B argument");

      return {
        battleId, action: "SUBMITTED_B", phase: contractPhase,
        roundIndex, txHash: txB ?? undefined, logs,
        agentBText,
      };
    }

    // ── Sub-step C: both arguments done — advance round ───────────────────
    log(`advancing round ${roundIndex + 1}`);
    const txAdvance = await safeWrite(`advanceRound ${roundIndex + 1}`, () =>
      advanceRoundOnChain({ battleId })
    );

    const completedRound: Round = {
      index: roundIndex,
      agentAText: pending.agentAText,
      agentBText: pending.agentBText,
      timestamp: Date.now(),
    };
    stored.rounds.push(completedRound);
    stored.pendingRound = undefined;

    emit({ type: "round", data: { ...completedRound, txA: pending.agentATxHash, txB: pending.agentBTxHash } });

    // Read authoritative next phase from chain.
    // If we actually submitted the advance tx, poll until the phase changes —
    // Base Sepolia RPC nodes can lag 1-2 blocks after confirmation, causing a
    // stale read that returns the pre-advance phase and wastes a full tick.
    let nextPhaseNum: number;
    if (txAdvance !== undefined) {
      nextPhaseNum = contractPhaseNum;
      for (let attempt = 0; attempt < 6 && nextPhaseNum === contractPhaseNum; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 800));
        nextPhaseNum = await getBattlePhase(battleId);
      }
    } else {
      nextPhaseNum = await getBattlePhase(battleId);
    }
    const nextPhase = phaseFromContractNum(nextPhaseNum);
    stored.phase = nextPhase;
    battleStore.set(battleId, stored);
    log(`round ${roundIndex + 1} advanced → ${nextPhase}`);

    return {
      battleId, action: "ADVANCED_ROUND", phase: nextPhase,
      roundIndex, txHash: txAdvance ?? undefined, logs,
      agentAText: pending.agentAText,
      agentBText: pending.agentBText,
    };
  }

  // ── JUDGING_READY ─────────────────────────────────────────────────────────
  if (contractPhase === "JUDGING_READY") {
    log("running verdict");
    const settlement = await settleBattleWithVenice(battleId);
    log(`winner=${settlement.winnerSide} (${settlement.winner})`);
    emit({ type: "phase", data: "DONE" });

    const { scores, confidence } = settlement.judgeResult;
    const winnerComposite = Math.round((scores.accuracy * 40 + scores.wit * 30 + scores.rebuttal * 30) / 100);
    const loserComposite  = Math.round(winnerComposite * (1 - confidence * 0.45));
    const judgeScores = settlement.winnerSide === "A"
      ? { A: winnerComposite, B: loserComposite }
      : { A: loserComposite, B: winnerComposite };
    return {
      battleId, action: "SETTLED", phase: "SETTLED",
      txHash: settlement.settleTxHash,
      details: `Winner: side ${settlement.winnerSide} — ${settlement.winner}`,
      winnerSide: settlement.winnerSide,
      judgeScores,
      logs,
    };
  }

  // ── TERMINAL / UNKNOWN ────────────────────────────────────────────────────
  log(`terminal state — no action taken`);
  if (contractPhase === "SETTLED") {
    stored.phase = "SETTLED";
    stored.battle.state = "SETTLED";
    battleStore.set(battleId, stored);
  }
  return { battleId, action: "NO_OP", phase: contractPhase, logs };
}
