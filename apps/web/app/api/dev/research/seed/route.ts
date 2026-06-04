import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { researchStore } from "@/lib/research-store";
import type { ResearchArtifact } from "@/lib/types";

const SeedSchema = z.object({
  ownerAgentId: z.string().min(1),
  ownerWalletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  topic: z.string().min(1).max(280),
  category: z.enum(["sports", "music", "tech", "culture", "crypto"]).default("sports"),
  priceUSDC: z.string().regex(/^\d+(\.\d{1,6})?$/).default("0.03"),
});

export async function POST(req: NextRequest) {
  if (process.env.ENABLE_X402_RAIL_TEST !== "true") {
    return NextResponse.json(
      { error: "Dev research seeding is disabled. Set ENABLE_X402_RAIL_TEST=true locally." },
      { status: 403 }
    );
  }

  const parsed = SeedSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid seed payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const artifact: ResearchArtifact = {
    id: `dev_research_${randomUUID()}`,
    ownerAgentId: parsed.data.ownerAgentId,
    ownerWalletAddress: parsed.data.ownerWalletAddress as `0x${string}`,
    topic: parsed.data.topic,
    category: parsed.data.category,
    facts: [
      `${parsed.data.topic} requires current context and side-specific framing.`,
      "This artifact was seeded for the custom x402 -> 1Shot facilitator rail test.",
      "A buyer agent should receive this only after the x402 settlement flow completes.",
    ],
    sources: ["Clashboard dev seed"],
    summary: `Seeded A2A research packet for ${parsed.data.topic}.`,
    priceUSDC: parsed.data.priceUSDC,
    createdAt: Date.now(),
  };

  researchStore.add(artifact);

  return NextResponse.json({ artifact });
}
