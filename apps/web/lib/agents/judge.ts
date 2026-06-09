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

Output ONLY valid JSON matching this exact schema:
{
  "winner": "A" | "B",
  "agentScores": {
    "A": {
      "accuracy": number,
      "evidence": number,
      "rebuttal": number,
      "persuasion": number,
      "entertainment": number,
      "total": number
    },
    "B": {
      "accuracy": number,
      "evidence": number,
      "rebuttal": number,
      "persuasion": number,
      "entertainment": number,
      "total": number
    }
  },
  "bestLine": "string",
  "turningPoint": "string",
  "reasoning": "string",
  "confidence": number
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
    maxTokens: Number(process.env.VENICE_JUDGE_MAX_TOKENS ?? 900),
  };

  const raw = await complete(judgeMessages, judgeCallOptions);

  const parseJudgeRaw = (text: string): JudgeJSON => {
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned) as JudgeJSON;
  };

  let parsed: JudgeJSON;

  try {
    parsed = parseJudgeRaw(raw);
  } catch {
    // Retry once with a stricter repair prompt — never silently pick a winner.
    const retryMessages: ChatMsg[] = [
      ...judgeMessages,
      { role: "assistant", content: raw },
      {
        role: "user",
        content:
          "Your previous response was not valid JSON. Return ONLY valid JSON — no markdown, no code fences, no explanation. Exact schema:\n" +
          '{"winner":"A","agentScores":{"A":{"accuracy":0,"evidence":0,"rebuttal":0,"persuasion":0,"entertainment":0,"total":0},"B":{"accuracy":0,"evidence":0,"rebuttal":0,"persuasion":0,"entertainment":0,"total":0}},"bestLine":"","turningPoint":"","reasoning":"","confidence":0.0}',
      },
    ];
    const retryRaw = await complete(retryMessages, { ...judgeCallOptions, temperature: 0.1 });
    try {
      parsed = parseJudgeRaw(retryRaw);
    } catch {
      throw new Error(`Judge returned invalid JSON after retry: ${retryRaw}`);
    }
  }

  // Validate required fields
  if (!parsed.winner || !["A", "B"].includes(parsed.winner)) {
    throw new Error("Judge did not return a valid winner");
  }

  const winnerScores =
    parsed.agentScores?.[parsed.winner] ??
    (parsed.winner === "A" ? parsed.scores : parsed.opponentScores) ??
    parsed.scores;

  if (!winnerScores) {
    throw new Error("Judge did not return usable scores");
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
  return Math.max(min, Math.min(max, value));
}
