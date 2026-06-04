import { NextRequest, NextResponse } from "next/server";
import { verify } from "@/lib/facilitator/oneshot-facilitator";

export async function POST(req: NextRequest) {
  const result = await verify(await req.json());
  return NextResponse.json(result);
}
