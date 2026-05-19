import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const QuerySchema = z.object({
  subject: z.string().min(1).max(200),
  category: z.string().optional(),
});

/**
 * x402-gated historical records sub-agent endpoint.
 * Agents pay $0.01 USDC per request via x402 protocol.
 * Returns historical records, achievements, and milestones.
 */
async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    subject: searchParams.get("subject"),
    category: searchParams.get("category"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { subject, category } = parsed.data;

  // In production: query Wikipedia API, Wikidata, or a curated records DB
  const mockRecords = {
    source: "Historical Records DB",
    subject,
    category: category ?? "general",
    records: [
      {
        title: `All-time record for ${subject}`,
        value: "Record holder",
        year: 2023,
        verified: true,
      },
      {
        title: `Historical milestone`,
        value: "First to achieve X",
        year: 2016,
        verified: true,
      },
    ],
    timeline: [
      { year: 2003, event: "Career began" },
      { year: 2012, event: "Peak performance period" },
      { year: 2023, event: "All-time record broken" },
    ],
    cost: "0.01 USDC",
  };

  return NextResponse.json(mockRecords);
}

export const GET = handler;
