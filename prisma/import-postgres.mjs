import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const input = process.env.MEU_CAIXA_EXPORT_PATH || path.resolve("prisma/legacy-export.json");
const dateFields = {
  User: ["createdAt"],
  Card: ["createdAt", "updatedAt"],
  CardPurchase: ["purchaseDate", "createdAt"],
  CardInvoice: ["closingDate", "dueDate", "paymentDate", "paidAt"],
  Loan: ["startDate", "receivedDate", "lastPaidAt", "createdAt"],
  Expense: ["dueDate", "paymentDate", "paidAt", "createdAt"],
  RecurringExpense: ["firstDueDate", "createdAt", "updatedAt"],
  RecurringExpenseOccurrence: ["dueDate", "paymentDate", "paidAt"],
};

function prepare(table, rows) {
  return rows.map(row => {
    const value = { ...row };
    for (const field of dateFields[table] || []) {
      if (value[field]) value[field] = new Date(value[field]);
    }
    return value;
  });
}

async function main() {
  const snapshot = JSON.parse(await fs.readFile(input, "utf8"));
  const tables = snapshot.tables || {};
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    throw new Error("O PostgreSQL já contém dados. Não importei para evitar duplicação.");
  }

  await prisma.$transaction(async tx => {
    await tx.user.createMany({ data: prepare("User", tables.User || []) });
    await tx.category.createMany({ data: prepare("Category", tables.Category || []) });
    await tx.card.createMany({ data: prepare("Card", tables.Card || []) });
    await tx.loan.createMany({ data: prepare("Loan", tables.Loan || []) });
    await tx.expense.createMany({ data: prepare("Expense", tables.Expense || []) });
    await tx.recurringExpense.createMany({ data: prepare("RecurringExpense", tables.RecurringExpense || []) });
    await tx.cardPurchase.createMany({ data: prepare("CardPurchase", tables.CardPurchase || []) });
    await tx.cardInvoice.createMany({ data: prepare("CardInvoice", tables.CardInvoice || []) });
    await tx.cardInstallment.createMany({ data: prepare("CardInstallment", tables.CardInstallment || []) });
    await tx.recurringExpenseOccurrence.createMany({ data: prepare("RecurringExpenseOccurrence", tables.RecurringExpenseOccurrence || []) });
  });

  console.log("Importação PostgreSQL concluída.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
