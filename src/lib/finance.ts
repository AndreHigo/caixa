import { Card, CardPurchase } from "@prisma/client";
import { addMonths, monthDate, monthKey } from "./money";

export function originMonth(purchaseDate: Date, closingDay: number) {
  const date = new Date(purchaseDate);
  return monthKey(date.getDate() > closingDay ? addMonths(date, 1) : date);
}

export function splitCents(total: number, installments: number) {
  const base = Math.floor(total / installments);
  return Array.from({ length: installments }, (_, index) => index === installments - 1 ? total - base * (installments - 1) : base);
}

export function installmentsFor(card: Pick<Card, "closingDay">, purchase: Pick<CardPurchase, "purchaseDate" | "totalCents" | "installments">) {
  const origin = monthDate(originMonth(new Date(purchase.purchaseDate), card.closingDay));
  return splitCents(purchase.totalCents, purchase.installments).map((amountCents, index) => ({ number: index + 1, amountCents, referenceMonth: monthKey(addMonths(origin, index)) }));
}

export function invoiceDates(card: Pick<Card, "closingDay" | "dueDay" | "paymentDay">, referenceMonth: string) {
  const base = monthDate(referenceMonth);
  const closingDate = new Date(base.getFullYear(), base.getMonth(), Math.min(card.closingDay, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()));
  const dueMonth = card.dueDay <= card.closingDay ? addMonths(base, 1) : base;
  const dueDate = new Date(dueMonth.getFullYear(), dueMonth.getMonth(), Math.min(card.dueDay, new Date(dueMonth.getFullYear(), dueMonth.getMonth() + 1, 0).getDate()));
  const paymentDay = card.paymentDay || card.dueDay;
  const paymentDate = new Date(dueMonth.getFullYear(), dueMonth.getMonth(), Math.min(paymentDay, new Date(dueMonth.getFullYear(), dueMonth.getMonth() + 1, 0).getDate()));
  return { closingDate, dueDate, paymentDate };
}
