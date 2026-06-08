import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { registerArenaPermission } from "@/lib/autonomy/arena-permission-store";
import { setStoredAutonomyPreferences } from "@/lib/autonomy/preference-store";
import { normalizeAutonomyPreferences } from "@/lib/autonomy/preferences";
import type { AgentAutonomyPreferences } from "@/lib/autonomy/preferences";
import type { PermissionMetadata } from "@/lib/types";

const PermissionSchema = z.object({
  context: z.unknown(),
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
});

const PreferencesSchema = z.object({
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
});

const BodySchema = z.object({
  agentOwner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  arenaPermission: PermissionSchema,
  preferences: PreferencesSchema.optional(),
});

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { agentOwner, arenaPermission, preferences } = parsed.data;
  const owner = agentOwner as `0x${string}`;

  // Store the arena permission so the agent-loop can execute 1Shot without the browser
  registerArenaPermission(arenaPermission as PermissionMetadata);

  // Optionally sync preferences at the same time
  if (preferences) {
    setStoredAutonomyPreferences(
      normalizeAutonomyPreferences(
        { ...preferences, agentOwner: owner, updatedAt: Date.now() } as Partial<AgentAutonomyPreferences>,
        owner
      )
    );
  }

  return NextResponse.json({ ok: true, walletAddress: owner });
}
