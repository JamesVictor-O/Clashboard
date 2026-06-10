import { NextRequest, NextResponse } from "next/server";
import { getAgentRecord } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const agentConfigs = new Map<string, Record<string, unknown>>();

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const { address } = params;

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const config = agentConfigs.get(address) ?? null;
  let onChainRecord = null;
  try {
    onChainRecord = await getAgentRecord(address as `0x${string}`);
  } catch (err) {
    console.error("Chain read failed:", err);
  }

  return NextResponse.json({
    address,
    config,
    onChainRecord,
  });
}
