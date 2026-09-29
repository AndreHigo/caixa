import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sessionUser } from "@/lib/auth";
import { addMonths, monthDate, monthKey, monthRange, toCents } from "@/lib/money";
import { installmentsFor, invoiceDates } from "@/lib/finance";

async function userOrThrow() {
  const user = await sessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

async function rebuildInvoices(cardId: string) {
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) return;

  const rows = await prisma.cardInstallment.findMany({ where: { purchase: { cardId } } });
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    grouped.set(row.referenceMonth, [...(grouped.get(row.referenceMonth) || []), row]);
  }

  const months = [...grouped.keys()];
  await prisma.cardInvoice.deleteMany({
    where: {
      cardId,
      ...(months.length ? { referenceMonth: { notIn: months } } : {}),
    },
  });

  for (const [referenceMonth, installments] of grouped) {
    const dates = invoiceDates(card, referenceMonth);
    const totalCents = installments.reduce((sum, row) => sum + row.amountCents, 0);
    const invoice = await prisma.cardInvoice.upsert({
      where: { cardId_referenceMonth: { cardId, referenceMonth } },
      update: {
        totalCents,
        closingDate: dates.closingDate,
        dueDate: dates.dueDate,
      },
      create: {
        cardId,
        referenceMonth,
        totalCents,
        closingDate: dates.closingDate,
        dueDate: dates.dueDate,
      },
    });
    await prisma.cardInstallment.updateMany({
      where: { id: { in: installments.map(row => row.id) } },
      data: { invoiceId: invoice.id },
    });
  }
}

function loanRow(
  loan: {
    id: string;
    name: string;
    installmentCents: number;
    totalInstallments: number;
    paidInstallments: number;
    dueDay: number;
    startDate: Date;
    status: string;
    lastPaidAt: Date | null;
  },
  referenceMonth: string,
) {
  const start = monthDate(monthKey(new Date(loan.startDate)));
  const target = monthDate(referenceMonth);
  const occurrence =
    (target.getFullYear() - start.getFullYear()) * 12 +
    target.getMonth() -
    start.getMonth() +
    1;

  if (
    occurrence < 1 ||
    occurrence > loan.totalInstallments ||
    loan.status !== "ACTIVE"
  ) {
    return null;
  }

  const paid = occurrence <= loan.paidInstallments;
  const dueDate = new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(loan.dueDay, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()),
  );

  return {
    id: `loan-${loan.id}-${referenceMonth}`,
    loanId: loan.id,
    kind: "loan" as const,
    description: loan.name,
    category: "Empréstimo",
    amountCents: loan.installmentCents,
    dueDate,
    status: paid ? "PAID" : dueDate < new Date() ? "OVERDUE" : "PENDING",
    occurrence,
    totalInstallments: loan.totalInstallments,
    paidInstallments: loan.paidInstallments,
    lastPaidAt: loan.lastPaidAt,
    color: "#f6c177",
  };
}

function recurringDueDate(firstDueDate: Date, referenceMonth: string) {
  const target = monthDate(referenceMonth);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(firstDueDate.getDate(), lastDay),
    12,
  );
}

async function ensureRecurringOccurrence(userId: string, referenceMonth: string) {
  const recurring = await prisma.recurringExpense.findMany({
    where: { userId, status: "ACTIVE" },
  });

  await Promise.all(
    recurring
      .filter(item => monthKey(new Date(item.firstDueDate)) <= referenceMonth)
      .map(item =>
        prisma.recurringExpenseOccurrence.upsert({
          where: {
            recurringId_referenceMonth: {
              recurringId: item.id,
              referenceMonth,
            },
          },
          update: {
            dueDate: recurringDueDate(new Date(item.firstDueDate), referenceMonth),
          },
          create: {
            recurringId: item.id,
            referenceMonth,
            dueDate: recurringDueDate(new Date(item.firstDueDate), referenceMonth),
          },
        }),
      ),
  );

}

