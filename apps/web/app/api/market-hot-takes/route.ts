import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PolymarketTag = {
  label?: string;
  slug?: string;
};

type PolymarketMarket = {
  question?: string;
  slug?: string;
  active?: boolean;
  closed?: boolean;
  acceptingOrders?: boolean;
  outcomes?: string;
  outcomePrices?: string;
  volume?: string | number;
  volume24hr?: string | number;
  liquidity?: string | number;
  liquidityNum?: string | number;
};

type PolymarketEvent = {
  title?: string;
  slug?: string;
  active?: boolean;
  closed?: boolean;
  volume24hr?: string | number;
  liquidity?: string | number;
  tags?: PolymarketTag[];
  markets?: PolymarketMarket[];
};

type MarketHotTake = {
  label: string;
  category: "Sports" | "Politics" | "Music" | "Tech" | "Culture" | "Crypto" | "Art";
  source: "polymarket";
  subtitle: string;
  url: string;
  probability?: number;
  volume24hr?: number;
  score?: number;
};

const POLYMARKET_EVENT_URLS = [
  "https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume_24hr&ascending=false&limit=60",
  "https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume&ascending=false&limit=60",
];

const FALLBACK_MARKETS: MarketHotTake[] = [
  {
    label: "Yes vs No — Will Mexico beat South Africa at the World Cup?",
    category: "Sports",
    source: "polymarket",
    subtitle: "Fallback market hot take · sports debate",
    url: "https://polymarket.com",
  },
  {
    label: "Yes vs No — Will Trump Republicans win the next major election fight?",
    category: "Politics",
    source: "polymarket",
    subtitle: "Fallback market hot take · politics debate",
    url: "https://polymarket.com",
  },
  {
    label: "Yes vs No — Will Bitcoin outperform Ethereum this cycle?",
    category: "Crypto",
    source: "polymarket",
    subtitle: "Fallback market hot take · crypto debate",
    url: "https://polymarket.com",
  },
  {
    label: "Yes vs No — Will a major AI company face a serious regulatory crackdown?",
    category: "Tech",
    source: "polymarket",
    subtitle: "Fallback market hot take · tech controversy",
    url: "https://polymarket.com",
  },
  {
    label: "Yes vs No — Will a celebrity-backed crypto token collapse this cycle?",
    category: "Crypto",
    source: "polymarket",
    subtitle: "Fallback market hot take · culture x crypto debate",
    url: "https://polymarket.com",
  },
  {
    label: "Yes vs No — Will a major music artist lose a public feud this year?",
    category: "Music",
    source: "polymarket",
    subtitle: "Fallback market hot take · music controversy",
    url: "https://polymarket.com",
  },
];

