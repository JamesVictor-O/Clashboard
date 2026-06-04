import { NextRequest, NextResponse } from "next/server";
import { settle } from "@/lib/facilitator/oneshot-facilitator";

export async function POST(req: NextRequest) {
  const result = await settle(await req.json());
  return NextResponse.json(result);
}
