import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { secretMatches } from "@/lib/bank-domain";
import { bankJson } from "@/lib/bank-http";
import { syncBank } from "@/lib/bank-sync";
import { bankConfigured } from "@/lib/pluggy";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
// Alternativa para um agendador externo; não inicia novo consentimento nem movimenta dinheiro.
export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get("authorization")?.replace(/^Bearer /, "") || null, process.env.BANK_SYNC_SECRET)) return bankJson({ error: "Agendador não autorizado." }, 403);
  if (!bankConfigured()) return bankJson({ error: "Provedor não configurado." }, 503);
  const connections = await prisma.bankConnection.findMany({ where: { enabled: true }, orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 2 });
  let synced = 0; let failed = 0;
  for (const connection of connections) { try { await syncBank(connection); synced++; } catch { failed++; } }
  return bankJson({ synced, failed }, failed ? 502 : 200);
}
