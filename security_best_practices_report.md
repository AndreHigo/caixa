# Revisão de segurança — Meu caixa

## Resumo executivo

Foi feita uma revisão do backend Next.js/TypeScript, autenticação, cookies, rotas de alteração e superfície do frontend. Os pontos mais perigosos encontrados durante a revisão foram corrigidos nesta rodada: não havia fluxo de login visível para produção, a senha podia permanecer em texto simples, as mutações não verificavam a origem da requisição e os dados financeiros podiam ser tratados como resposta dinâmica sem uma declaração explícita.

O sistema ainda não deve ser considerado pronto para exposição pública sem uma camada de proxy HTTPS, limite de tentativas de login e rotina de backup do PostgreSQL.

## Correções aplicadas

### SEC-001 — Senha armazenada sem hash

- Severidade: Alta
- Local: `src/lib/auth.ts:15-27` e `src/app/api/auth/login/route.ts:22-29`
- Correção: novas senhas usam `scrypt` com salt aleatório e comparação em tempo constante. Usuários antigos são migrados para hash no próximo login válido.
- Resultado: a senha não precisa permanecer em texto simples no banco.

### SEC-002 — Ausência de login utilizável em produção

- Severidade: Alta
- Local: `src/components/app-shell.tsx`
- Correção: foi incluída uma tela de login que aparece quando a API retorna sessão necessária. A sessão continua em cookie `HttpOnly`, `SameSite=Lax`, `Secure` em produção e expira em sete dias.

### SEC-003 — Rotas de alteração sem verificação de origem

- Severidade: Alta
- Local: `src/app/api/finance/route.ts:10-16, 701, 892, 1139`
- Correção: POST, PATCH e DELETE rejeitam origem externa e requisições marcadas como cross-site. Os recursos continuam validando a propriedade pelo `userId`.

### SEC-004 — Entrada JSON confiada sem validação suficiente

- Severidade: Alta
- Local: `src/app/api/finance/route.ts:17-40, 703-880`
- Correção: campos críticos agora validam texto, valores monetários, datas, dias do mês, identificadores e cores antes de chegar ao Prisma.

### SEC-005 — Cabeçalhos básicos ausentes

- Severidade: Média
- Local: `next.config.mjs`
- Correção: adicionados `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e remoção do cabeçalho `X-Powered-By`.

## Pendências antes da VPS

### SEC-006 — Sem limite de tentativas de login

- Severidade: Média
- Impacto: uma VPS pública pode receber tentativas repetidas contra o único usuário administrativo.
- Próxima ação: rate limit no proxy ou armazenamento de tentativas por IP/e-mail, com atraso progressivo e log de bloqueios.

### SEC-007 — Backup e restauração ainda dependem da operação da VPS

- Severidade: Alta para dados financeiros
- Impacto: perder o volume Docker sem cópia externa pode perder os lançamentos.
- Próxima ação: `pg_dump` diário criptografado para armazenamento externo e teste periódico de restauração.

### SEC-008 — CSP ainda não está definida

- Severidade: Média
- Impacto: existe menos defesa em profundidade contra injeção de script caso um futuro recurso introduza um sink inseguro.
- Próxima ação: configurar CSP com nonce/hash depois de validar os scripts gerados pelo Next em produção.

### SEC-009 — Self-hosting precisa de proxy HTTPS

- Severidade: Alta em publicação pública
- Impacto: expor diretamente o processo Next não fornece a mesma camada de limites, TLS e proteção contra requisições lentas/malformadas.
- Próxima ação: Caddy ou Nginx na frente do container, HTTPS automático, limites de corpo e rate limit.

## Verificações feitas

- `npm run build`: aprovado.
- PostgreSQL Docker: saudável e com dados preservados.
- Navegação Visão geral → Planejamento → novembro: aprovada com dados reais.
- Cronograma: mostra saldo depois de cada movimento e diferencia vale-alimentação do saldo em dinheiro.
- Requisição local da API: HTTP 200; resposta de planejamento com aproximadamente 29 KB.
- Pacote inicial do frontend: aproximadamente 100 KB no build otimizado.
