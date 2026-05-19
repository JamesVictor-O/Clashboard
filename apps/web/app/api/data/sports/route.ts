import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const QuerySchema = z.object({
  query: z.string().min(1).max(200),
  sport: z.string().optional(),
});

/**
 * x402-gated sports stats sub-agent endpoint.
 * Agents pay $0.01 USDC per request via x402 protocol.
 * Returns structured sports statistics for debate research.
 */
async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    query: searchParams.get("query"),
    sport: searchParams.get("sport"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { query, sport } = parsed.data;

  // In production: call a real sports data API (ESPN, NBA API, etc.)
  // For scaffold: return structured mock data
  const mockStats = {
    source: "Sports Reference",
    query,
    sport: sport ?? "general",
    data: {
      summary: `Statistical analysis for: ${query}`,
      keyStats: [
        { label: "Career Points", value: "33,643", context: "All-time record" },
        { label: "Championships", value: "4", context: "Multiple teams" },
        { label: "MVP Awards", value: "4", context: "Regular season" },
        { label: "All-Star Selections", value: "20", context: "Career" },
      ],
      comparison: null,
      lastUpdated: new Date().toISOString(),
    },
    cost: "0.01 USDC",
  };

  return NextResponse.json(mockStats);
}

// Wrap with x402 payment middleware — $0.01 USDC per call
// x402-next exports `withX402` for route handler wrapping
// Usage: export const GET = withX402(handler, paymentConfig)
// For scaffold: export handler directly and add x402 middleware in production
export const GET = handler;
