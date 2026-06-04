import { NextResponse } from "next/server";
import { getSupported } from "@/lib/facilitator/oneshot-facilitator";

export async function GET() {
  try {
    return NextResponse.json(await getSupported());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to load facilitator support metadata" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    return NextResponse.json(await getSupported());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to load facilitator support metadata" },
      { status: 500 }
    );
  }
}
