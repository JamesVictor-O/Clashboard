import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { researchStore } from "@/lib/research-store";
import { validateAutonomousAction } from "@/lib/policy";
import { payAgentResearchWith1Shot } from "@/lib/payments/oneshot";
import type { PermissionMetadata } from "@/lib/types";

const BuySchema = z.object({
  artifactId: z.string().min(1),
  buyerAgentId: z.string().min(1),
  buyerWalletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  permission: z.custom<PermissionMetadata>(),
  spentUSDC: z.union([z.string(), z.number()]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = BuySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid purchase", details: parsed.error.flatten() }, { status: 400 });
    }

    const artifact = researchStore.get(parsed.data.artifactId);
    if (!artifact) {
      return NextResponse.json({ error: "Research artifact not found" }, { status: 404 });
    }

    const policy = validateAutonomousAction({
      permission: parsed.data.permission,
      action: "BUY_AGENT_RESEARCH",
      amountUSDC: artifact.priceUSDC,
      spentUSDC: parsed.data.spentUSDC,
      target: artifact.ownerWalletAddress,
    });
    if (!policy.ok) {
      return NextResponse.json({ error: policy.reason }, { status: 403 });
    }

    const execution = await payAgentResearchWith1Shot({
      permissionContext: parsed.data.permission,
      amountUSDC: artifact.priceUSDC,
      recipient: artifact.ownerWalletAddress,
      chainId: parsed.data.permission.chainId,
      actionData: {
        artifactId: artifact.id,
        buyerAgentId: parsed.data.buyerAgentId,
        sellerAgentId: artifact.ownerAgentId,
      },
    });

    researchStore.markPurchased(parsed.data.buyerAgentId, artifact.id);

    return NextResponse.json({
      artifact,
      txHash: execution.txHash,
      status: execution.status,
    });
  } catch (err) {
    console.error("agent-research/buy error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
