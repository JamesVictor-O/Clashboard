import { NextRequest, NextResponse } from "next/server";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { z } from "zod";
import { researchStore } from "@/lib/research-store";
import { battleStore } from "@/lib/battle-store";
import { X402_NETWORK_ID } from "@/lib/x402/facilitator";
import { withX402Payment } from "@/lib/x402/next";
import type { ResearchArtifact, ResearchPurchase } from "@/lib/types";

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

  const response = await withX402Payment(
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

  if (response.ok) {
    const txHash = settlementTxFromResponse(response);
    const battlePurchase = txHash
      ? buildBattleResearchPurchase({
          artifact,
          buyerAgentId: parsed.data.buyerAgentId,
          txHash,
        })
      : null;
    if (battlePurchase) {
      researchStore.recordBattlePurchase(battlePurchase.battleId, battlePurchase.purchase);
    }
  }

  return response;
}

function buildBattleResearchPurchase(params: {
  artifact: ResearchArtifact;
  buyerAgentId: string;
  txHash: `0x${string}`;
}): { battleId: string; purchase: ResearchPurchase } | null {
  const match = /^e2e_research_(0x[0-9a-fA-F]{64})_(0x[0-9a-fA-F]{40})$/.exec(params.artifact.id);
  if (!match) return null;

  const battleId = match[1];
  const stored = battleStore.get(battleId);
  const buyer = params.buyerAgentId.toLowerCase();
  const side: "A" | "B" =
    stored?.battle.agentA.address.toLowerCase() === buyer ? "A" : "B";

  return {
    battleId,
    purchase: {
      id: `${side}_${params.artifact.id}_${buyer}`,
      agent: side,
      source: "A2A Research Market",
      endpoint: "/api/agent-research/buy",
      cost: `${params.artifact.priceUSDC} USDC`,
      txHash: params.txHash,
      data: {
        artifactId: params.artifact.id,
        topic: params.artifact.topic,
        category: params.artifact.category,
        summary: params.artifact.summary,
        facts: params.artifact.facts,
        sources: params.artifact.sources,
        sellerAgentId: params.artifact.ownerAgentId,
        buyerAgentId: params.buyerAgentId,
      },
      purchasedAt: Date.now(),
    },
  };
}

function settlementTxFromResponse(response: Response): `0x${string}` | undefined {
  const header = response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("X-PAYMENT-RESPONSE");
  if (!header) return undefined;
  try {
    const decoded = decodePaymentResponseHeader(header) as { transaction?: string; txHash?: string };
    const txHash = decoded.transaction ?? decoded.txHash;
    return txHash && /^0x[0-9a-fA-F]{64}$/.test(txHash)
      ? (txHash as `0x${string}`)
      : undefined;
  } catch {
    return undefined;
  }
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
