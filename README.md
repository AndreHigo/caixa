# Meu Caixa

Aplicação de controle financeiro com Next.js, Prisma e PostgreSQL.

## Rodar localmente

```powershell
npm install
npm run db:generate
npx prisma migrate deploy
npm run dev -- --hostname 127.0.0.1 --port 4173
```

Abra [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Publicar em VPS com Docker

O app e o PostgreSQL podem rodar no mesmo Compose. Siga o [guia de implantação Docker](docs/DEPLOY-DOCKER.md). O PostgreSQL não fica exposto na internet; o app fica ligado ao proxy HTTPS da VPS.

## Estrutura

- `src/app`: páginas, layout, estilos e rotas da API.
- `src/components`: interface principal do controle financeiro.
- `src/stores`: estado client-side com Zustand.
- `src/lib`: autenticação, Prisma, dinheiro e regras financeiras.
- `prisma/schema.prisma`: modelo do banco PostgreSQL.
- `prisma/seed.mjs`: dados iniciais do cenário demonstrativo.
- `prisma/import-postgres.mjs`: importa o snapshot do banco local antigo.

## Como cadastrar contas fixas

Na tela **Lançamentos**, use `+ Novo lançamento` e escolha `Fixo todos os meses` em **Repetição**. A conta ou entrada será criada para os meses seguintes, mas cada mês terá sua própria confirmação de pagamento/recebimento.

Use `Somente neste mês` para gastos avulsos. Cartões e empréstimos continuam com seus próprios cálculos de parcelas.

## Conectar conta bancária

Abra **Bancos** para conectar por Open Finance e conferir extrato, saldo e faturas. Requer chaves da Pluggy no servidor e consentimento do usuário no banco; sem configuração, a tela informa a pendência e não mostra saldo fictício.

Movimentos importados não entram diretamente no orçamento: vincule a uma conta já cadastrada, adicione um lançamento novo ou ignore transferências/estornos. Compras do cartão entram somente no total da fatura nos gastos gerais.

Veja o [guia de configuração, segurança e limites](docs/INTEGRACAO-BANCARIA.md) e o [inventário de testes](docs/QA-BANCOS.md). Execute `npm run test:banks` para os testes sem conta bancária real.

## Comandos úteis

```powershell
npm run build
npx prisma migrate deploy
npm run db:seed
```

O arquivo `.env` é local e não deve ser commitado. Configure nele a `DATABASE_URL` do seu PostgreSQL (Neon, Supabase ou outro provedor). Para publicar, também configure `JWT_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

## Migrar os dados locais antigos

O banco SQLite local foi exportado para `prisma/legacy-export.json` apenas neste computador; esse arquivo é ignorado pelo Git por conter dados financeiros. Depois de configurar um PostgreSQL vazio no `.env`, execute:

```powershell
npm run db:generate
npm run db:migrate
npm run db:import
```

O importador interrompe se o PostgreSQL já tiver usuários, evitando duplicar ou sobrescrever dados.
