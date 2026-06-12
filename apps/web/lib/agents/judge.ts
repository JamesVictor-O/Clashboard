import { complete, getVeniceModel } from "@/lib/venice";
import type { Battle, Round, JudgeResult, DebateScores } from "@/lib/types";

export const JUDGE_SYSTEM_PROMPT = `You are an impartial AI debate judge for Clashboard — an arena where AI agents battle on internet hot takes.

Your role: Score the debate fairly based on five criteria:
1. ACCURACY (30%) — factual correctness, use of evidence, verifiable claims
2. EVIDENCE USE (20%) — how well each agent used research, examples, and context
3. REBUTTAL (25%) — how well each agent addressed and dismantled the opponent's points
4. PERSUASION (15%) — clarity, framing, and force of the overall case
5. ENTERTAINMENT (10%) — wit, memorable lines, crowd appeal

Scoring rules:
- Score each criterion 0–100 for BOTH agents
- Determine a winner based on weighted total
- Identify the single best line from the entire debate
- Write a concise but educational reasoning explaining why the winner won
- Be decisive — no ties, no hedging

Output ONLY valid JSON. Do not include markdown, code fences, comments, or text before or after the JSON.
Use this exact shape, with real numeric scores:
{
  "winner": "A",
  "agentScores": {
    "A": {
      "accuracy": 86,
      "evidence": 82,
      "rebuttal": 88,
      "persuasion": 84,
      "entertainment": 79,
      "total": 84
    },
    "B": {
      "accuracy": 78,
      "evidence": 75,
      "rebuttal": 73,
      "persuasion": 76,
      "entertainment": 81,
      "total": 76
    }
  },
  "bestLine": "The strongest quoted or paraphrased line from the debate.",
  "turningPoint": "The decisive moment in one sentence.",
  "reasoning": "Two concise sentences explaining why the winner won.",
  "confidence": 0.86
}`;

/**
 * Run the AI judge over a completed battle and return a typed verdict.
 */
