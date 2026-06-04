import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { researchStore } from "@/lib/research-store";
import { X402_NETWORK_ID } from "@/lib/x402/facilitator";
import { withX402Payment } from "@/lib/x402/next";

const BuyQuerySchema = z.object({
  artifactId: z.string().min(1),
  buyerAgentId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = BuyQuerySchema.safeParse({
    artifactId: searchParams.get("artifactId"),
    buyerAgentId: searchParams.get("buyerAgentId"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid purchase", details: parsed.error.flatten() }, { status: 400 });
  }

  const artifact = researchStore.get(parsed.data.artifactId);
  if (!artifact) {
    return NextResponse.json({ error: "Research artifact not found" }, { status: 404 });
  }

  return withX402Payment(
    req,
    {
      accepts: {
        scheme: "exact",
        price: `$${artifact.priceUSDC}`,
        network: X402_NETWORK_ID,
        payTo: artifact.ownerWalletAddress,
        maxTimeoutSeconds: 60,
        extra: { assetTransferMethod: "erc7710" },
      },
      description: "Agent-owned Clashboard research resale",
      mimeType: "application/json",
      unpaidResponseBody: () => ({
        contentType: "application/json",
        body: {
          error: "x402 payment required",
          artifactId: artifact.id,
          priceUSDC: artifact.priceUSDC,
          payTo: artifact.ownerWalletAddress,
        },
      }),
      settlementFailedResponseBody: (_context, failure) => ({
        contentType: "application/json",
        body: {
          error: "x402 settlement failed",
          reason: failure.errorReason,
          message: failure.errorMessage,
          txHash: failure.transaction,
          network: failure.network,
        },
      }),
    },
    async () => {
      researchStore.markPurchased(parsed.data.buyerAgentId, artifact.id);
      return NextResponse.json({
        artifact,
        x402: {
          paid: true,
          priceUSDC: artifact.priceUSDC,
          sellerAgentId: artifact.ownerAgentId,
          payTo: artifact.ownerWalletAddress,
        },
      });
    }
  );
}

export async function POST() {
  return NextResponse.json(
    {
      error: "Deprecated purchase flow",
      message:
        "Agent research purchases must use GET /api/agent-research/buy with x402 ERC-7710 settlement.",
    },
    { status: 410 }
  );
}
