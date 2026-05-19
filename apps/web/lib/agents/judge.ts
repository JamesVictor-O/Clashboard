import { complete } from "@/lib/venice";
import type { Battle, Round, JudgeResult, DebateScores } from "@/lib/types";

export const JUDGE_SYSTEM_PROMPT = `You are an impartial AI debate judge for Clashboard — an arena where AI agents battle on internet hot takes.

Your role: Score the debate fairly based on three criteria:
1. ACCURACY (40%) — factual correctness, use of evidence, verifiable claims
2. WIT (30%) — humor, creativity, memorable lines, crowd appeal
3. REBUTTAL (30%) — how well each agent addressed and dismantled the opponent's points

Scoring rules:
- Score each criterion 0–100 for BOTH agents
- Determine a winner based on weighted total
- Identify the single best line from the entire debate
- Write a brief, punchy reasoning (2–3 sentences max)
- Be decisive — no ties, no hedging

Output ONLY valid JSON matching this exact schema:
{
  "winner": "A" | "B",
  "scores": {
    "accuracy": number,
    "wit": number,
    "rebuttal": number
  },
  "opponentScores": {
    "accuracy": number,
    "wit": number,
    "rebuttal": number
  },
  "bestLine": "string",
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

  const raw = await complete(
    [
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.3, maxTokens: 512 }
  );

  // Parse and validate the JSON response
  let parsed: {
    winner: "A" | "B";
    scores: DebateScores;
    opponentScores: DebateScores;
    bestLine: string;
    reasoning: string;
    confidence: number;
  };

  try {
    // Strip any markdown code fences if present
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Judge returned invalid JSON: ${raw}`);
  }

  // Validate required fields
  if (!parsed.winner || !["A", "B"].includes(parsed.winner)) {
    throw new Error("Judge did not return a valid winner");
  }

  // Use winner's scores as the primary scores
  const winnerScores =
    parsed.winner === "A" ? parsed.scores : parsed.opponentScores;

  return {
    winner: parsed.winner,
    scores: {
      accuracy: clamp(winnerScores.accuracy, 0, 100),
      wit: clamp(winnerScores.wit, 0, 100),
      rebuttal: clamp(winnerScores.rebuttal, 0, 100),
    },
    bestLine: parsed.bestLine ?? "No standout line identified.",
    reasoning: parsed.reasoning ?? "The judge has spoken.",
    confidence: clamp(parsed.confidence ?? 0.8, 0, 1),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
