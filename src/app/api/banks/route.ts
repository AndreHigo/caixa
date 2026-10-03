import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { bankConfigured, bankSandbox } from "@/lib/pluggy";
import { bankFailure, bankJson, bankUser } from "@/lib/bank-http";
import { BankError, bankMonth } from "@/lib/bank-domain";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const user = await bankUser(request);
    const month = bankMonth(request.nextUrl.searchParams.get("month"));
    const page = Number(request.nextUrl.searchParams.get("page") || 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new BankError("Página inválida.");
    const start = new Date(`${month}-01T00:00:00-03:00`);
    const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
    const pending = request.nextUrl.searchParams.get("review") !== "all";
    const accountId = request.nextUrl.searchParams.get("account") || undefined;
    const where = { userId: user.id, date: { gte: start, lt: end }, ...(pending ? { reviewStatus: { in: ["NEW", "CHANGED"] } } : {}), ...(accountId ? { accountId } : {}) };
    const [connections, transactions, total, pendingCount] = await Promise.all([
      prisma.bankConnection.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, institution: true, status: true, enabled: true, sandbox: true, lastSyncedAt: true, providerUpdatedAt: true, consentExpiresAt: true, syncStartedAt: true, syncError: true, accounts: { where: { active: true }, select: { id: true, name: true, type: true, currency: true, numberLast4: true, balanceCents: true, limitCents: true, availableLimitCents: true, dueDate: true, closingDate: true, bills: { where: { dueDate: { gte: start, lt: end } }, select: { id: true, dueDate: true, totalCents: true, currency: true } } } } } }),
      prisma.bankTransaction.findMany({ where, orderBy: [{ date: "desc" }, { id: "asc" }], skip: (page - 1) * 50, take: 50, select: { id: true, description: true, date: true, amountCents: true, currency: true, direction: true, status: true, reviewStatus: true, suggestedCategory: true, operationType: true, installmentNumber: true, totalInstallments: true, referenceMonth: true, linkedKind: true, linkedId: true, account: { select: { id: true, name: true, type: true, connection: { select: { institution: true, sandbox: true } } } } } }),
      prisma.bankTransaction.count({ where }),
      prisma.bankTransaction.count({ where: { userId: user.id, reviewStatus: { in: ["NEW", "CHANGED"] } } }),
    ]);
    const cashAccounts = connections.filter(row => row.enabled && !row.sandbox).flatMap(row => row.accounts).filter(row => row.type === "BANK" && row.currency === "BRL" && row.balanceCents != null);
    return bankJson({ config: { configured: bankConfigured(), sandbox: bankSandbox(), webhookConfigured: Boolean(process.env.PLUGGY_WEBHOOK_SECRET && process.env.PLUGGY_WEBHOOK_SECRET.length >= 32) }, connections, transactions, total, pendingCount, page, hasMore: page * 50 < total, cashBalanceCents: cashAccounts.length ? cashAccounts.reduce((sum, row) => sum + (row.balanceCents || 0), 0) : null });
  } catch (error) { return bankFailure(error); }
}