async function seedCategories(userId: string) {
  const count = await prisma.category.count({ where: { userId } });
  if (count > 0) return;
  await prisma.category.createMany({
    data: [
      ["Mercado", "#8de0b8", "basket"],
      ["Casa", "#f6c177", "home"],
      ["Saúde", "#f58f8f", "heart"],
      ["Transporte", "#82b4ff", "car"],
      ["Lazer", "#c4a7e7", "spark"],
      ["Assinaturas", "#f2a6d3", "repeat"],
    ].map(([name, color, icon]) => ({ userId, name, color, icon })),
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await userOrThrow();
    await seedCategories(user.id);

    const selectedMonth =
      request.nextUrl.searchParams.get("month") || monthKey(new Date());
    const range = monthRange(selectedMonth);
    const start = monthDate(selectedMonth);
    const end = addMonths(start, 1);
    await ensureRecurringOccurrence(user.id, selectedMonth);

    const [
      rawCards,
      loans,
      expenses,
      categories,
      installments,
      historyInstallments,
      allExpenses,
      recurringExpenses,
      recurringOccurrences,
      allCardInstallments,
    ] = await Promise.all([
      prisma.card.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.loan.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.expense.findMany({
        where: { userId: user.id, dueDate: { gte: start, lt: end } },
        include: { category: true },
        orderBy: { dueDate: "asc" },
      }),
      prisma.category.findMany({
        where: { userId: user.id },
        orderBy: { name: "asc" },
      }),
      prisma.cardInstallment.findMany({
        where: {
          purchase: { card: { userId: user.id } },
          referenceMonth: selectedMonth,
        },
        include: {
          purchase: { include: { card: true, category: true } },
          invoice: true,
        },
        orderBy: { id: "asc" },
      }),
      prisma.cardInstallment.findMany({
        where: {
          purchase: { card: { userId: user.id } },
          referenceMonth: { in: range },
        },
      }),
      prisma.expense.findMany({
        where: { userId: user.id },
        include: { category: true },
      }),
      prisma.recurringExpense.findMany({
        where: { userId: user.id },
        include: { category: true },
        orderBy: { name: "asc" },
      }),
      prisma.recurringExpenseOccurrence.findMany({
        where: { recurring: { userId: user.id, status: "ACTIVE" }, referenceMonth: selectedMonth },
        include: { recurring: { include: { category: true } } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.cardInstallment.findMany({
        where: {
          purchase: { card: { userId: user.id } },
          status: { not: "PAID" },
        },
        include: { purchase: { select: { cardId: true } } },
      }),
    ]);

    const invoices = await prisma.cardInvoice.findMany({
      where: {
        card: { userId: user.id },
        referenceMonth: selectedMonth,
      },
      include: { card: true },
    });

    const cards = rawCards.map(card => {
      const cardUsedCents = allCardInstallments
        .filter(row => row.purchase.cardId === card.id)
        .reduce((sum, row) => sum + row.amountCents, 0);
      return {
        ...card,
        usedCents: cardUsedCents,
        availableCents: Math.max(0, card.limitCents - cardUsedCents),
      };
    });

    const loanRows = loans
      .map(loan => loanRow(loan, selectedMonth))
      .filter((row): row is NonNullable<ReturnType<typeof loanRow>> => Boolean(row));

    const invoiceStatus = (invoice: { status: string; dueDate: Date }) =>
      invoice.status === "PAID"
        ? "PAID"
        : invoice.dueDate < new Date()
          ? "OVERDUE"
          : invoice.status;

    const visibleInvoices = invoices.map(invoice => ({
      ...invoice,
      status: invoiceStatus(invoice),
    }));

    const cardRows = visibleInvoices.map(invoice => ({
      id: `card-${invoice.id}`,
      kind: "card" as const,
      cardId: invoice.cardId,
      invoiceId: invoice.id,
      description: invoice.card.name,
      category: "Fatura de cartão",
      amountCents: invoice.totalCents,
      dueDate: invoice.dueDate,
      status: invoice.status,
      color: invoice.card.color,
      paidAt: invoice.paidAt,
    }));

    const expenseRows = expenses.map(expense => ({
      id: `expense-${expense.id}`,
      kind: expense.type === "INCOME" ? ("income" as const) : ("expense" as const),
      expenseId: expense.id,
      description: expense.name,
      category: expense.type === "INCOME" ? "Entrada" : expense.category?.name || "Avulso",
      amountCents: expense.amountCents,
      dueDate: expense.dueDate,
      status: expense.status,
      color: expense.type === "INCOME" ? "#8de0b8" : expense.category?.color || "#9fb1c6",
      paidAt: expense.paidAt,
    }));

    const recurringRows = recurringOccurrences.map(occurrence => ({
      id: `recurring-${occurrence.id}`,
      kind: occurrence.recurring.type === "INCOME" ? ("income" as const) : ("expense" as const),
      recurringId: occurrence.recurringId,
      recurringOccurrenceId: occurrence.id,
      recurring: true,
      description: occurrence.recurring.name,
      category: occurrence.recurring.type === "INCOME" ? "Entrada fixa" : occurrence.recurring.category?.name || "Fixo mensal",
      amountCents: occurrence.recurring.amountCents,
      dueDate: occurrence.dueDate,
      status: occurrence.status,
      color: occurrence.recurring.type === "INCOME" ? "#8de0b8" : occurrence.recurring.category?.color || "#9fb1c6",
      paidAt: occurrence.paidAt,
    }));

    const financingRows = loans
      .filter(loan => monthKey(new Date(loan.startDate)) === selectedMonth)
      .map(loan => ({
        id: `financing-${loan.id}`,
        kind: "financing" as const,
        loanId: loan.id,
        description: `${loan.name} · valor recebido`,
        category: "Empréstimo recebido",
        amountCents: loan.principalCents,
        dueDate: loan.startDate,
        status: "RECEIVED",
        color: "#f6c177",
      }));

    const dayValue = (value: Date | string) => {
      const date = new Date(value);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    };
    const kindPriority = (kind: string) =>
      kind === "financing" ? 0 : kind === "income" ? 1 : 2;
    const rows = [...cardRows, ...loanRows, ...expenseRows, ...recurringRows, ...financingRows].sort(
      (a, b) => dayValue(a.dueDate) - dayValue(b.dueDate) || kindPriority(a.kind) - kindPriority(b.kind),
    );

    const categoryTotals = new Map<string, number>();
    installments.forEach(row => {
      const name = row.purchase.category?.name || "Sem categoria";
      categoryTotals.set(name, (categoryTotals.get(name) || 0) + row.amountCents);
    });
    expenses
      .filter(row => row.type !== "INCOME")
      .forEach(row => {
        const name = row.category?.name || "Sem categoria";
        categoryTotals.set(name, (categoryTotals.get(name) || 0) + row.amountCents);
      });
    recurringRows
      .filter(row => row.kind !== "income")
      .forEach(row => {
        categoryTotals.set(row.category, (categoryTotals.get(row.category) || 0) + row.amountCents);
      });

    const history = range.map(month => ({
      month,
      totalCents:
        allExpenses
          .filter(
            expense =>
              expense.type !== "INCOME" &&
              monthKey(new Date(expense.dueDate)) === month,
          )
          .reduce((sum, expense) => sum + expense.amountCents, 0) +
        recurringExpenses
          .filter(
            expense =>
              expense.type !== "INCOME" &&
              expense.status === "ACTIVE" &&
              monthKey(new Date(expense.firstDueDate)) <= month,
          )
          .reduce((sum, expense) => sum + expense.amountCents, 0) +
        loans
          .map(loan => loanRow(loan, month))
          .filter(Boolean)
          .reduce((sum, row) => sum + (row?.amountCents || 0), 0) +
        historyInstallments
          .filter(row => row.referenceMonth === month)
          .reduce((sum, row) => sum + row.amountCents, 0),
    }));

    const openingBalanceCents = 0;
    let balanceCents = openingBalanceCents;
    const timeline = rows.map(row => {
      const incoming = row.kind === "income" || row.kind === "financing";
      const restricted = incoming && row.kind === "income" && /vale|aliment/i.test(row.description);
      const balanceBeforeCents = balanceCents;
      const changeCents = restricted ? 0 : incoming ? row.amountCents : -row.amountCents;
      balanceCents += changeCents;
      return {
        date: row.dueDate,
        title: row.description,
        subtitle:
          row.kind === "card"
            ? "Vencimento da fatura"
            : row.kind === "loan"
              ? `Parcela ${row.occurrence}/${row.totalInstallments}`
              : row.kind === "income"
                ? "Entrada prevista"
                : row.kind === "financing"
                  ? "Crédito recebido"
                  : "Gasto avulso",
        amountCents: row.amountCents,
        status: row.status,
        kind: row.kind,
        direction: incoming ? "INCOME" : "EXPENSE",
        restricted,
        balanceBeforeCents,
        changeCents,
        balanceAfterCents: balanceCents,
      };
    });

    const payableRows = rows.filter(
      row => row.kind !== "income" && row.kind !== "financing",
    );
    const incomeRows = rows.filter(row => row.kind === "income");
    const restrictedIncomeCents = incomeRows
      .filter(row => /vale|aliment/i.test(row.description))
      .reduce((sum, row) => sum + row.amountCents, 0);
    const incomeCents = incomeRows.reduce((sum, row) => sum + row.amountCents, 0);
    const financingCents = financingRows.reduce(
      (sum, row) => sum + row.amountCents,
      0,
    );
    const totalCents = payableRows.reduce((sum, row) => sum + row.amountCents, 0);
    const cashIncomeCents = incomeCents - restrictedIncomeCents + financingCents;
    const pendingCents = payableRows
      .filter(
        row =>
          row.status === "PENDING" ||
          row.status === "OPEN" ||
          row.status === "CLOSED",
      )
      .reduce((sum, row) => sum + row.amountCents, 0);
    const overdueCents = payableRows
      .filter(row => row.status === "OVERDUE")
      .reduce((sum, row) => sum + row.amountCents, 0);

    return NextResponse.json({
      selectedMonth,
      cards,
      loans,
      expenses,
      recurringExpenses,
      recurringOccurrences,
      categories,
      rows,
      invoices: visibleInvoices,
      installments,
      timeline,
      openingBalanceCents,
      categoryTotals: Object.fromEntries(categoryTotals),
      history,
      totals: {
        totalCents,
        incomeCents,
        cashIncomeCents,
        financingCents,
        restrictedIncomeCents,
        projectedBalanceCents: incomeCents + financingCents - totalCents,
        projectedCashBalanceCents: cashIncomeCents - totalCents,
        paidCents: payableRows
          .filter(row => row.status === "PAID")
          .reduce((sum, row) => sum + row.amountCents, 0),
        pendingCents,
        overdueCents,
        openCents: pendingCents + overdueCents,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar dados" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await userOrThrow();
    const body = await request.json();

    if (body.resource === "card") {
      return NextResponse.json(
        await prisma.card.create({
          data: {
            userId: user.id,
            name: body.name,
            brand: body.brand || "Visa",
            limitCents: toCents(body.limit),
            closingDay: Number(body.closingDay),
            dueDay: Number(body.dueDay),
            color: body.color || "#8de0b8",
            icon: body.icon || "card",
            description: body.description || null,
          },
        }),
      );
    }

    if (body.resource === "category") {
      return NextResponse.json(
        await prisma.category.create({
          data: {
            userId: user.id,
            name: body.name,
            color: body.color || "#8de0b8",
            icon: body.icon || "tag",
          },
        }),
      );
    }

    if (body.resource === "expense") {
      const status = body.status || "PENDING";
      if (body.recurrence === "MONTHLY") {
        const firstDueDate = new Date(`${body.dueDate}T12:00:00`);
        const recurring = await prisma.recurringExpense.create({
          data: {
            userId: user.id,
            name: body.name,
            categoryId: body.categoryId || null,
            amountCents: toCents(body.amount),
            firstDueDate,
            status: "ACTIVE",
            type: body.type || "OTHER",
            notes: body.notes || null,
            occurrences: {
              create: {
                referenceMonth: monthKey(firstDueDate),
                dueDate: firstDueDate,
                status,
                paidAt: status === "PAID" ? new Date() : null,
              },
            },
          },
          include: { occurrences: true },
        });
        return NextResponse.json(recurring);
      }
      return NextResponse.json(
        await prisma.expense.create({
          data: {
            userId: user.id,
            name: body.name,
            categoryId: body.categoryId || null,
            amountCents: toCents(body.amount),
            dueDate: new Date(`${body.dueDate}T12:00:00`),
            status,
            paidAt: status === "PAID" ? new Date() : null,
            type: body.type || "OTHER",
            notes: body.notes || null,
          },
        }),
      );
    }

    if (body.resource === "loan") {
      return NextResponse.json(
        await prisma.loan.create({
          data: {
            userId: user.id,
            name: body.name,
            principalCents: toCents(body.principal),
            totalInstallments: Number(body.totalInstallments),
            installmentCents: toCents(body.installment),
            dueDay: Number(body.dueDay),
            startDate: new Date(`${body.startDate}T12:00:00`),
            interestRate: body.interestRate ? Number(body.interestRate) : null,
            notes: body.notes || null,
          },
        }),
      );
    }

    if (body.resource === "purchase") {
      const card = await prisma.card.findFirst({
        where: { id: body.cardId, userId: user.id },
      });
      if (!card) throw new Error("Cartão não encontrado");

      const purchaseDate = new Date(`${body.purchaseDate}T12:00:00`);
      const totalCents = toCents(body.total);
      const installments = Math.max(1, Number(body.installments));
      const purchase = await prisma.cardPurchase.create({
        data: {
          cardId: card.id,
          categoryId: body.categoryId || null,
          description: body.description,
          purchaseDate,
          totalCents,
          installments,
          note: body.note || null,
          rows: {
            create: installmentsFor(card, {
              purchaseDate,
              totalCents,
              installments,
            }),
          },
        },
        include: { rows: true },
      });
      await rebuildInvoices(card.id);
      return NextResponse.json(purchase);
    }

    if (body.resource === "payInvoice") {
      const invoice = await prisma.cardInvoice.findFirst({
        where: { id: body.invoiceId, card: { userId: user.id } },
      });
      if (!invoice) throw new Error("Fatura não encontrada");
      const paid = Boolean(body.paid);
      const result = await prisma.$transaction([
        prisma.cardInvoice.update({
          where: { id: invoice.id },
          data: { status: paid ? "PAID" : "OPEN", paidAt: paid ? new Date() : null },
        }),
        prisma.cardInstallment.updateMany({
          where: { invoiceId: invoice.id },
          data: { status: paid ? "PAID" : "PENDING" },
        }),
      ]);
      return NextResponse.json(result[0]);
    }

    throw new Error("Recurso inválido");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar" },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await userOrThrow();
    const body = await request.json();

    if (body.resource === "card") {
      const result = await prisma.card.updateMany({
        where: { id: body.id, userId: user.id },
        data: {
          name: body.name,
          brand: body.brand,
          limitCents: toCents(body.limit),
          closingDay: Number(body.closingDay),
          dueDay: Number(body.dueDay),
          color: body.color,
          description: body.description || null,
          status: body.status || "ACTIVE",
        },
      });
      await rebuildInvoices(body.id);
      return NextResponse.json(result);
    }

    if (body.resource === "loan") {
      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.principal !== undefined) data.principalCents = toCents(body.principal);
      if (body.totalInstallments !== undefined) {
        data.totalInstallments = Number(body.totalInstallments);
      }
      if (body.installment !== undefined) {
        data.installmentCents = toCents(body.installment);
      }
      if (body.dueDay !== undefined) data.dueDay = Number(body.dueDay);
      if (body.startDate !== undefined) {
        data.startDate = new Date(`${body.startDate}T12:00:00`);
      }
      if (body.interestRate !== undefined) {
        data.interestRate = body.interestRate ? Number(body.interestRate) : null;
      }
      if (body.notes !== undefined) data.notes = body.notes || null;
      if (body.paidInstallments !== undefined) {
        data.paidInstallments = Number(body.paidInstallments);
        data.lastPaidAt = Number(body.paidInstallments) > 0 ? new Date() : null;
      }
      if (body.status !== undefined) data.status = body.status;
      return NextResponse.json(
        await prisma.loan.updateMany({
          where: { id: body.id, userId: user.id },
          data,
        }),
      );
    }

    if (body.resource === "expense") {
      const status = body.status;
      return NextResponse.json(
        await prisma.expense.updateMany({
          where: { id: body.id, userId: user.id },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.categoryId !== undefined ? { categoryId: body.categoryId || null } : {}),
            ...(body.amount !== undefined ? { amountCents: toCents(body.amount) } : {}),
            ...(body.dueDate !== undefined
              ? { dueDate: new Date(`${body.dueDate}T12:00:00`) }
              : {}),
            ...(body.type !== undefined ? { type: body.type } : {}),
            ...(status !== undefined ? { status, paidAt: status === "PAID" ? new Date() : null } : {}),
          },
        }),
      );
    }

    if (body.resource === "recurringOccurrence") {
      const status = body.status || "PENDING";
      return NextResponse.json(
        await prisma.recurringExpenseOccurrence.updateMany({
          where: { id: body.id, recurring: { userId: user.id } },
          data: { status, paidAt: status === "PAID" ? new Date() : null },
        }),
      );
    }

    if (body.resource === "recurring") {
      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.categoryId !== undefined) data.categoryId = body.categoryId || null;
      if (body.amount !== undefined) data.amountCents = toCents(body.amount);
      if (body.dueDate !== undefined) data.firstDueDate = new Date(`${body.dueDate}T12:00:00`);
      if (body.type !== undefined) data.type = body.type;
      if (body.status !== undefined) data.status = body.status;
      if (body.notes !== undefined) data.notes = body.notes || null;
      const updated = await prisma.recurringExpense.updateMany({
        where: { id: body.id, userId: user.id },
        data,
      });
      if (!updated.count) throw new Error("Lançamento fixo não encontrado");

      if (body.dueDate !== undefined) {
        const recurring = await prisma.recurringExpense.findUnique({
          where: { id: body.id },
          select: { firstDueDate: true },
        });
        if (recurring) {
          const occurrences = await prisma.recurringExpenseOccurrence.findMany({
            where: { recurringId: body.id },
            select: { id: true, referenceMonth: true },
          });
          await prisma.$transaction(
            occurrences.map(occurrence =>
              prisma.recurringExpenseOccurrence.update({
                where: { id: occurrence.id },
                data: {
                  dueDate: recurringDueDate(
                    new Date(recurring.firstDueDate),
                    occurrence.referenceMonth,
                  ),
                },
              }),
            ),
          );
        }
      }

      return NextResponse.json(updated);
    }

    if (body.resource === "category") {
      return NextResponse.json(
        await prisma.category.updateMany({
          where: { id: body.id, userId: user.id },
          data: {
            name: body.name,
            color: body.color,
            icon: body.icon,
          },
        }),
      );
    }

    if (body.resource === "purchase") {
      const current = await prisma.cardPurchase.findFirst({
        where: { id: body.id, card: { userId: user.id } },
        include: { card: true },
      });
      if (!current) throw new Error("Compra não encontrada");

      const card = body.cardId
        ? await prisma.card.findFirst({ where: { id: body.cardId, userId: user.id } })
        : current.card;
      if (!card) throw new Error("Cartão não encontrado");

      const purchaseDate = new Date(`${body.purchaseDate}T12:00:00`);
      const totalCents = toCents(body.total);
      const installments = Math.max(1, Number(body.installments));
      await prisma.$transaction(async tx => {
        await tx.cardInstallment.deleteMany({ where: { purchaseId: current.id } });
        await tx.cardPurchase.update({
          where: { id: current.id },
          data: {
            cardId: card.id,
            categoryId: body.categoryId || null,
            description: body.description,
            purchaseDate,
            totalCents,
            installments,
            note: body.note || null,
            rows: {
              create: installmentsFor(card, {
                purchaseDate,
                totalCents,
                installments,
              }),
            },
          },
        });
      });
      await rebuildInvoices(current.cardId);
      if (card.id !== current.cardId) await rebuildInvoices(card.id);
      return NextResponse.json({ ok: true });
    }

    throw new Error("Recurso inválido");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await userOrThrow();
    const body = await request.json();

    if (body.resource === "card") {
      return NextResponse.json(
        await prisma.card.updateMany({
          where: { id: body.id, userId: user.id },
          data: { status: "INACTIVE" },
        }),
      );
    }

    if (body.resource === "loan") {
      return NextResponse.json(
        await prisma.loan.updateMany({
          where: { id: body.id, userId: user.id },
          data: { status: "INACTIVE" },
        }),
      );
    }

    if (body.resource === "purchase") {
      const purchase = await prisma.cardPurchase.findFirst({
        where: { id: body.id, card: { userId: user.id } },
      });
      if (!purchase) throw new Error("Compra não encontrada");
      const result = await prisma.cardPurchase.delete({ where: { id: purchase.id } });
      await rebuildInvoices(purchase.cardId);
      return NextResponse.json(result);
    }

    if (body.resource === "expense") {
      return NextResponse.json(
        await prisma.expense.deleteMany({
          where: { id: body.id, userId: user.id },
        }),
      );
    }

    if (body.resource === "recurring") {
      return NextResponse.json(
        await prisma.recurringExpense.updateMany({
          where: { id: body.id, userId: user.id },
          data: { status: "INACTIVE" },
        }),
      );
    }

    if (body.resource === "category") {
      return NextResponse.json(
        await prisma.category.deleteMany({
          where: { id: body.id, userId: user.id },
        }),
      );
    }

    throw new Error("Recurso inválido");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao remover" },
      { status: 400 },
    );
  }
}
