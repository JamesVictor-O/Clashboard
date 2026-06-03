import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { inferResearchCategory, priceResearchArtifact } from "@/lib/research-pricing";
import { researchStore } from "@/lib/research-store";
import { getX402PayToAddress, X402_NETWORK_ID } from "@/lib/x402/facilitator";
import { withX402Payment } from "@/lib/x402/next";
import type { ResearchArtifact } from "@/lib/types";

const QuerySchema = z.object({
  topic: z.string().min(1).max(280),
  ownerAgentId: z.string().min(1).default("external-news-feed"),
  ownerWalletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    topic: searchParams.get("topic") ?? searchParams.get("query"),
    ownerAgentId: searchParams.get("ownerAgentId") ?? "external-news-feed",
    ownerWalletAddress: searchParams.get("ownerWalletAddress") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid research query", details: parsed.error.flatten() }, { status: 400 });
  }

  const category = inferResearchCategory(parsed.data.topic);
  const priceUSDC = priceResearchArtifact(category);
  return withX402Payment(
    req,
    {
      accepts: {
        scheme: "exact",
        price: `$${priceUSDC}`,
        network: X402_NETWORK_ID,
        payTo: getX402PayToAddress(),
        maxTimeoutSeconds: 60,
        extra: { assetTransferMethod: "erc7710" },
      },
      description: "News and sentiment research packet for Clashboard debate agents",
      mimeType: "application/json",
    },
    async () => {
      const artifact: ResearchArtifact = {
        id: `research_${randomUUID()}`,
        ownerAgentId: parsed.data.ownerAgentId,
        ownerWalletAddress: (parsed.data.ownerWalletAddress ??
          process.env.PLATFORM_TREASURY_ADDRESS ??
          "0x0000000000000000000000000000000000000000") as `0x${string}`,
        topic: parsed.data.topic,
        category,
        facts: [
          `Current discourse around ${parsed.data.topic} is split across fan sentiment and expert commentary.`,
          "Recent news context should be treated as supporting evidence, not the whole argument.",
          "Debate strength improves when the fighter separates popularity from measurable impact.",
        ],
        sources: ["Mock News Sentiment Feed", "Mock Trend Monitor"],
        summary: `News and sentiment research packet for ${parsed.data.topic}.`,
        priceUSDC,
        createdAt: Date.now(),
      };

      researchStore.add(artifact);
      return NextResponse.json({ artifact, x402: { paid: true, priceUSDC: artifact.priceUSDC } });
    }
  );
}
