import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { execute1Shot } from "@/lib/oneshot/client";

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
    return NextResponse.json(result);
  } catch (err) {
    console.error("autonomy/execute error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "1Shot execution failed" },
      { status: 500 }
    );
  }
}
