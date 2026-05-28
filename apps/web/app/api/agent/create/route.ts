import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const AgentConfigSchema = z.object({
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  name: z.string().min(1).max(32),
  personality: z.enum([
    "Historian",
    "Analyst",
    "Roaster",
    "Contrarian",
    "Professor",
    "Hype Man",
  ]),
  customInstructions: z.string().max(500).optional(),
  specialties: z.array(z.string()).max(5),
  fightingStyle: z.enum(["Methodical", "Aggressive", "Witty", "Defensive", "Balanced"]),
  operatingBudgetUSDC: z.number().min(1).max(50).optional(),
  researchBudget: z.number().min(1).max(50).optional(),
});


const agentConfigs = new Map<string, z.infer<typeof AgentConfigSchema>>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = AgentConfigSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid agent config", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const config = parsed.data;
    const existing = agentConfigs.get(config.walletAddress);
    if (existing) {
      // Update existing config
      agentConfigs.set(config.walletAddress, config);
      return NextResponse.json({ success: true, updated: true, config });
    }

    agentConfigs.set(config.walletAddress, config);

    return NextResponse.json(
      { success: true, updated: false, config },
      { status: 201 }
    );
  } catch (err) {
    console.error("agent/create error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