function parseJsonArray(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function compactUsd(value?: number): string | null {
  if (!value || value <= 0) return null;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function cleanQuestion(question: string): string {
  return question
    .replace(/\s+/g, " ")
    .replace(/^will\s+/i, "Will ")
    .trim()
    .replace(/[.]+$/, "")
    .slice(0, 170);
}

function categoryFromTags(tags: PolymarketTag[] | undefined, question: string): MarketHotTake["category"] {
  const haystack = `${question} ${(tags ?? []).map((tag) => `${tag.label ?? ""} ${tag.slug ?? ""}`).join(" ")}`.toLowerCase();
  if (/sport|nba|nfl|soccer|football|tennis|ufc|f1|formula|baseball|mlb|nhl/.test(haystack)) return "Sports";
  if (/politic|election|president|senate|congress|trump|biden|macron|starmer|zelensky|putin|war|ceasefire|government|minister/.test(haystack)) return "Politics";
  if (/music|album|song|rapper|grammy|artist|spotify/.test(haystack)) return "Music";
  if (/crypto|bitcoin|ethereum|solana|token|defi|stablecoin|airdrop|exchange/.test(haystack)) return "Crypto";
  if (/tech|\bai\b|openai|apple|google|tesla|nvidia|startup|ipo|robot|model/.test(haystack)) return "Tech";
  if (/art|movie|film|oscar|box office|nft|game|gaming/.test(haystack)) return "Art";
  return "Culture";
}

function tagText(tags: PolymarketTag[] | undefined): string {
  return (tags ?? []).map((tag) => `${tag.label ?? ""} ${tag.slug ?? ""}`).join(" ").toLowerCase();
}

function isLowEnergyQuestion(question: string, probability?: number): boolean {
  const q = question.toLowerCase();
  if (probability !== undefined && (probability <= 5 || probability >= 95)) return true;
  if (/^(will\s+)?[^?]{0,28}\s+ipo\b/i.test(question)) return true;
  if (/called by|ceases to be|recognizes .* sovereignty|troops fighting/i.test(question)) return true;
  if (/ by (january|february|march|april|may|june|july|august|september|october|november|december) \d{1,2}, 20\d{2}\?/i.test(question) && q.length < 54) {
    return true;
  }
  return false;
}

function debateEnergyScore(params: {
  question: string;
  category: MarketHotTake["category"];
  tags: string;
  probability?: number;
  volume24hr?: number;
  volume?: number;
  liquidity?: number;
}) {
  const haystack = `${params.question} ${params.tags}`.toLowerCase();
  let score = 0;

  score += Math.log10(Math.max(1, params.volume24hr ?? 0) + 1) * 22;
  score += Math.log10(Math.max(1, params.volume ?? 0) + 1) * 8;
  score += Math.log10(Math.max(1, params.liquidity ?? 0) + 1) * 6;

  if (params.probability !== undefined) {
    const uncertainty = 50 - Math.abs(50 - params.probability);
    score += uncertainty * 1.3;
    if (params.probability >= 15 && params.probability <= 85) score += 20;
  }

  const categoryBonus: Record<MarketHotTake["category"], number> = {
    Sports: 58,
    Politics: 54,
    Crypto: 42,
    Culture: 38,
    Tech: 34,
    Music: 30,
    Art: 24,
  };
  score += categoryBonus[params.category];

  if (/world cup|champions league|nba|nfl|ufc|fifa|premier league|super bowl|olympics|mexico|south africa|argentina|brazil|france|england/.test(haystack)) score += 45;
  if (/election|president|impeach|resign|scandal|indict|debate|war|ceasefire|tariff|sanction/.test(haystack)) score += 38;
  if (/bitcoin|ethereum|solana|etf|stablecoin|airdrop|binance|coinbase|crypto/.test(haystack)) score += 28;
  if (/openai|anthropic|google|apple|tesla|nvidia|ai|lawsuit|ban|regulation/.test(haystack)) score += 24;
  if (/oscar|grammy|box office|album|rapper|streaming|netflix|disney/.test(haystack)) score += 18;

  if (/ipo|called by|ceases to be|recognizes .* sovereignty|troops fighting/.test(haystack)) score -= 45;
  if (/by june 30|by december 31|by march 31/.test(haystack) && params.category !== "Sports") score -= 16;

  return score;
}

function selectDiverseTakes(takes: MarketHotTake[], limit: number) {
  const caps: Record<MarketHotTake["category"], number> = {
    Sports: 3,
    Politics: 3,
    Crypto: 2,
    Tech: 2,
    Culture: 2,
    Music: 2,
    Art: 2,
  };
  const counts = new Map<MarketHotTake["category"], number>();
  const selected: MarketHotTake[] = [];

  for (const take of takes) {
    const count = counts.get(take.category) ?? 0;
    if (count >= caps[take.category]) continue;
    selected.push(take);
    counts.set(take.category, count + 1);
    if (selected.length >= limit) return selected;
  }

  for (const take of takes) {
    if (selected.some((item) => item.label === take.label)) continue;
    selected.push(take);
    if (selected.length >= limit) return selected;
  }

  return selected;
}

function publicTake(take: MarketHotTake): Omit<MarketHotTake, "score"> {
  const { score: _score, ...rest } = take;
  return rest;
}

function pickBestMarket(event: PolymarketEvent): PolymarketMarket | null {
  const markets = Array.isArray(event.markets) ? event.markets : [];
  const candidates = markets.filter((market) => {
    const outcomes = parseJsonArray(market.outcomes).map((outcome) => outcome.toLowerCase());
    return (
      market.active !== false &&
      market.closed !== true &&
      market.acceptingOrders !== false &&
      outcomes.includes("yes") &&
      outcomes.includes("no") &&
      typeof market.question === "string" &&
      market.question.trim().length > 0
    );
  });

  candidates.sort((a, b) => (asNumber(b.volume24hr) ?? asNumber(b.volume) ?? 0) - (asNumber(a.volume24hr) ?? asNumber(a.volume) ?? 0));
  return candidates[0] ?? null;
}

function normalizeMarket(event: PolymarketEvent): MarketHotTake | null {
  if (event.active === false || event.closed === true) return null;

  const market = pickBestMarket(event);
  if (!market?.question) return null;

  const prices = parseJsonArray(market.outcomePrices).map(Number);
  const outcomes = parseJsonArray(market.outcomes).map((outcome) => outcome.toLowerCase());
  const yesIndex = outcomes.indexOf("yes");
  const yesPrice = yesIndex >= 0 ? prices[yesIndex] : undefined;
  const probability = typeof yesPrice === "number" && Number.isFinite(yesPrice)
    ? Math.round(yesPrice * 100)
    : undefined;

  const volume24hr = asNumber(market.volume24hr) ?? asNumber(event.volume24hr);
  const liquidity = asNumber(market.liquidityNum) ?? asNumber(market.liquidity) ?? asNumber(event.liquidity);
  const volumeLabel = compactUsd(volume24hr);
  const liquidityLabel = compactUsd(liquidity);
  const subtitleParts = [
    probability !== undefined ? `${probability}% Yes` : null,
    volumeLabel ? `${volumeLabel} 24h volume` : null,
    liquidityLabel ? `${liquidityLabel} liquidity` : null,
  ].filter(Boolean);

  const question = cleanQuestion(market.question);
  const category = categoryFromTags(event.tags, question);
  if (isLowEnergyQuestion(question, probability)) return null;

  const slug = market.slug ?? event.slug;
  const marketUrl = slug ? `https://polymarket.com/event/${slug}` : "https://polymarket.com";
  const oddsContext = probability !== undefined ? ` (Polymarket Yes: ${probability}%)` : "";
  const volume = asNumber(market.volume);
  const score = debateEnergyScore({
    question,
    category,
    tags: tagText(event.tags),
    probability,
    volume24hr,
    volume,
    liquidity,
  });

  return {
    label: `Yes vs No — ${question}${oddsContext}`,
    category,
    source: "polymarket",
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(" · ") : "Live Polymarket hot take",
    url: marketUrl,
    probability,
    volume24hr,
    score,
  };
}

async function fetchPolymarketEvents(url: string, signal: AbortSignal): Promise<PolymarketEvent[]> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Clashboard/1.0 Market Hot Takes",
    },
    signal,
    next: { revalidate: 60 },
  });

  if (!response.ok) throw new Error(`Polymarket ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data as PolymarketEvent[] : [];
}

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const results = await Promise.allSettled(
      POLYMARKET_EVENT_URLS.map((url) => fetchPolymarketEvents(url, controller.signal))
    );

    const events = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const seen = new Set<string>();
    const rankedTakes = events
      .map(normalizeMarket)
      .filter((take): take is MarketHotTake => {
        if (!take || seen.has(take.label)) return false;
        seen.add(take.label);
        return true;
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const takes = selectDiverseTakes(rankedTakes, 8).map(publicTake);

    return NextResponse.json({
      takes: takes.length > 0 ? takes : FALLBACK_MARKETS,
      source: takes.length > 0 ? "polymarket" : "fallback",
    });
  } catch {
    return NextResponse.json({ takes: FALLBACK_MARKETS, source: "fallback" });
  } finally {
    clearTimeout(timeout);
  }
}
