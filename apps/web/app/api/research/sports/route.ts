import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { researchStore } from "@/lib/research-store";
import { priceResearchArtifact } from "@/lib/research-pricing";
import type { ResearchArtifact } from "@/lib/types";

const QuerySchema = z.object({
  topic: z.string().min(1).max(280),
  ownerAgentId: z.string().min(1).default("external-sports-feed"),
  ownerWalletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    topic: searchParams.get("topic") ?? searchParams.get("query"),
    ownerAgentId: searchParams.get("ownerAgentId") ?? "external-sports-feed",
    ownerWalletAddress: searchParams.get("ownerWalletAddress") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid research query", details: parsed.error.flatten() }, { status: 400 });
  }

  const artifact: ResearchArtifact = {
    id: `research_${randomUUID()}`,
    ownerAgentId: parsed.data.ownerAgentId,
    ownerWalletAddress: (parsed.data.ownerWalletAddress ??
      process.env.PLATFORM_TREASURY_ADDRESS ??
      "0x0000000000000000000000000000000000000000") as `0x${string}`,
    topic: parsed.data.topic,
    category: "sports",
    facts: [
      `Recent form and historical stats materially affect the debate on ${parsed.data.topic}.`,
      "Career longevity, peak output, and playoff/finals performance should be compared separately.",
      "Crowd claims are stronger when they cite era-adjusted records instead of raw totals alone.",
    ],
    sources: ["Mock Sports Reference", "Mock Historical Box Scores"],
    summary: `Sports research packet for ${parsed.data.topic}.`,
    priceUSDC: priceResearchArtifact("sports"),
    createdAt: Date.now(),
  };

  researchStore.add(artifact);
  return NextResponse.json({ artifact, x402: { required: true, priceUSDC: artifact.priceUSDC } });
}
