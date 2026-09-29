# Meu Caixa

Aplicação de controle financeiro com Next.js, Prisma e PostgreSQL.

## Rodar localmente

```powershell
npm install
npm run db:generate
npx prisma migrate deploy
npm run dev -- -p 4173
```

Abra [http://127.0.0.1:4173](http://127.0.0.1:4173).

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
