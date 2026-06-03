import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { registerServerResearchSession } from "@/lib/agent-research-session-store";
import type { AgentSession } from "@/lib/metamask";
import type { PermissionMetadata } from "@/lib/types";

const ResearchSessionSchema = z.object({
  session: z.object({
    sessionAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    sessionPrivateKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    createdAt: z.number().int(),
    walletAddress: z.string(),
    chainId: z.number().int(),
  }),
  researchPermission: z.object({
    context: z.any(),
    delegationManager: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    sessionAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    expiry: z.number().int(),
    budgetUSDC: z.number(),
    budgetPeriod: z.string(),
    chainId: z.number().int(),
    permissionType: z.string(),
    createdAt: z.number().int(),
    active: z.boolean(),
    rail: z.enum(["arena", "research"]).optional(),
    totalBudgetUSDC: z.number().optional(),
  }),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = ResearchSessionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid research session", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Hackathon/demo custody: the browser sends the session key so the backend
    // can autonomously redeem the session-scoped x402 research grant during SSE
    // battle orchestration. Production should encrypt this payload or move it to
    // MPC/secure custody.
    const entry = registerServerResearchSession({
      session: parsed.data.session as AgentSession,
      researchPermission: parsed.data.researchPermission as PermissionMetadata,
    });

    return NextResponse.json({
      ok: true,
      walletAddress: entry.walletAddress,
      sessionAddress: entry.sessionAddress,
      updatedAt: entry.updatedAt,
    });
  } catch (err) {
    console.error("agent/research-session error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
