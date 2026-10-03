import { NextRequest } from "next/server";
import { bankFailure, bankJson, bankUser } from "@/lib/bank-http";
import { bankCandidates } from "@/lib/bank-review";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try { const user = await bankUser(request); return bankJson({ candidates: await bankCandidates(user.id, request.nextUrl.searchParams.get("transactionId") || "") }); }
  catch (error) { return bankFailure(error); }
}
