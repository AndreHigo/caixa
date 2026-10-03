import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";
import { sameOrigin } from "@/lib/origin";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request.headers, request.nextUrl.origin)) return NextResponse.json({ error: "Origem não autorizada" }, { status: 403 });
  await clearSession(); return NextResponse.json({ ok: true });
}
