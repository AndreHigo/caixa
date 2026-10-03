import { prisma } from "./prisma";
import { BankError, bankId, bankMonth } from "./bank-domain";
import { rebuildInvoices } from "./invoices";
import { monthKey } from "./money";

export async function bankCandidates(userId: string, transactionId: string) {
  const movement = await prisma.bankTransaction.findFirst({ where: { id: bankId(transactionId), userId }, include: { account: true } });
  if (!movement) throw new BankError("Movimentação não encontrada.", 404);
  const start = new Date(movement.date); start.setDate(start.getDate() - 45);
  const end = new Date(movement.date); end.setDate(end.getDate() + 45);
  const income = movement.direction === "INCOME";
  const amount = movement.amountCents;
  const [expenses, recurring, invoices, installments, loans, used] = await Promise.all([
    prisma.expense.findMany({ where: { userId, amountCents: amount, type: income ? "INCOME" : { not: "INCOME" }, dueDate: { gte: start, lte: end } } }),
    prisma.recurringExpenseOccurrence.findMany({ where: { recurring: { userId, amountCents: amount, type: income ? "INCOME" : { not: "INCOME" } }, dueDate: { gte: start, lte: end } }, include: { recurring: true } }),
    !income && movement.account.type === "BANK" ? prisma.cardInvoice.findMany({ where: { card: { userId }, totalCents: amount, dueDate: { gte: start, lte: end } }, include: { card: true } }) : [],
    !income && movement.account.type === "CREDIT" ? prisma.cardInstallment.findMany({ where: { purchase: { card: { userId } }, amountCents: amount, referenceMonth: { gte: monthKey(start), lte: monthKey(end) } }, include: { purchase: { include: { card: true } } } }) : [],
    movement.account.type === "BANK" ? prisma.loan.findMany({ where: { userId, ...(income ? { principalCents: amount } : { installmentCents: amount, status: "ACTIVE" }) } }) : [],
    prisma.bankTransaction.findMany({ where: { userId, linkedId: { not: null } }, select: { linkedKind: true, linkedId: true } }),
  ]);
  const options = [
    ...expenses.map(row => ({ kind: "expense", id: row.id, name: row.name, date: row.dueDate, paid: row.status === "PAID" })),
    ...recurring.map(row => ({ kind: "recurring", id: row.id, name: row.recurring.name, date: row.dueDate, paid: row.status === "PAID" })),
    ...invoices.map(row => ({ kind: "invoice", id: row.id, name: `Fatura ${row.card.name} · ${row.referenceMonth}`, date: row.dueDate, paid: row.status === "PAID" })),
    ...installments.map(row => ({ kind: "installment", id: row.id, name: `${row.purchase.description} · ${row.purchase.card.name} · ${row.referenceMonth}`, date: row.purchase.purchaseDate, paid: row.status === "PAID" })),
    ...loans.flatMap(row => {
      if (income) return [{ kind: "loan-receipt", id: row.id, name: `Dinheiro recebido: ${row.name}`, date: row.receivedDate || row.startDate, paid: true }];
      if (row.paidInstallments >= row.totalInstallments) return [];
      const due = new Date(row.startDate); due.setMonth(due.getMonth() + row.paidInstallments);
      return due >= start && due <= end ? [{ kind: "loan", id: `${row.id}:${row.paidInstallments + 1}`, name: `${row.name} · parcela ${row.paidInstallments + 1}/${row.totalInstallments}`, date: due, paid: false }] : [];
    }),
  ];
  return options.filter(option => !used.some(link => link.linkedKind === option.kind && link.linkedId === option.id));
}

