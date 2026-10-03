// Exclusivo para QA local. Nunca conecta ou simula um banco para o usuário real.
require('./load-ts.cjs');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { prisma } = require('../src/lib/prisma.ts');
const { hashPassword } = require('../src/lib/auth.ts');
const fixturePath = '.qa-bank-fixture.json';
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '5434' || url.pathname !== '/meu_caixa') throw new Error('QA permitido somente no PostgreSQL local validado.');
async function main() {
  if (process.argv.includes('--more')) {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const user = await prisma.user.findFirstOrThrow({ where: { id: fixture.userId, email: fixture.email, name: 'QA BANCOS - DADOS FICTICIOS' } });
    const account = await prisma.bankAccount.findFirstOrThrow({ where: { connection: { userId: user.id }, type: 'BANK' } });
    await prisma.bankTransaction.createMany({ data: Array.from({ length: 52 }, (_, i) => ({ userId: user.id, accountId: account.id, stableKey: `pagination-${i}`, externalId: `pagination-${i}`, date: new Date('2026-10-02T12:00:00Z'), status: i === 0 ? 'PENDING' : 'POSTED', description: i === 0 ? 'COMPRA PENDENTE SOMENTE TESTE — descrição longa para verificar quebra de texto no celular' : `PAGINAÇÃO SOMENTE TESTE ${i}`, amountCents: 1257, direction: 'EXPENSE' })), skipDuplicates: true });
    console.log('52 movimentos fictícios adicionados somente ao usuário QA.');
    return;
  }
  if (process.argv.includes('--clean')) {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const user = await prisma.user.findFirst({ where: { id: fixture.userId, email: fixture.email, name: 'QA BANCOS - DADOS FICTICIOS' } });
    if (!user || !/^qa-ui-bank-[a-f0-9-]+@local\.test$/.test(user.email)) throw new Error('Alvo de limpeza não validado.');
    await prisma.user.delete({ where: { id: user.id } });
    fs.unlinkSync(fixturePath);
    console.log('Somente usuário QA e seus dados fictícios removidos. Dados da casa preservados.');
    return;
  }
  if (fs.existsSync(fixturePath)) throw new Error('Já existe um teste UI. Conclua/limpe o anterior antes de criar outro.');
  const tag = randomUUID();
  const password = 'QA-local-only-2026!';
  const user = await prisma.user.create({ data: { email: `qa-ui-bank-${tag}@local.test`, name: 'QA BANCOS - DADOS FICTICIOS', password: await hashPassword(password) } });
  fs.writeFileSync(fixturePath, JSON.stringify({ userId: user.id, email: user.email, password }));
  const category = await prisma.category.create({ data: { userId: user.id, name: 'Casa' } });
  const card = await prisma.card.create({ data: { userId: user.id, name: 'CARTÃO SOMENTE TESTE', brand: 'TESTE', closingDay: 1, dueDay: 8, limitCents: 400000 } });
  const expense = await prisma.expense.create({ data: { userId: user.id, categoryId: category.id, name: 'Aluguel SOMENTE TESTE', amountCents: 150000, dueDate: new Date('2026-10-01T12:00:00Z') } });
  const connection = await prisma.bankConnection.create({ data: { userId: user.id, itemId: `qa-ui-${tag}`, connectorId: 999998, institution: 'TESTE LOCAL — NÃO É SEU BANCO', status: 'UPDATED', lastSyncedAt: new Date(), providerUpdatedAt: new Date() } });
  const account = await prisma.bankAccount.create({ data: { connectionId: connection.id, externalId: `qa-ui-account-${tag}`, name: 'CONTA COM DADOS FICTÍCIOS', type: 'BANK', subtype: 'CHECKING_ACCOUNT', balanceCents: 100000, currency: 'BRL', numberLast4: '0000' } });
  const credit = await prisma.bankAccount.create({ data: { connectionId: connection.id, externalId: `qa-ui-credit-${tag}`, name: 'CARTÃO COM DADOS FICTÍCIOS', type: 'CREDIT', subtype: 'CREDIT_CARD', balanceCents: 13000, availableLimitCents: 387000, limitCents: 400000, currency: 'BRL' } });
  await prisma.bankBill.create({ data: { accountId: credit.id, externalId: 'qa-ui-bill', dueDate: new Date('2026-10-08T12:00:00Z'), totalCents: 13000, currency: 'BRL' } });
  const movements = [
    { externalId: 'qa-ui-rent', accountId: account.id, description: 'Aluguel SOMENTE TESTE', amountCents: expense.amountCents, direction: 'EXPENSE', suggestedCategory: 'Casa' },
    { externalId: 'qa-ui-market', accountId: account.id, description: 'Supermercado SOMENTE TESTE', amountCents: 10001, direction: 'EXPENSE' },
    { externalId: 'qa-ui-transfer', accountId: account.id, description: 'Transferência entre contas SOMENTE TESTE', amountCents: 20000, direction: 'INCOME' },
    { externalId: 'qa-ui-card-purchase', accountId: credit.id, description: 'Fraldas SOMENTE TESTE', amountCents: 6500, direction: 'EXPENSE', installmentNumber: 1, totalInstallments: 2 },
  ];
  await prisma.bankTransaction.createMany({ data: movements.map(row => ({ userId: user.id, stableKey: row.externalId, date: new Date('2026-10-03T12:00:00Z'), status: 'POSTED', ...row })) });
  console.log(JSON.stringify({ email: user.email, password, cardId: card.id, notice: 'QA isolado. NÃO são dados da casa.' }));
}
main().finally(() => prisma.$disconnect());
