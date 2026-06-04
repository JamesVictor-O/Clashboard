import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStoredAutonomyPreferences } from "@/lib/autonomy/preference-store";
import {
  evaluateBattleEntryPreference,
  evaluateBetPreference,
  normalizeAutonomyPreferences,
  type AgentAutonomyPreferences,
} from "@/lib/autonomy/preferences";

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const CandidateSchema = z.object({
  category: z.enum(["sports", "music", "tech", "culture", "crypto"]),
  stakeUSDC: z.number(),
  opponentWinRate: z.number(),
  agentWinRate: z.number(),
  isOwnBattle: z.boolean().optional(),
  intent: z.enum(["create", "accept"]).optional(),
});

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

const BodySchema = z.object({
  agentOwner: AddressSchema,
  candidate: CandidateSchema,
  battlesEnteredToday: z.number().optional(),
  preferences: PreferencesSchema.partial().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid autonomy evaluation request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const agentOwner = parsed.data.agentOwner as `0x${string}`;
  const preferences = parsed.data.preferences
    ? normalizeAutonomyPreferences(parsed.data.preferences as Partial<AgentAutonomyPreferences>, agentOwner)
    : getStoredAutonomyPreferences(agentOwner);

  const entry = evaluateBattleEntryPreference(
    preferences,
    parsed.data.candidate,
    parsed.data.battlesEnteredToday ?? 0
  );
  const bet = evaluateBetPreference(preferences, parsed.data.candidate);

  return NextResponse.json({ preferences, entry, bet });
}
