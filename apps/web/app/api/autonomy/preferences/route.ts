import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStoredAutonomyPreferences, setStoredAutonomyPreferences } from "@/lib/autonomy/preference-store";
import { normalizeAutonomyPreferences, type AgentAutonomyPreferences } from "@/lib/autonomy/preferences";

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const PreferencesSchema = z.object({
  agentOwner: AddressSchema,
  mode: z.enum(["off", "assisted", "autonomous"]).optional(),
  riskMode: z.enum(["Conservative", "Balanced", "Aggressive"]).optional(),
  battleCategories: z.array(z.enum(["sports", "music", "tech", "culture", "crypto"])).optional(),
  maxArenaStakeUSDC: z.number().optional(),
  maxResearchSpendUSDC: z.number().optional(),
  dailyBattleLimit: z.number().optional(),
  autoCreateChallenges: z.boolean().optional(),
  autoAcceptChallenges: z.boolean().optional(),
  autoBetOnBattles: z.boolean().optional(),
  opponentRule: z.enum(["any", "higher_win_rate", "lower_win_rate", "same_category"]).optional(),
  minOpponentWinRate: z.number().optional(),
  maxOpponentWinRate: z.number().optional(),
  preferredBetSide: z.enum(["agent", "underdog", "favorite"]).optional(),
  updatedAt: z.number().optional(),
});

export async function GET(req: NextRequest) {
  const agentOwner = req.nextUrl.searchParams.get("agentOwner");
  const parsed = AddressSchema.safeParse(agentOwner);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid agentOwner" }, { status: 400 });
  }

  return NextResponse.json({
    preferences: getStoredAutonomyPreferences(parsed.data as `0x${string}`),
  });
}

export async function POST(req: NextRequest) {
  const parsed = PreferencesSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid autonomy preferences", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const agentOwner = parsed.data.agentOwner as `0x${string}`;
  const preferences = setStoredAutonomyPreferences(
    normalizeAutonomyPreferences(
      { ...parsed.data, agentOwner, updatedAt: Date.now() } as Partial<AgentAutonomyPreferences>,
      agentOwner
    )
  );

  return NextResponse.json({ preferences });
}
