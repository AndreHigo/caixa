import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invoiceDates } from "./finance";

export async function rebuildInvoices(cardId: string, db: Prisma.TransactionClient = prisma) {
  const card = await db.card.findUnique({ where: { id: cardId } });
  if (!card) return;
  const rows = await db.cardInstallment.findMany({ where: { purchase: { cardId } } });
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) grouped.set(row.referenceMonth, [...(grouped.get(row.referenceMonth) || []), row]);
  const months = [...grouped.keys()];
  await db.cardInvoice.deleteMany({ where: { cardId, ...(months.length ? { referenceMonth: { notIn: months } } : {}) } });
  for (const [referenceMonth, installments] of grouped) {
    const dates = invoiceDates(card, referenceMonth);
    const totalCents = installments.reduce((sum, row) => sum + row.amountCents, 0);
    const status = installments.every(row => row.status === "PAID") ? "PAID" : "OPEN";
    const existing = await db.cardInvoice.findUnique({ where: { cardId_referenceMonth: { cardId, referenceMonth } } });
    const paidAt = status === "PAID" ? existing?.paidAt || new Date() : null;
    const invoice = await db.cardInvoice.upsert({
      where: { cardId_referenceMonth: { cardId, referenceMonth } },
      update: { totalCents, ...dates, status, paidAt },
      create: { cardId, referenceMonth, totalCents, ...dates, status, paidAt },
    });
    await db.cardInstallment.updateMany({ where: { id: { in: installments.map(row => row.id) } }, data: { invoiceId: invoice.id } });
  }
}
