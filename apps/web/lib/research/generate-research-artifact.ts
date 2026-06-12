import { complete, getVeniceModel } from "@/lib/venice";
import type { ResearchCategory } from "@/lib/types";

export interface GeneratedResearch {
  summary: string;
  facts: string[];
  sources: string[];
}

const CATEGORY_CONTEXT: Record<ResearchCategory, string> = {
  sports:
    "Focus on player performance, career milestones, era comparisons, and head-to-head records.",
  music:
    "Focus on chart impact, cultural influence, genre evolution, critical reception, and legacy.",
  tech:
    "Focus on market adoption, technical trade-offs, competitive landscape, and real-world impact.",
  culture:
    "Focus on cultural longevity, generational impact, public memory, and influence on adjacent fields.",
  crypto:
    "Focus on tokenomics, adoption curves, network effects, risk factors, and regulatory context.",
};

function fallback(topic: string): GeneratedResearch {
  return {
    summary: `Research synthesis for "${topic}".`,
    facts: [
      `"${topic}" is a contested topic with strong arguments on multiple sides.`,
      "Effective debate arguments distinguish verifiable context from popular narrative.",
      "Historical trajectory and current momentum often point in opposite directions — worth separating.",
      "The strongest positions acknowledge the weakest points of their own side first.",
    ],
    sources: ["Fallback — Venice synthesis unavailable"],
  };
}

/**
 * Calls Venice to generate topic-specific research facts a debate agent can
 * use as ammunition. Returns summary, facts[], and sources[].
 *
 * Sources are always labelled "Venice-generated synthesis" — no fake citations.
 * Falls back gracefully if Venice is unreachable or returns malformed output.
 */
export async function generateResearchArtifact(params: {
  topic: string;
  category: ResearchCategory;
}): Promise<GeneratedResearch> {
  const { topic, category } = params;
  const categoryHint = CATEGORY_CONTEXT[category] ?? "";

  const messages = [
    {
      role: "system" as const,
      content: [
        "You are a research assistant for a competitive AI debate arena.",
        "Your job: generate debate-ready research facts for the given topic.",
        "Return ONLY a valid JSON object — no markdown fences, no explanation, no prefix text.",
        'Schema: { "summary": string, "facts": string[], "sources": string[] }',
        "",
        "Rules:",
        '- "summary": one sentence capturing the sharpest debate angle for this specific topic',
        '- "facts": exactly 4 strings, each a specific and arguable point directly about this topic',
        "- Every fact must name the topic or its specific participants/entities — no generic templates",
        "- Do NOT invent specific statistics, exact win percentages, or citations you cannot verify",
        "- Prefer comparative claims, historical context, and underappreciated angles over obvious takes",
        '- "sources": always exactly ["Venice-generated synthesis"]',
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: `Topic: "${topic}"\nCategory: ${category}\nContext: ${categoryHint}`,
    },
  ];

  try {
    const raw = await complete(messages, {
      model: getVeniceModel("research"),
      temperature: 0.6,
      maxTokens: 600,
    });

    // Strip markdown code fences some models add despite instructions
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned) as Partial<GeneratedResearch>;

    if (
      typeof parsed.summary !== "string" ||
      !Array.isArray(parsed.facts) ||
      parsed.facts.length === 0
    ) {
      return fallback(topic);
    }

    return {
      summary: parsed.summary,
      facts: parsed.facts.map(String).slice(0, 6),
      // Always enforce honest label — ignore whatever the model put in sources
      sources: ["Venice-generated synthesis"],
    };
  } catch {
    return fallback(topic);
  }
}
