import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { execute1Shot } from "@/lib/oneshot/client";
import {
  acceptChallengeForOnChain,
  issueChallengeForOnChain,
  placeBetForOnChain,
} from "@/lib/chain";

const ExecuteSchema = z.object({
  permissionContext: z.object({
    context: z.any(),
    delegationManager: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    sessionAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    chainId: z.number().int(),
  }),
  chainId: z.number().int(),
  calls: z.array(z.object({
    to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    data: z.string().regex(/^0x[0-9a-fA-F]*$/),
    value: z.string().optional(),
  })),
  actionType: z.string(),
  metadata: z.record(z.unknown()).optional(),
  memo: z.string().optional(),
});

function hexAddress(value: unknown, name: string): `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} missing or invalid`);
  }
  return value as `0x${string}`;
}

function hexBytes32(value: unknown, name: string): `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} missing or invalid`);
  }
  return value as `0x${string}`;
}

function bigintString(value: unknown, name: string): bigint {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`${name} missing or invalid`);
  }
  return BigInt(value);
}

async function executePostPrefundAction(
  actionType: string,
  metadata: Record<string, unknown> | undefined
): Promise<`0x${string}` | undefined> {
  if (!metadata) return undefined;

  if (actionType === "ISSUE_CHALLENGE") {
    return issueChallengeForOnChain({
      agentOwner: hexAddress(metadata.agentOwner, "agentOwner"),
      roomId: hexBytes32(metadata.roomId, "roomId"),
      topicHash: hexBytes32(metadata.topicHash, "topicHash"),
      topicPreview: String(metadata.topicPreview ?? ""),
      categoryHash: hexBytes32(metadata.categoryHash, "categoryHash"),
      stakeWei: bigintString(metadata.stakeWei, "stakeWei"),
    }) as Promise<`0x${string}`>;
  }

  if (actionType === "ACCEPT_CHALLENGE") {
    return acceptChallengeForOnChain({
      agentOwner: hexAddress(metadata.agentOwner, "agentOwner"),
      roomId: hexBytes32(metadata.roomId, "roomId"),
      battleId: hexBytes32(metadata.battleId, "battleId"),
      bettingDuration: bigintString(metadata.bettingDuration, "bettingDuration"),
      roundDuration: bigintString(metadata.roundDuration, "roundDuration"),
      maxResearch: bigintString(metadata.maxResearch, "maxResearch"),
    }) as Promise<`0x${string}`>;
  }

  if (actionType === "PLACE_BET") {
    const side = metadata.side;
    if (side !== 1 && side !== 2) throw new Error("side missing or invalid");
    return placeBetForOnChain({
      bettor: hexAddress(metadata.agentOwner, "agentOwner"),
      battleId: hexBytes32(metadata.battleId, "battleId"),
      side,
      amountWei: bigintString(metadata.amountWei, "amountWei"),
    }) as Promise<`0x${string}`>;
  }

  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const parsed = ExecuteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid 1Shot execution payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await execute1Shot({
      ...parsed.data,
      permissionContext: {
        context: parsed.data.permissionContext.context,
        delegationManager: parsed.data.permissionContext.delegationManager as `0x${string}`,
        sessionAddress: parsed.data.permissionContext.sessionAddress as `0x${string}`,
        walletAddress: parsed.data.permissionContext.walletAddress as `0x${string}`,
        chainId: parsed.data.permissionContext.chainId,
      },
      calls: parsed.data.calls.map((call) => ({
        to: call.to as `0x${string}`,
        data: call.data as `0x${string}`,
        value: call.value,
      })),
    });

    const actionTxHash = await executePostPrefundAction(
      parsed.data.actionType,
      parsed.data.metadata
    );

    return NextResponse.json({
      ...result,
      prefundTxHash: result.txHash,
      txHash: actionTxHash ?? result.txHash,
    });
  } catch (err) {
    console.error("autonomy/execute error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "1Shot execution failed" },
      { status: 500 }
    );
  }
}
