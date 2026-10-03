import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { BankError, bankId, secretMatches } from "@/lib/bank-domain";
import { bankBody, bankFailure, bankJson } from "@/lib/bank-http";
import { connectBank, syncBank } from "@/lib/bank-sync";
import { pluggy } from "@/lib/pluggy";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  try {
    if (!secretMatches(request.headers.get("x-meu-caixa-webhook"), process.env.PLUGGY_WEBHOOK_SECRET)) throw new BankError("Webhook não autorizado.", 403);
    const body = await bankBody(request);
    if (typeof body.itemId !== "string") return bankJson({ received: true });
    const itemId = bankId(body.itemId);
    let connection = await prisma.bankConnection.findUnique({ where: { itemId } });
    if (!connection && body.event === "item/created") {
      const item = await pluggy(`/items/${itemId}`);
      const user = typeof item.clientUserId === "string" ? await prisma.user.findUnique({ where: { id: item.clientUserId } }) : null;
      if (user) { await connectBank(user.id, itemId); return bankJson({ received: true }); }
    }
    if (!connection || !connection.enabled) return bankJson({ received: true });
    if (body.event === "item/deleted") {
      await prisma.bankConnection.update({ where: { id: connection.id }, data: { enabled: false, status: "DISCONNECTED" } });
    } else if (body.event === "transactions/deleted" && Array.isArray(body.transactionIds)) {
      const ids = body.transactionIds.slice(0, 1000).map(bankId);
      const where = { account: { connectionId: connection.id }, externalId: { in: ids } };
      await prisma.bankTransaction.updateMany({ where: { ...where, linkedId: null }, data: { reviewStatus: "REMOVED" } });
      await prisma.bankTransaction.updateMany({ where: { ...where, linkedId: { not: null } }, data: { reviewStatus: "CHANGED" } });
    } else if (/^(item|transactions)\//.test(String(body.event))) await syncBank(connection);
    return bankJson({ received: true });
  } catch (error) { return bankFailure(error); }
}