export async function runJudge(
  battle: Battle,
  rounds: Round[]
): Promise<JudgeResult> {
  if (rounds.length === 0) {
    throw new Error("Cannot judge a battle with no rounds");
  }

  if (process.env.ENABLE_VENICE_FALLBACK === "true") {
    const agentAUsedResearch = rounds.some((round) =>
      round.agentAText.toLowerCase().includes("research")
    );
    const agentBUsedResearch = rounds.some((round) =>
      round.agentBText.toLowerCase().includes("research") ||
      round.agentBText.toLowerCase().includes("era-adjusted")
    );
    const winner: "A" | "B" = agentBUsedResearch && !agentAUsedResearch ? "B" : "A";
    const winnerName = winner === "A" ? battle.agentA.name : battle.agentB.name;

    return {
      winner,
      scores: {
        accuracy: winner === "A" ? 84 : 86,
        wit: winner === "A" ? 78 : 80,
        rebuttal: winner === "A" ? 82 : 88,
      },
      bestLine:
        "The better argument weighs peak dominance, consistency, and the opponent's strongest counterclaim.",
      reasoning:
        `${winnerName} wins the local fallback verdict by using the research context more directly and answering the opponent's strongest premise. This verdict is deterministic and should only be enabled for offline development.`,
      confidence: 0.82,
    };
  }

  // Build the debate transcript
  const transcript = rounds
    .map(
      (r, i) =>
        `--- Round ${i + 1} ---\n` +
        `Agent A (${battle.agentA.name}): ${r.agentAText}\n\n` +
        `Agent B (${battle.agentB.name}): ${r.agentBText}`
    )
    .join("\n\n");

  const userPrompt = `Topic: "${battle.topic}"

Debate Transcript:
${transcript}

Judge this debate. Output only the JSON verdict.`;

  type JudgeJSON = {
    winner: "A" | "B";
    agentScores?: {
      A?: DebateScores & { evidence?: number; persuasion?: number; entertainment?: number; total?: number };
      B?: DebateScores & { evidence?: number; persuasion?: number; entertainment?: number; total?: number };
    };
    scores?: DebateScores;
    opponentScores?: DebateScores;
    bestLine: string;
    turningPoint?: string;
    reasoning: string;
    confidence: number;
  };

  type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

  const judgeMessages: ChatMsg[] = [
    { role: "system", content: JUDGE_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
  const judgeCallOptions = {
    model: getVeniceModel("judge"),
    temperature: 0.28,
    maxTokens: Number(process.env.VENICE_JUDGE_MAX_TOKENS ?? 1400),
  };

  const judgeTimeoutMs = Number(process.env.VENICE_JUDGE_TIMEOUT_MS ?? 25_000);
  const raw = await withTimeout(
    complete(judgeMessages, judgeCallOptions),
    judgeTimeoutMs,
    "Venice judge"
  ).catch((err) => {
    console.warn("[Judge] initial call failed:", err);
    return "";
  });

  const parseJudgeRaw = (text: string): JudgeJSON | null => {
    const cleaned = extractJsonObject(text);
    if (!cleaned) return null;
    try {
      return JSON.parse(cleaned) as JudgeJSON;
    } catch (err) {
      console.warn(
        "[Judge] JSON parse failed:",
        err instanceof Error ? err.message : String(err),
        "raw preview:",
        text.slice(0, 240)
      );
      return null;
    }
  };

  let parsed = parseJudgeRaw(raw);

  if (!parsed) {
    // Retry once with a stricter repair prompt — never silently pick a winner.
    const retryMessages: ChatMsg[] = [
      ...judgeMessages,
      { role: "assistant", content: raw },
      {
        role: "user",
        content:
          "Your previous response was not valid JSON. Return ONLY one complete JSON object — no markdown, no code fences, no explanation, no trailing text. Use this exact shape with real scores:\n" +
          '{"winner":"A","agentScores":{"A":{"accuracy":86,"evidence":82,"rebuttal":88,"persuasion":84,"entertainment":79,"total":84},"B":{"accuracy":78,"evidence":75,"rebuttal":73,"persuasion":76,"entertainment":81,"total":76}},"bestLine":"short line","turningPoint":"one sentence","reasoning":"two concise sentences","confidence":0.86}',
      },
    ];
    const retryRaw = await withTimeout(
      complete(retryMessages, { ...judgeCallOptions, temperature: 0.05 }),
      judgeTimeoutMs,
      "Venice judge retry"
    ).catch((err) => {
      console.warn("[Judge] retry failed:", err);
      return "";
    });
    parsed = parseJudgeRaw(retryRaw);
  }

  if (!parsed) {
    console.warn("[Judge] Venice returned invalid JSON after retry. Using deterministic fallback verdict.");
    return deterministicJudgeFallback(battle, rounds);
  }

  // Validate required fields
  if (!parsed.winner || !["A", "B"].includes(parsed.winner)) {
    console.warn("[Judge] Venice did not return a valid winner. Using deterministic fallback verdict.");
    return deterministicJudgeFallback(battle, rounds);
  }

  const winnerScores =
    parsed.agentScores?.[parsed.winner] ??
    (parsed.winner === "A" ? parsed.scores : parsed.opponentScores) ??
    parsed.scores;

  if (!winnerScores) {
    console.warn("[Judge] Venice did not return usable scores. Using deterministic fallback verdict.");
    return deterministicJudgeFallback(battle, rounds);
  }

  const witLikeScore =
    "entertainment" in winnerScores && typeof winnerScores.entertainment === "number"
      ? winnerScores.entertainment
      : winnerScores.wit;

  const reasoning = [parsed.reasoning, parsed.turningPoint ? `Turning point: ${parsed.turningPoint}` : ""]
    .filter(Boolean)
    .join(" ");

  return {
    winner: parsed.winner,
    scores: {
      accuracy: clamp(winnerScores.accuracy, 0, 100),
      wit: clamp(witLikeScore, 0, 100),
      rebuttal: clamp(winnerScores.rebuttal, 0, 100),
    },
    bestLine: parsed.bestLine ?? "No standout line identified.",
    reasoning: reasoning || "The judge has spoken.",
    confidence: clamp(parsed.confidence ?? 0.8, 0, 1),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function extractJsonObject(raw: string): string | null {
  const text = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  if (!text) return null;

  const directStart = text.indexOf("{");
  const directEnd = text.lastIndexOf("}");
  if (directStart === -1 || directEnd === -1 || directEnd <= directStart) return null;

  return text.slice(directStart, directEnd + 1);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function deterministicJudgeFallback(battle: Battle, rounds: Round[]): JudgeResult {
  const scoreSide = (side: "A" | "B") => {
    const texts = rounds.map((round) => side === "A" ? round.agentAText : round.agentBText);
    const opponentTexts = rounds.map((round) => side === "A" ? round.agentBText : round.agentAText);
    const joined = texts.join(" ");
    const lower = joined.toLowerCase();
    const words = joined.trim().split(/\s+/).filter(Boolean).length;
    const evidenceTerms = [
      "because", "data", "evidence", "research", "history", "record", "metric",
      "numbers", "example", "context", "fact", "proved", "shows",
    ];
    const rebuttalTerms = ["but", "however", "answer", "claim", "opponent", "wrong", "missed", "not"];
    const evidenceHits = evidenceTerms.reduce((count, term) => count + countTerm(lower, term), 0);
    const rebuttalHits = rebuttalTerms.reduce((count, term) => count + countTerm(lower, term), 0);
    const directReference = opponentTexts.some((text) => {
      const opponentWords = new Set(
        text.toLowerCase().split(/\W+/).filter((word) => word.length > 5)
      );
      return lower.split(/\W+/).some((word) => opponentWords.has(word));
    });

    return {
      accuracy: clamp(62 + evidenceHits * 3 + Math.min(10, words / 35), 55, 92),
      wit: clamp(58 + (joined.match(/[!?]/g)?.length ?? 0) * 3 + Math.min(12, words / 45), 52, 90),
      rebuttal: clamp(60 + rebuttalHits * 3 + (directReference ? 8 : 0), 54, 94),
    };
  };

  const aScores = scoreSide("A");
  const bScores = scoreSide("B");
  const total = (scores: DebateScores) => scores.accuracy * 0.4 + scores.wit * 0.3 + scores.rebuttal * 0.3;
  const aTotal = total(aScores);
  const bTotal = total(bScores);
  const winner: "A" | "B" = aTotal >= bTotal ? "A" : "B";
  const winnerScores = winner === "A" ? aScores : bScores;
  const winnerName = winner === "A" ? battle.agentA.name : battle.agentB.name;
  const bestLine = bestLineForSide(rounds, winner);

  return {
    winner,
    scores: winnerScores,
    bestLine,
    reasoning:
      `${winnerName} wins the fallback verdict because their transcript scored higher on evidence density, direct rebuttal language, and crowd-ready delivery. Venice judging returned malformed JSON, so Clashboard used this deterministic backup to keep settlement moving.`,
    confidence: clamp(0.66 + Math.min(0.18, Math.abs(aTotal - bTotal) / 100), 0.6, 0.84),
  };
}

function countTerm(text: string, term: string): number {
  return text.split(term).length - 1;
}

function bestLineForSide(rounds: Round[], side: "A" | "B"): string {
  const text = rounds.map((round) => side === "A" ? round.agentAText : round.agentBText).join(" ");
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 24);
  const best =
    sentences.find((sentence) => /because|but|however|data|evidence|research|record|history/i.test(sentence)) ??
    sentences[0] ??
    "The stronger case answered the opponent and gave the crowd a clearer reason to believe.";
  return best.length > 180 ? `${best.slice(0, 177)}...` : best;
}
