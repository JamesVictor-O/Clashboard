import { NextResponse } from "next/server";
import { getVeniceClient, getVeniceModel } from "@/lib/venice";

export interface HotTake {
  label: string;
  category: "Sports" | "Music" | "Tech" | "Culture" | "Crypto" | "Art";
}

const STATIC_FALLBACK: HotTake[] = [
  { label: "LeBron James vs Kobe Bryant — who defined NBA greatness?", category: "Sports" },
  { label: "Wizkid vs Burna Boy — who owns Afrobeats right now?", category: "Music" },
  { label: "iPhone vs Android — which ecosystem wins long-term?", category: "Tech" },
  { label: "Messi vs Ronaldo — whose football legacy is greater?", category: "Sports" },
  { label: "Marvel vs DC — which universe dominates cinema?", category: "Culture" },
  { label: "Bitcoin vs Ethereum — which blockchain matters more?", category: "Crypto" },
];

function parseHotTakes(raw: string): HotTake[] | null {
  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter(
      (item): item is HotTake =>
        typeof item?.label === "string" &&
        typeof item?.category === "string" &&
        item.label.length > 0
    );
    return valid.length >= 3 ? valid.slice(0, 6) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const client = getVeniceClient();
    const model = getVeniceModel("decision");

    const response = await client.chat.completions.create({
      model,
      stream: false,
      max_tokens: 512,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content:
            "You generate trending debate topics for a live AI battle arena. " +
            "Output ONLY valid JSON — no prose, no markdown fences. " +
            "Each topic must be a real, currently relevant cultural flashpoint " +
            "that people would genuinely argue about right now.",
        },
        {
          role: "user",
          content:
            'Generate exactly 6 hot debate topics for a live AI battle arena. ' +
            'Each topic MUST follow the exact format: "Entity A vs Entity B — debate question (max 8 words)". ' +
            'Entity A and Entity B are the two opposing sides. Agent A will defend Entity A, Agent B will defend Entity B. ' +
            'The question after the dash should make the stakes crystal clear (e.g. "who defined NBA greatness?" or "which blockchain matters more?"). ' +
            'RULES: ' +
            '1. Both entities must be clearly named — no vague topics like "crypto vs stocks". ' +
            '2. Label must be under 65 characters total. ' +
            '3. Cover at least 4 different categories. ' +
            '4. Make them feel like 2025 flashpoints people genuinely argue about. ' +
            '5. Good examples: "Drake vs Kendrick Lamar — who won the rap war?", "LeBron James vs Luka Doncic — who is the real GOAT?", "Tesla vs BYD — which EV brand wins the future?". ' +
            'Format as a JSON array: [{"label":"...","category":"Sports|Music|Tech|Culture|Crypto|Art"}]. ' +
            'Output only the JSON array, nothing else.',
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const takes = parseHotTakes(raw);

    if (!takes) {
      return NextResponse.json({ takes: STATIC_FALLBACK, source: "fallback" });
    }

    return NextResponse.json({ takes, source: "venice" });
  } catch {
    return NextResponse.json({ takes: STATIC_FALLBACK, source: "fallback" });
  }
}
