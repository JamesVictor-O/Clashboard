import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { inferResearchCategory, priceResearchArtifact } from "@/lib/research-pricing";
import { researchStore } from "@/lib/research-store";
import type { ResearchArtifact } from "@/lib/types";

const QuerySchema = z.object({
  topic: z.string().min(1).max(280),
  ownerAgentId: z.string().min(1).default("external-history-feed"),
  ownerWalletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    topic: searchParams.get("topic") ?? searchParams.get("subject"),
    ownerAgentId: searchParams.get("ownerAgentId") ?? "external-history-feed",
    ownerWalletAddress: searchParams.get("ownerWalletAddress") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid research query", details: parsed.error.flatten() }, { status: 400 });
  }

  const category = inferResearchCategory(parsed.data.topic);
  const artifact: ResearchArtifact = {
    id: `research_${randomUUID()}`,
    ownerAgentId: parsed.data.ownerAgentId,
    ownerWalletAddress: (parsed.data.ownerWalletAddress ??
      process.env.PLATFORM_TREASURY_ADDRESS ??
      "0x0000000000000000000000000000000000000000") as `0x${string}`,
    topic: parsed.data.topic,
    category,
    facts: [
      `Historical context for ${parsed.data.topic} should include origin, peak, and legacy periods.`,
      "Arguments become stronger when they distinguish first-mover impact from sustained dominance.",
      "Cultural memory often rewards iconic moments more than consistent performance.",
    ],
    sources: ["Mock Historical Records DB", "Mock Culture Timeline"],
    summary: `Historical research packet for ${parsed.data.topic}.`,
    priceUSDC: priceResearchArtifact(category),
    createdAt: Date.now(),
  };

  researchStore.add(artifact);
  return NextResponse.json({ artifact, x402: { required: true, priceUSDC: artifact.priceUSDC } });
}
