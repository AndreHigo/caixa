import type { BankConnection } from "@prisma/client";
import { prisma } from "./prisma";
import { BankError, assertItemOwner, bankCents, bankCurrency, bankDate, bankId, normalizeTransaction } from "./bank-domain";
import { bankSandbox, pageList, pluggy, transactionList } from "./pluggy";

export async function connectBank(userId: string, itemId: string) {
  const item = await pluggy(`/items/${bankId(itemId)}`);
  assertItemOwner(item, userId, bankSandbox());
  if (!Number.isInteger(item.connector.id)) throw new BankError("Instituição inválida.", 502);
  const previous = await prisma.bankConnection.findFirst({ where: { OR: [{ itemId }, { userId, connectorId: item.connector.id }] } });
  if (previous && (previous.userId !== userId || (previous.itemId !== itemId && previous.enabled))) throw new BankError("Esta instituição já está conectada. Use Renovar autorização na conexão existente.", 409);
  const fields = { institution: String(item.connector.name).slice(0, 120), status: String(item.status), sandbox: Boolean(item.connector.isSandbox), enabled: true, syncError: null };
  const connection = await prisma.bankConnection.upsert({ where: { userId_connectorId: { userId, connectorId: item.connector.id } }, update: { ...fields, itemId }, create: { userId, itemId, connectorId: item.connector.id, ...fields } });
  await syncBank(connection);
  return connection.id;
}

type Snapshot = { account: Record<string, any>; transactions: Record<string, any>[]; bills: Record<string, any>[] };

// Separado do transporte para testar a persistência sem chamar contas bancárias reais.
export async function persistBankSnapshot(connection: BankConnection, item: Record<string, any>, snapshots: Snapshot[]) {
  assertItemOwner(item, connection.userId, bankSandbox());
  const now = new Date();
  const prepared = snapshots.map(({ account, transactions, bills }) => {
    if (!['BANK', 'CREDIT'].includes(account.type)) throw new BankError("Tipo de conta não suportado.", 502);
    if (transactions.length > 20000) throw new BankError("Extrato muito grande. Contate o suporte.", 502);
    return {
      externalId: bankId(account.id),
      data: {
        name: String(account.name || "Conta").slice(0, 120), type: account.type as string, subtype: String(account.subtype || "").slice(0, 60),
        currency: bankCurrency(account.currencyCode), numberLast4: account.number ? String(account.number).slice(-4) : null,
        balanceCents: account.balance == null ? null : bankCents(account.balance),
        limitCents: account.creditData?.creditLimit == null ? null : bankCents(account.creditData.creditLimit),
        availableLimitCents: account.creditData?.availableCreditLimit == null ? null : bankCents(account.creditData.availableCreditLimit),
        closingDate: account.creditData?.balanceCloseDate ? bankDate(account.creditData.balanceCloseDate) : null,
        dueDate: account.creditData?.balanceDueDate ? bankDate(account.creditData.balanceDueDate) : null,
        active: true, lastSyncedAt: now,
      },
      transactions: transactions.map(tx => normalizeTransaction({ ...tx, accountCurrencyCode: account.currencyCode }, account.type)),
      bills: bills.map(bill => ({ externalId: bankId(bill.id), dueDate: bankDate(bill.dueDate), closingDate: bill.billClosingDate ? bankDate(bill.billClosingDate) : null, totalCents: bankCents(bill.totalAmount), currency: bankCurrency(bill.totalAmountCurrencyCode) })),
    };
  });
  await prisma.$transaction(async db => {
    const current = await db.bankConnection.findUniqueOrThrow({ where: { id: connection.id } });
    if (!current.enabled || current.itemId !== connection.itemId) throw new BankError("A conexão mudou durante a sincronização. Atualize novamente.", 409);
    for (const snapshot of prepared) {
      const existing = await db.bankAccount.findUnique({ where: { externalId: snapshot.externalId } });
      if (existing && existing.connectionId !== connection.id) throw new BankError("Conta vinculada a outro usuário.", 403);
      const account = await db.bankAccount.upsert({ where: { externalId: snapshot.externalId }, update: snapshot.data, create: { externalId: snapshot.externalId, connectionId: connection.id, ...snapshot.data } });
      for (const tx of snapshot.transactions) {
        const old = await db.bankTransaction.findUnique({ where: { accountId_stableKey: { accountId: account.id, stableKey: tx.stableKey } } });
        const changed = old && (old.amountCents !== tx.amountCents || old.direction !== tx.direction || old.currency !== tx.currency || old.date.getTime() !== tx.date.getTime());
        await db.bankTransaction.upsert({
          where: { accountId_stableKey: { accountId: account.id, stableKey: tx.stableKey } },
          update: { ...tx, lastSeenAt: now, ...(changed && old?.linkedId ? { reviewStatus: "CHANGED" } : {}) },
          create: { userId: connection.userId, accountId: account.id, ...tx, lastSeenAt: now },
        });
      }
      for (const bill of snapshot.bills) await db.bankBill.upsert({ where: { accountId_externalId: { accountId: account.id, externalId: bill.externalId } }, update: bill, create: { accountId: account.id, ...bill } });
    }
    await db.bankAccount.updateMany({ where: { connectionId: connection.id, externalId: { notIn: prepared.map(row => row.externalId) } }, data: { active: false } });
    await db.bankConnection.update({ where: { id: connection.id }, data: { status: String(item.status), lastSyncedAt: now, providerUpdatedAt: item.lastUpdatedAt ? bankDate(item.lastUpdatedAt) : null, consentExpiresAt: item.consentExpiresAt ? bankDate(item.consentExpiresAt) : null, syncError: null } });
  }, { timeout: 60000 });
}