export async function reviewBankMovement(userId: string, body: Record<string, any>) {
  const id = bankId(body.transactionId);
  return prisma.$transaction(async db => {
    // A primeira escrita obtém lock na linha; duas confirmações não criam duas despesas.
    const claimed = await db.bankTransaction.updateMany({ where: { id, userId, reviewStatus: { in: ["NEW", "CHANGED"] } }, data: { reviewStatus: "REVIEWING" } });
    if (!claimed.count) throw new BankError("Esta movimentação já foi conferida. Atualize a lista.", 409);
    const movement = await db.bankTransaction.findUniqueOrThrow({ where: { id }, include: { account: { include: { connection: true } } } });
    if (body.mode === "ignore") {
      if (movement.linkedId) throw new BankError("Um vínculo existente não pode ser ignorado. Confira o lançamento e mantenha o vínculo.");
      return db.bankTransaction.update({ where: { id }, data: { reviewStatus: "IGNORED", reviewedAt: new Date() } });
    }
    if (body.mode === "acknowledge" && movement.linkedId) return db.bankTransaction.update({ where: { id }, data: { reviewStatus: "LINKED", reviewedAt: new Date() } });
    if (movement.linkedId) throw new BankError("Este movimento já tem um lançamento. Edite-o em Lançamentos ou Cartões, depois confirme a conferência.");
    if (movement.account.connection.sandbox) throw new BankError("Dados de teste não podem entrar no seu orçamento real.");
    if (movement.currency !== "BRL" || movement.account.currency !== "BRL") throw new BankError("A conciliação suporta apenas reais (BRL).");
    if (movement.amountCents <= 0) throw new BankError("Movimentos de valor zero podem ser ignorados, mas não geram lançamentos.");
    if (movement.status !== "POSTED") throw new BankError("Espere o banco confirmar a movimentação antes de dar baixa.");
    const income = movement.direction === "INCOME";
    let linkedKind: string; let linkedId: string;
    if (body.mode === "create") {
      const categoryId = body.categoryId ? bankId(body.categoryId) : null;
      if (categoryId && !await db.category.findFirst({ where: { id: categoryId, userId } })) throw new BankError("Categoria não encontrada.", 404);
      if (movement.account.type === "CREDIT") {
        if (income) throw new BankError("Pagamentos e estornos do cartão não são renda. Vincule o pagamento pela conta corrente ou ignore este registro.");
        const card = await db.card.findFirst({ where: { id: bankId(body.cardId), userId, status: "ACTIVE" } });
        if (!card) throw new BankError("Escolha um cartão cadastrado.");
        const referenceMonth = bankMonth(body.referenceMonth);
        const purchase = await db.cardPurchase.create({ data: { cardId: card.id, categoryId, description: movement.description, purchaseDate: movement.date, totalCents: movement.amountCents, installments: 1, note: `Importado do banco. ${movement.installmentNumber ? `Parcela bancária ${movement.installmentNumber}/${movement.totalInstallments || "?"}. ` : ""}Demais parcelas serão importadas nas próximas sincronizações.`, rows: { create: { number: 1, amountCents: movement.amountCents, referenceMonth } } } });
        await rebuildInvoices(card.id, db);
        const installment = await db.cardInstallment.findUniqueOrThrow({ where: { purchaseId_number: { purchaseId: purchase.id, number: 1 } } });
        linkedKind = "installment"; linkedId = installment.id;
      } else {
        const expense = await db.expense.create({ data: { userId, categoryId, name: movement.description, amountCents: movement.amountCents, dueDate: movement.date, paymentDate: movement.date, paidAt: movement.date, status: "PAID", type: income ? "INCOME" : "OTHER", notes: "Importado e conferido em Bancos." } });
        linkedKind = "expense"; linkedId = expense.id;
      }
    } else if (body.mode === "link") {
      linkedKind = String(body.kind); linkedId = String(body.targetId);
      const equal = (amount: number, targetIncome: boolean) => { if (amount !== movement.amountCents || targetIncome !== income) throw new BankError("O valor ou o tipo não bate com o lançamento. Corrija o lançamento antes de vincular."); };
      if (movement.account.type === "CREDIT" && linkedKind !== "installment") throw new BankError("Compras do cartão devem ser vinculadas a compras, não a contas gerais.");
      if (movement.account.type === "BANK" && linkedKind === "installment") throw new BankError("Vincule o pagamento da conta corrente à fatura inteira.");
      if (linkedKind === "expense") {
        const target = await db.expense.findFirst({ where: { id: bankId(linkedId), userId } });
        if (!target) throw new BankError("Lançamento não encontrado.", 404);
        equal(target.amountCents, target.type === "INCOME");
        await db.expense.update({ where: { id: target.id }, data: { status: "PAID", paidAt: movement.date, paymentDate: movement.date } });
      } else if (linkedKind === "recurring") {
        const target = await db.recurringExpenseOccurrence.findFirst({ where: { id: bankId(linkedId), recurring: { userId } }, include: { recurring: true } });
        if (!target) throw new BankError("Conta fixa não encontrada.", 404);
        equal(target.recurring.amountCents, target.recurring.type === "INCOME");
        await db.recurringExpenseOccurrence.update({ where: { id: target.id }, data: { status: "PAID", paidAt: movement.date, paymentDate: movement.date } });
      } else if (linkedKind === "invoice") {
        const target = await db.cardInvoice.findFirst({ where: { id: bankId(linkedId), card: { userId } } });
        if (!target) throw new BankError("Fatura não encontrada.", 404);
        equal(target.totalCents, false);
        await db.cardInvoice.update({ where: { id: target.id }, data: { status: "PAID", paidAt: movement.date, paymentDate: movement.date } });
        await db.cardInstallment.updateMany({ where: { invoiceId: target.id }, data: { status: "PAID" } });
      } else if (linkedKind === "installment") {
        const target = await db.cardInstallment.findFirst({ where: { id: bankId(linkedId), purchase: { card: { userId } } } });
        if (!target) throw new BankError("Compra não encontrada.", 404);
        equal(target.amountCents, false); // uma compra confirmada não significa fatura paga
      } else if (linkedKind === "loan" || linkedKind === "loan-receipt") {
        const [loanId, installment] = linkedId.split(":");
        const target = await db.loan.findFirst({ where: { id: bankId(loanId), userId } });
        if (!target) throw new BankError("Empréstimo não encontrado.", 404);
        equal(linkedKind === "loan" ? target.installmentCents : target.principalCents, linkedKind === "loan-receipt");
        if (linkedKind === "loan") {
          const number = Number(installment);
          if (number !== target.paidInstallments + 1 || number > target.totalInstallments) throw new BankError("Vincule a próxima parcela pendente do empréstimo.");
          await db.loan.update({ where: { id: target.id }, data: { paidInstallments: number, lastPaidAt: movement.date, status: number === target.totalInstallments ? "PAID" : "ACTIVE" } });
        } else await db.loan.update({ where: { id: target.id }, data: { receivedDate: movement.date } });
      } else throw new BankError("Tipo de vínculo inválido.");
    } else throw new BankError("Ação de conferência inválida.");
    const duplicate = await db.bankTransaction.findFirst({ where: { userId, linkedKind, linkedId, id: { not: id } } });
    if (duplicate) throw new BankError("Esse lançamento já foi vinculado a outro movimento bancário.", 409);
    return db.bankTransaction.update({ where: { id }, data: { reviewStatus: "LINKED", linkedKind, linkedId, reviewedAt: new Date() } });
  }, { timeout: 20000 });
}
