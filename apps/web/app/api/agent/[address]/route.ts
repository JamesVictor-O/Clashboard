import { NextRequest, NextResponse } from "next/server";
import { getAgentRecord } from "@/lib/chain";

// In-memory store — same map as create route (in prod, use shared DB)
// For scaffold purposes we re-declare; in production extract to a shared module
const agentConfigs = new Map<string, Record<string, unknown>>();

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const { address } = params;

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  // Fetch off-chain config
  const config = agentConfigs.get(address) ?? null;

  // Fetch on-chain record
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
