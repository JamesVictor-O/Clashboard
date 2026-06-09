import { runDebateRound, runResearchPhase, setupBattle } from "@/lib/agents/orchestrator";
import { battleStore, type StoredBattle } from "@/lib/battle-store";
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

/** Prefetch guard — at most one lookahead generation per battle at a time. */
const prefetchInFlight = new Set<string>();

/**
 * Pre-generate the next debate round's arguments while the current round's
 * voices are still playing on the client.
 *
 * Called fire-and-forget from the arena page immediately after a SUBMITTED_BOTH
 * step lands. Results are cached in stored.prefetchedNextRound. When the actual
 * next-round SUBMITTED_BOTH tick runs, it finds the cache and skips Venice AI
 * generation entirely — going straight to on-chain submission.
 *
 * Both agents are generated in parallel. A and B can do this safely because
 * the current step runner already generates them with the same rounds history
 * (neither sees the other's current-round text — only previous rounds).
 */
export async function prefetchNextRound(battleId: `0x${string}`): Promise<void> {
  if (prefetchInFlight.has(battleId)) return;
  prefetchInFlight.add(battleId);
  try {
    const stored = battleStore.get(battleId);
    if (!stored) return;

    const pending = stored.pendingRound;
    if (!pending?.agentAText || !pending?.agentBText) return;

    const nextRoundIndex = pending.roundIndex + 1;
    const totalRounds = stored.battle.totalRounds ?? 2;
    if (nextRoundIndex >= totalRounds) return; // no more debate rounds

    // Already cached
    if (stored.prefetchedNextRound?.forRoundIndex === nextRoundIndex) return;

    const { agentAConfig, agentBConfig } = await setupBattle(stored.battle);
    if (stored.researchContextA) agentAConfig.researchContext = stored.researchContextA;
    if (stored.researchContextB) agentBConfig.researchContext = stored.researchContextB;

    // Simulate the rounds history the worker will have after ADVANCED_ROUND runs.
    // We include the current round's texts so agents can form proper rebuttals.
    const simulatedRounds: import("@/lib/types").Round[] = [
      ...stored.rounds,
      {
        index: pending.roundIndex,
        agentAText: pending.agentAText,
        agentBText: pending.agentBText,
        timestamp: Date.now(),
      },
    ];

    console.log(`[Prefetch] generating round ${nextRoundIndex + 1} for battle ${battleId}`);

    const [agentAText, agentBText] = await Promise.all([
      (async () => {
        let text = "";
        await runDebateRound(stored.battle, agentAConfig, "A", simulatedRounds, (token) => { text += token; });
        return text;
      })(),
      (async () => {
        let text = "";
        await runDebateRound(stored.battle, agentBConfig, "B", simulatedRounds, (token) => { text += token; });
        return text;
      })(),
    ]);

    stored.prefetchedNextRound = { forRoundIndex: nextRoundIndex, agentAText, agentBText };
    battleStore.set(battleId, stored);
    console.log(`[Prefetch] round ${nextRoundIndex + 1} ready for battle ${battleId}`);
  } catch (err) {
    console.warn(`[Prefetch] background generation failed for battle ${battleId}:`, err);
    // Non-fatal — the main step runner will generate normally on the next tick.
  } finally {
    prefetchInFlight.delete(battleId);
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

      // ── Normal path: generate A and B together so the client gets both
      //    texts in one response, eliminating the inter-agent dead-time gap.
      //
      //    Fast path: if the client fired a prefetch while the previous round's
      //    voices were playing, the arguments are already cached — skip Venice AI
      //    and go straight to on-chain submission.
      let agentAText = "";
      let agentBText = "";

      const prefetch = stored.prefetchedNextRound;
      if (prefetch?.forRoundIndex === roundIndex && prefetch.agentAText && prefetch.agentBText) {
        log("using prefetched arguments — skipping generation");
        agentAText = prefetch.agentAText;
        agentBText = prefetch.agentBText;
        stored.prefetchedNextRound = undefined;
      } else {
        log("generating Agent A argument");
        emit({ type: "turn", data: { agent: "A", round: roundIndex + 1 } });

        await runDebateRound(stored.battle, agentAConfig, "A", stored.rounds, (token) => {
          agentAText += token;
          emit({ type: "token", data: { agent: "A", text: token } });
        });

        log("generating Agent B argument");
        emit({ type: "turn", data: { agent: "B", round: roundIndex + 1 } });

        await runDebateRound(stored.battle, agentBConfig, "B", stored.rounds, (token) => {
          agentBText += token;
          emit({ type: "token", data: { agent: "B", text: token } });
        });
      }

      // Submit both on-chain sequentially (same relayer key, avoid nonce race).
      const txA = await safeWrite(`submitArgument A round ${roundIndex + 1}`, () =>
        submitArgumentOnChain({ battleId, side: 1, contentHash: argContentHash(agentAText) })
      );
      const txB = await safeWrite(`submitArgument B round ${roundIndex + 1}`, () =>
        submitArgumentOnChain({ battleId, side: 2, contentHash: argContentHash(agentBText) })
      );

      pending.agentAText = agentAText;
      pending.agentATxHash = txA ?? undefined;
      pending.agentBText = agentBText;
      pending.agentBTxHash = txB ?? undefined;
      stored.pendingRound = pending;
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

      log("generating Agent B argument");
      emit({ type: "turn", data: { agent: "B", round: roundIndex + 1 } });

      let agentBText = "";
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
  return { battleId, action: "NO_OP", phase: contractPhase, logs };
}
