require('./load-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const domain = require('../src/lib/bank-domain.ts');
const { sameOrigin } = require('../src/lib/origin.ts');
const raw = (id = 'tx-a', changes = {}) => ({ id, description: 'Supermercado', date: '2026-10-03T12:00:00Z', amount: -100.01, status: 'POSTED', ...changes });

test('converte reais para centavos e recusa valores inválidos', () => {
  assert.equal(domain.bankCents(999.99), 99999);
  assert.equal(domain.bankCents(-954), -95400);
  for (const value of [NaN, Infinity, '100', undefined, 999999999]) assert.throws(() => domain.bankCents(value));
});
test('conta corrente e cartão têm sinais distintos, e DEBIT/CREDIT prevalece', () => {
  assert.equal(domain.normalizeTransaction(raw(), 'BANK').direction, 'EXPENSE');
  assert.equal(domain.normalizeTransaction(raw('t', { amount: 100 }), 'BANK').direction, 'INCOME');
  assert.equal(domain.normalizeTransaction(raw('t', { amount: 100 }), 'CREDIT').direction, 'EXPENSE');
  assert.equal(domain.normalizeTransaction(raw(), 'CREDIT').direction, 'INCOME');
  assert.equal(domain.normalizeTransaction(raw('t', { amount: 100, type: 'DEBIT' }), 'BANK').direction, 'EXPENSE');
});
test('reimportação usa identificador do banco; duas compras iguais não são apagadas', () => {
  assert.equal(domain.normalizeTransaction(raw('a', { providerId: 'same' }), 'BANK').stableKey, domain.normalizeTransaction(raw('b', { providerId: 'same' }), 'BANK').stableKey);
  assert.notEqual(domain.normalizeTransaction(raw('a'), 'BANK').stableKey, domain.normalizeTransaction(raw('b'), 'BANK').stableKey);
});
test('cursor não permite trocar host, endpoint ou conta', () => {
  assert.equal(domain.nextTransactionPath('?accountId=acc&after=opaque', 'acc'), '/v2/transactions?accountId=acc&after=opaque');
  assert.equal(domain.nextTransactionPath('?accountId=acc&after=ab+c==', 'acc'), '/v2/transactions?accountId=acc&after=ab+c==');
  for (const cursor of ['https://evil.test?accountId=acc', '/items/foo', '?accountId=other&after=x', '?after=x', '?accountId=acc&accountId=other', '?accountId=acc#fragment']) assert.throws(() => domain.nextTransactionPath(cursor, 'acc'));
});
test('conexão exige dono correto, Open Finance e sandbox explicitamente autorizado', () => {
  const item = { clientUserId: 'u1', connector: { isOpenFinance: true, isSandbox: false } };
  domain.assertItemOwner(item, 'u1', false);
  assert.throws(() => domain.assertItemOwner(item, 'u2', false));
  assert.throws(() => domain.assertItemOwner({ ...item, connector: { isOpenFinance: false } }, 'u1', false));
  assert.throws(() => domain.assertItemOwner({ ...item, connector: { isOpenFinance: true, isSandbox: true } }, 'u1', false));
});
test('webhook sem segredo forte falha fechado', () => {
  const secret = 'a'.repeat(48);
  assert.equal(domain.secretMatches(secret, secret), true);
  for (const [actual, expected] of [[null, secret], [secret, undefined], ['short', 'short'], ['b'.repeat(48), secret]]) assert.equal(domain.secretMatches(actual, expected), false);
});
test('origem local compara Host externo, não endereço interno do Next; sites alheios são recusados', () => {
  assert.equal(sameOrigin(new Headers({ host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173', 'sec-fetch-site': 'same-origin' }), 'http://localhost:4173'), true);
  for (const origin of ['http://localhost:4173', 'https://evil.test', 'null', 'http://127.0.0.1:4173/path']) assert.equal(sameOrigin(new Headers({ host: '127.0.0.1:4173', origin }), 'http://localhost:4173'), false);
  assert.equal(sameOrigin(new Headers({ host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173', 'sec-fetch-site': 'cross-site' }), 'http://localhost:4173'), false);
});
test('moeda original é preservada; valor convertido usa moeda da conta', () => {
  assert.equal(domain.normalizeTransaction(raw('t', { currencyCode: 'USD' }), 'BANK').currency, 'USD');
  assert.equal(domain.normalizeTransaction(raw('t', { currencyCode: 'USD', amountInAccountCurrency: 500, accountCurrencyCode: 'BRL' }), 'BANK').currency, 'BRL');
  assert.throws(() => domain.bankCurrency('<script>'));
});

test('transporte: paginação v2, cache de autenticação e loop são validados sem rede real', async () => {
  const originalFetch = global.fetch;
  const oldId = process.env.PLUGGY_CLIENT_ID; const oldSecret = process.env.PLUGGY_CLIENT_SECRET;
  process.env.PLUGGY_CLIENT_ID = 'TEST-ONLY'; process.env.PLUGGY_CLIENT_SECRET = 'TEST-ONLY';
  let authCount = 0; const called = [];
  let scenario = 'pages';
  global.fetch = async (url, options) => {
    assert.ok(String(url).startsWith('https://api.pluggy.ai/'), 'Transporte só chama o host fixo.');
    const path = String(url).slice('https://api.pluggy.ai'.length);
    called.push(path);
    if (path === '/auth') { authCount++; return Response.json({ apiKey: 'TEST-ONLY-KEY' }); }
    assert.equal(options.headers['X-API-KEY'], 'TEST-ONLY-KEY');
    if (scenario === 'loop') return Response.json({ results: [], next: '?accountId=acc&after=loop' });
    if (path.includes('after=')) return Response.json({ results: [raw('page-two')], next: null });
    return Response.json({ results: [raw('page-one')], next: '?accountId=acc&after=ab+c==' });
  };
  try {
    const { transactionList, pluggy } = require('../src/lib/pluggy.ts');
    const records = await transactionList('acc');
    assert.equal(records.length, 2); assert.equal(authCount, 1);
    assert.ok(called.includes('/v2/transactions?accountId=acc&after=ab+c=='));
    scenario = 'loop'; await assert.rejects(transactionList('acc'), /repetiu/);
    await assert.rejects(pluggy('//evil.test/resource'));
  } finally {
    global.fetch = originalFetch;
    if (oldId === undefined) delete process.env.PLUGGY_CLIENT_ID; else process.env.PLUGGY_CLIENT_ID = oldId;
    if (oldSecret === undefined) delete process.env.PLUGGY_CLIENT_SECRET; else process.env.PLUGGY_CLIENT_SECRET = oldSecret;
  }
});

test('PostgreSQL: sincronização e conciliação sem tocar nos dados da casa', { skip: process.env.BANK_TEST_DB !== '1' }, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '5434' && url.pathname === '/meu_caixa', 'Este teste só pode escrever no banco local validado.');
  const { prisma } = require('../src/lib/prisma.ts');
  const { persistBankSnapshot } = require('../src/lib/bank-sync.ts');
  const { reviewBankMovement, bankCandidates } = require('../src/lib/bank-review.ts');
  const { rebuildInvoices } = require('../src/lib/invoices.ts');
  const counts = async () => ({ users: await prisma.user.count(), expenses: await prisma.expense.count(), purchases: await prisma.cardPurchase.count(), loans: await prisma.loan.count(), recurring: await prisma.recurringExpense.count(), installments: await prisma.cardInstallment.count() });
  const before = await counts();
  const tag = randomUUID();
  const user = await prisma.user.create({ data: { email: `qa-bank-${tag}@local.test`, name: 'TESTE AUTOMATIZADO', password: 'TEST-ONLY-NOT-A-REAL-ACCOUNT' } });
  const other = await prisma.user.create({ data: { email: `qa-bank-other-${tag}@local.test`, name: 'TESTE ISOLAMENTO', password: 'TEST-ONLY' } });
  try {
    const connection = await prisma.bankConnection.create({ data: { userId: user.id, connectorId: 999999, itemId: `qa-${tag}`, institution: 'TESTE AUTOMATIZADO' } });
    const item = { status: 'UPDATED', executionStatus: 'SUCCESS', clientUserId: user.id, connector: { isOpenFinance: true, isSandbox: false }, lastUpdatedAt: '2026-10-03T12:00:00Z' };
    const snapshot = [{ account: { id: `qa-account-${tag}`, name: 'CONTA TESTE', type: 'BANK', balance: 1000, currencyCode: 'BRL' }, transactions: [raw('tx-a', { providerId: 'bank-a' }), raw('tx-b', { providerId: 'bank-b' })], bills: [] }];
    await t.test('mesmo extrato duas vezes continua com dois movimentos, sem despesas automáticas', async () => {
      await persistBankSnapshot(connection, item, snapshot); await persistBankSnapshot(connection, item, snapshot);
      assert.equal(await prisma.bankTransaction.count({ where: { userId: user.id } }), 2);
      assert.equal(await prisma.expense.count({ where: { userId: user.id } }), 0);
    });
    const movement = await prisma.bankTransaction.findFirstOrThrow({ where: { userId: user.id, externalId: 'tx-a' } });
    const expense = await prisma.expense.create({ data: { userId: user.id, name: 'GASTO TESTE', dueDate: movement.date, amountCents: 10001 } });
    await t.test('usuário alheio não pode dar baixa', async () => {
      await assert.rejects(reviewBankMovement(other.id, { transactionId: movement.id, mode: 'link', kind: 'expense', targetId: expense.id }));
      assert.equal((await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })).status, 'PENDING');
    });
    await t.test('vincular não duplica e repetir confirmação é recusado', async () => {
      assert.ok((await bankCandidates(user.id, movement.id)).some(row => row.id === expense.id));
      await reviewBankMovement(user.id, { transactionId: movement.id, mode: 'link', kind: 'expense', targetId: expense.id });
      assert.equal(await prisma.expense.count({ where: { userId: user.id } }), 1);
      assert.equal((await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })).status, 'PAID');
      await assert.rejects(reviewBankMovement(user.id, { transactionId: movement.id, mode: 'create' }));
    });
    await t.test('movimento diferente não pode apontar para a mesma conta já conciliada', async () => {
      const second = await prisma.bankTransaction.findFirstOrThrow({ where: { userId: user.id, externalId: 'tx-b' } });
      await assert.rejects(reviewBankMovement(user.id, { transactionId: second.id, mode: 'link', kind: 'expense', targetId: expense.id }));
      assert.equal((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: second.id } })).reviewStatus, 'NEW');
    });
    await t.test('correção do banco volta para revisão sem alterar despesa já confirmada', async () => {
      snapshot[0].transactions[0] = raw('new-tx-id', { providerId: 'bank-a', amount: -150 });
      await persistBankSnapshot(connection, item, snapshot);
      const changed = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: movement.id } });
      assert.equal(changed.reviewStatus, 'CHANGED'); assert.equal(changed.amountCents, 15000);
      assert.equal((await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })).amountCents, 10001);
      assert.equal(await prisma.bankTransaction.count({ where: { userId: user.id } }), 2);
      await assert.rejects(reviewBankMovement(user.id, { transactionId: movement.id, mode: 'create' }));
      await reviewBankMovement(user.id, { transactionId: movement.id, mode: 'acknowledge' });
    });
    await t.test('snapshot inválido preserva saldo e todo o extrato anterior', async () => {
      await assert.rejects(persistBankSnapshot(connection, item, [{ ...snapshot[0], account: { ...snapshot[0].account, balance: 9999 }, transactions: [raw('invalid', { amount: NaN })] }]));
      assert.equal((await prisma.bankAccount.findUniqueOrThrow({ where: { externalId: snapshot[0].account.id } })).balanceCents, 100000);
    });
    const card = await prisma.card.create({ data: { userId: user.id, name: 'CARTÃO TESTE', brand: 'TESTE', limitCents: 400000, closingDay: 1, dueDay: 8 } });
    const creditSnapshot = [{ account: { id: `qa-credit-${tag}`, name: 'CARTÃO TESTE', type: 'CREDIT', balance: 120, currencyCode: 'BRL' }, transactions: [raw('tx-card', { amount: 65, creditCardMetadata: { installmentNumber: 1, totalInstallments: 2 } })], bills: [{ id: 'bill-test', dueDate: '2026-10-08', totalAmount: 65 }] }];
    await persistBankSnapshot(connection, item, [...snapshot, ...creditSnapshot]);
    const creditTx = await prisma.bankTransaction.findFirstOrThrow({ where: { userId: user.id, externalId: 'tx-card' } });
    await t.test('compra importada entra apenas na fatura, sem falsa projeção das próximas parcelas', async () => {
      await reviewBankMovement(user.id, { transactionId: creditTx.id, mode: 'create', cardId: card.id, referenceMonth: '2026-10' });
      const invoice = await prisma.cardInvoice.findUniqueOrThrow({ where: { cardId_referenceMonth: { cardId: card.id, referenceMonth: '2026-10' } } });
      assert.equal(invoice.totalCents, 6500); assert.equal(invoice.status, 'OPEN');
      assert.equal(await prisma.cardInstallment.count({ where: { purchase: { cardId: card.id } } }), 1);
      assert.equal(await prisma.cardInvoice.count({ where: { cardId: card.id, referenceMonth: '2026-11' } }), 0);
      assert.equal(await prisma.expense.count({ where: { userId: user.id } }), 1);
    });
    await t.test('pagamento da fatura dá baixa em todas as parcelas sem duplicar despesa', async () => {
      await persistBankSnapshot(connection, item, [...snapshot, { ...snapshot[0], transactions: [raw('payment', { amount: -65 })] }, ...creditSnapshot]);
      const payment = await prisma.bankTransaction.findFirstOrThrow({ where: { userId: user.id, externalId: 'payment' } });
      const invoice = await prisma.cardInvoice.findUniqueOrThrow({ where: { cardId_referenceMonth: { cardId: card.id, referenceMonth: '2026-10' } } });
      await reviewBankMovement(user.id, { transactionId: payment.id, mode: 'link', kind: 'invoice', targetId: invoice.id });
      assert.equal((await prisma.cardInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, 'PAID');
      assert.equal(await prisma.cardInstallment.count({ where: { invoiceId: invoice.id, status: 'PAID' } }), 1);
      await rebuildInvoices(card.id);
      assert.equal((await prisma.cardInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status, 'PAID');
      assert.equal(await prisma.expense.count({ where: { userId: user.id } }), 1);
    });
    await t.test('nova entrada conta uma vez e pendente do banco não permite baixa', async () => {
      await persistBankSnapshot(connection, item, [...snapshot, { ...snapshot[0], transactions: [raw('salary', { amount: 3300 }), raw('pending', { status: 'PENDING' })] }]);
      const salary = await prisma.bankTransaction.findFirstOrThrow({ where: { userId: user.id, externalId: 'salary' } });
      await reviewBankMovement(user.id, { transactionId: salary.id, mode: 'create' });
      const entry = await prisma.expense.findFirstOrThrow({ where: { userId: user.id, type: 'INCOME' } });
      assert.equal(entry.amountCents, 330000); assert.equal(entry.status, 'PAID');
      const pending = await prisma.bankTransaction.findFirstOrThrow({ where: { userId: user.id, externalId: 'pending' } });
      await assert.rejects(reviewBankMovement(user.id, { transactionId: pending.id, mode: 'create' }));
      await reviewBankMovement(user.id, { transactionId: pending.id, mode: 'ignore' });
    });
  } finally {
    // Somente os IDs dos dois usuários criados neste teste; nunca dados preexistentes.
    await prisma.user.delete({ where: { id: user.id } }); await prisma.user.delete({ where: { id: other.id } });
    assert.deepEqual(await counts(), before, 'Contagens da casa devem ser preservadas após o teste.');
    await prisma.$disconnect();
  }
});
