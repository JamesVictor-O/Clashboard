import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const QuerySchema = z.object({
  query: z.string().min(1).max(200),
  sentiment: z.enum(["positive", "negative", "neutral", "all"]).optional(),
});

/**
 * x402-gated news sentiment sub-agent endpoint.
 * Agents pay $0.01 USDC per request via x402 protocol.
 * Returns recent news headlines + sentiment scores for debate research.
 */
async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    query: searchParams.get("query"),
    sentiment: searchParams.get("sentiment") ?? "all",
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { query, sentiment } = parsed.data;

  // In production: call NewsAPI, GDELT, or similar
  const mockNews = {
    source: "News Sentiment API",
    query,
    sentimentFilter: sentiment ?? "all",
    articles: [
      {
        headline: `Latest developments in: ${query}`,
        sentiment: 0.72,
        label: "positive",
        publishedAt: new Date(Date.now() - 86400000).toISOString(),
        source: "ESPN",
      },
      {
        headline: `Analysis: ${query} — what the numbers say`,
        sentiment: 0.15,
        label: "neutral",
        publishedAt: new Date(Date.now() - 172800000).toISOString(),
        source: "The Athletic",
      },
    ],
    overallSentiment: 0.44,
    totalArticles: 47,
    cost: "0.01 USDC",
  };

  return NextResponse.json(mockNews);
}

export const GET = handler;