export async function syncBank(connection: BankConnection, requestRefresh = false) {
  if (!connection.enabled) throw new BankError("Conexão desconectada. Conecte novamente para atualizar.");
  const lease = new Date();
  const acquired = await prisma.bankConnection.updateMany({ where: { id: connection.id, enabled: true, OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: new Date(Date.now() - 10 * 60000) } }] }, data: { syncStartedAt: lease } });
  if (!acquired.count) return { updating: true };
  try {
    if (requestRefresh) {
      const fresh = await prisma.bankConnection.findUniqueOrThrow({ where: { id: connection.id } });
      if (fresh.refreshRequestedAt && Date.now() - fresh.refreshRequestedAt.getTime() < 60000) throw new BankError("Aguarde um minuto entre atualizações.", 429);
      await prisma.bankConnection.update({ where: { id: connection.id }, data: { refreshRequestedAt: lease } });
      await pluggy(`/items/${connection.itemId}`, "PATCH", {});
    }
    const item = await pluggy(`/items/${connection.itemId}`);
    assertItemOwner(item, connection.userId, bankSandbox());
    if (item.status !== "UPDATED" || (item.executionStatus && item.executionStatus !== "SUCCESS")) {
      await prisma.bankConnection.update({ where: { id: connection.id }, data: { status: String(item.status), syncError: item.status === "UPDATING" ? null : "O banco precisa de uma nova autorização ou ainda não terminou a coleta." } });
      return { updating: item.status === "UPDATING" };
    }
    const accounts = await pageList(`/accounts?itemId=${connection.itemId}`);
    const snapshots: Snapshot[] = [];
    for (const account of accounts.filter(row => ['BANK', 'CREDIT'].includes(row.type))) {
      const id = bankId(account.id);
      const [transactions, bills] = await Promise.all([transactionList(id), account.type === "CREDIT" ? pageList(`/bills?accountId=${id}`) : Promise.resolve([])]);
      snapshots.push({ account, transactions, bills });
    }
    await persistBankSnapshot(connection, item, snapshots);
    return { updating: false };
  } catch (error) {
    await prisma.bankConnection.update({ where: { id: connection.id }, data: { syncError: error instanceof BankError ? error.message : "Falha ao sincronizar. Os dados anteriores foram preservados." } });
    throw error;
  } finally {
    await prisma.bankConnection.updateMany({ where: { id: connection.id, syncStartedAt: lease }, data: { syncStartedAt: null } });
  }
}
