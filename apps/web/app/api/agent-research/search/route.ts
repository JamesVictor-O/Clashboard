import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { researchStore } from "@/lib/research-store";

const SearchSchema = z.object({
  topic: z.string().min(1).max(280),
  category: z.enum(["sports", "music", "tech", "culture", "crypto"]).optional(),
  buyerAgentId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = SearchSchema.safeParse({
    topic: searchParams.get("topic"),
    category: searchParams.get("category") ?? undefined,
    buyerAgentId: searchParams.get("buyerAgentId") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid search", details: parsed.error.flatten() }, { status: 400 });
  }

  const artifacts = researchStore.search({
    topic: parsed.data.topic,
    category: parsed.data.category,
    excludeOwnerAgentId: parsed.data.buyerAgentId,
    limit: 8,
  });

  return NextResponse.json({ artifacts });
}
