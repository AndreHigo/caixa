# Meu Caixa

Aplicação local de controle financeiro com Next.js, Prisma e SQLite.

## Rodar localmente

```powershell
npm install
npm run db:generate
npm run dev -- -p 4173
```

Abra [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Estrutura

- `src/app`: páginas, layout, estilos e rotas da API.
- `src/components`: interface principal do controle financeiro.
- `src/stores`: estado client-side com Zustand.
- `src/lib`: autenticação, Prisma, dinheiro e regras financeiras.
- `prisma/schema.prisma`: modelo do banco SQLite.
- `prisma/seed.mjs`: dados iniciais do cenário financeiro.
- `prisma/dev.db`: banco local; não deve ser versionado.

## Como cadastrar contas fixas

Na tela **Lançamentos**, use `+ Novo lançamento` e escolha `Fixo todos os meses` em **Repetição**. A conta ou entrada será criada para os meses seguintes, mas cada mês terá sua própria confirmação de pagamento/recebimento.

Use `Somente neste mês` para gastos avulsos. Cartões e empréstimos continuam com seus próprios cálculos de parcelas.

## Comandos úteis

```powershell
npm run build
npm run db:push
npm run db:seed
```

O arquivo `.env` é local e não deve ser commitado.
