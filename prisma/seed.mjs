import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const money = value => Math.round(Number(value) * 100);
const date = value => new Date(`${value}T12:00:00`);
const key = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
const addMonth = (value, amount) => new Date(value.getFullYear(), value.getMonth() + amount, 1, 12);
const split = (total, count) => {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => index === count - 1 ? total - base * (count - 1) : base);
};

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "local@meu-caixa.test" },
    update: {},
    create: { email: "local@meu-caixa.test", password: "local", name: "Usuário local" },
  });

  await prisma.recurringExpenseOccurrence.deleteMany({ where: { recurring: { userId: user.id } } });
  await prisma.recurringExpense.deleteMany({ where: { userId: user.id } });
  await prisma.cardInstallment.deleteMany({ where: { purchase: { card: { userId: user.id } } } });
  await prisma.cardInvoice.deleteMany({ where: { card: { userId: user.id } } });
  await prisma.cardPurchase.deleteMany({ where: { card: { userId: user.id } } });
  await prisma.expense.deleteMany({ where: { userId: user.id } });
  await prisma.loan.deleteMany({ where: { userId: user.id } });
  await prisma.card.deleteMany({ where: { userId: user.id } });
  await prisma.category.deleteMany({ where: { userId: user.id } });

  const categories = {};
  for (const [name, color, icon] of [
    ["Casa", "#f6c177", "home"],
    ["Mercado", "#8de0b8", "basket"],
    ["Transporte", "#82b4ff", "car"],
    ["Saúde", "#f58f8f", "heart"],
    ["Lazer", "#c4a7e7", "spark"],
    ["Assinaturas", "#f2a6d3", "repeat"],
  ]) {
    categories[name] = await prisma.category.create({ data: { userId: user.id, name, color, icon } });
  }

  const card = await prisma.card.create({
    data: {
      userId: user.id,
      name: "Cartão principal",
      brand: "Mastercard",
      limitCents: money(2500),
      closingDay: 5,
      dueDay: 12,
      color: "#b58cff",
      icon: "card",
      description: "Cartão de demonstração",
    },
  });

  async function purchase({ description, purchaseDate, total, installments = 1, categoryId }) {
    const when = date(purchaseDate);
    const origin = new Date(when);
    if (when.getDate() > card.closingDay) origin.setMonth(origin.getMonth() + 1);
    const totalCents = money(total);
    const created = await prisma.cardPurchase.create({
      data: { cardId: card.id, categoryId, description, purchaseDate: when, totalCents, installments },
    });

    for (const [index, amountCents] of split(totalCents, installments).entries()) {
      const referenceMonth = key(addMonth(origin, index));
      const base = new Date(`${referenceMonth}-01T12:00:00`);
      const closingDate = new Date(base.getFullYear(), base.getMonth(), card.closingDay, 12);
      const dueDate = new Date(base.getFullYear(), base.getMonth(), card.dueDay, 12);
      const invoice = await prisma.cardInvoice.upsert({
        where: { cardId_referenceMonth: { cardId: card.id, referenceMonth } },
        update: { totalCents: { increment: amountCents } },
        create: { cardId: card.id, referenceMonth, closingDate, dueDate, totalCents: amountCents, status: "OPEN" },
      });
      await prisma.cardInstallment.create({
        data: { purchaseId: created.id, invoiceId: invoice.id, referenceMonth, number: index + 1, amountCents, status: "PENDING" },
      });
    }
  }

  await purchase({ description: "Compras do mercado", purchaseDate: "2026-09-03", total: 248.70, categoryId: categories.Mercado.id });
  await purchase({ description: "Fone de ouvido", purchaseDate: "2026-09-08", total: 180, installments: 3, categoryId: categories.Lazer.id });

  const recurring = [
    ["Salário principal", 4200, "2026-10-05", "INCOME", null],
    ["Aluguel", 1200, "2026-10-01", "OTHER", categories.Casa.id],
    ["Internet residencial", 100, "2026-10-10", "OTHER", categories.Assinaturas.id],
  ];
  for (const [name, amount, dueDate, type, categoryId] of recurring) {
    const firstDueDate = date(dueDate);
    const template = await prisma.recurringExpense.create({
      data: { userId: user.id, name, amountCents: money(amount), firstDueDate, type, categoryId, status: "ACTIVE" },
    });
    await prisma.recurringExpenseOccurrence.create({
      data: { recurringId: template.id, referenceMonth: key(firstDueDate), dueDate: firstDueDate, status: "PENDING" },
    });
  }

  await prisma.expense.createMany({
    data: [
      ["Energia", 180, "2026-10-16", categories.Casa.id],
      ["Combustível", 220, "2026-10-20", categories.Transporte.id],
      ["Consulta", 90, "2026-10-22", categories.Saúde.id],
    ].map(([name, amount, dueDate, categoryId]) => ({
      userId: user.id,
      name,
      amountCents: money(amount),
      dueDate: date(dueDate),
      type: "OTHER",
      status: "PENDING",
      categoryId,
    })),
  });

  await prisma.loan.create({
    data: {
      userId: user.id,
      name: "Empréstimo de demonstração",
      principalCents: money(1800),
      totalInstallments: 6,
      installmentCents: money(330),
      dueDay: 25,
      startDate: date("2026-10-25"),
      status: "ACTIVE",
    },
  });

  console.log("Seed demonstrativo criado com cartão, contas fixas, gastos avulsos e empréstimo.");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
