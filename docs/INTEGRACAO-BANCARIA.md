# Conectar bancos ao Meu Caixa

## O que está implementado

Aba **Bancos** com conexão Open Finance pela Pluggy, contas, saldo consultado, extrato mensal paginado e faturas retornadas pelo banco. O saldo consultado é um retrato da conta, não uma nova receita e não o limite do cartão. A data da coleta do banco é exibida separadamente da data em que o app o consultou.

Os movimentos ficam em uma área de conferência e não alteram o orçamento automaticamente. Para cada movimento confirmado pelo banco:

- **Vincular**: confirma uma conta/receita já cadastrada, uma ocorrência fixa, uma fatura, uma compra do cartão ou a próxima parcela do empréstimo. Exige o mesmo valor e o mesmo sentido (entrada/saída).
- **Adicionar**: cria uma despesa paga ou entrada recebida. Uma compra de cartão gera somente a parcela que veio do banco, dentro da fatura escolhida; a despesa geral continua mostrando a fatura inteira.
- **Ignorar**: mantém no extrato sem alterar o orçamento. Use para transferências entre suas contas, estornos, registros duplicados ou o crédito de pagamento que aparece no extrato do próprio cartão.

Vincule o crédito de empréstimo já cadastrado em vez de lançar outra renda. Vincule o débito do pagamento de cartão à fatura; o crédito correspondente no extrato do cartão não é renda. Se a fatura atual foi cadastrada como uma compra agregada de R$ 3.918,92, não adicione também as compras detalhadas que a compõem: ignore-as ou substitua conscientemente o lançamento agregado na tela Cartões antes de importar.

Não há match automático por texto ou aproximação. Não adivinhamos o saldo livre usando o saldo bancário: seu planejamento depende das contas e receitas cadastradas, e das datas programadas.

## Ativar conexão real

1. No [painel da Pluggy](https://dashboard.pluggy.ai), crie/acesse sua conta e confirme quais bancos/produtos Open Finance e atualização automática estão disponíveis no plano. A integração não garante plano gratuito.
2. No `.env` **do servidor**, configure:

```dotenv
PLUGGY_CLIENT_ID="preencher-no-servidor"
PLUGGY_CLIENT_SECRET="preencher-no-servidor"
PLUGGY_SANDBOX="false"
PLUGGY_WEBHOOK_SECRET="segredo-aleatorio-com-pelo-menos-32-caracteres"
BANK_SYNC_SECRET="outro-segredo-aleatorio-com-pelo-menos-32-caracteres"
```

Não use os valores acima como segredos. Gere segredos independentes e fortes com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, e coloque-os no servidor sem publicá-los. Não use prefixo `NEXT_PUBLIC_`. Não envie chaves, senha bancária, CPF ou token MFA por chat.

3. Execute `npm run db:generate` e `npm run db:migrate` com o dev server parado. A migração é aditiva e preserva seus lançamentos. Não rode seed para integrar o banco.
4. Reinicie o app. Abra **Bancos → Conectar banco**. O componente oficial solicita o consentimento e conduz a autorização no banco. O Meu Caixa não recebe nem armazena a senha do banco. São solicitados somente os produtos contas, cartões e transações.
5. Confira data de atualização, saldo e um pequeno conjunto de movimentos antes de fazer a conferência em lote (não existe baixa automática em massa).

## Atualização automática e webhooks

Para receber avisos com o navegador fechado, publique o app em HTTPS e configure um webhook na Pluggy:

- URL: `https://SEU-DOMINIO/api/banks/webhook`.
- Evento: `all` (ou os eventos `item/*` e `transactions/*` usados no código).
- Header customizado: `X-Meu-Caixa-Webhook` com o valor de `PLUGGY_WEBHOOK_SECRET` do servidor.

O endpoint recusa avisos sem o segredo correto e só reconsulta a conexão conhecida. Para `item/created`, resolve o usuário pelo item consultado na API, não pelo identificador enviado no aviso. Eventos repetidos não criam novas despesas. A Pluggy precisa ter a coleta automática habilitada no plano: webhook notifica, não força o banco a entregar dados novos.

Alternativa de recuperação: um agendador externo pode fazer `POST /api/banks/sync` com `Authorization: Bearer <BANK_SYNC_SECRET>`. Processa até duas conexões, priorizando as menos recentemente consultadas. Consulta dados já disponíveis no provedor; não faz PATCH contínuo, não cria consentimento e não movimenta dinheiro. Configure a frequência e o custo de API conforme seu plano. Nenhum agendador público foi criado por este código.

O botão **Atualizar** solicita uma coleta ao banco e consulta os dados. Há intervalo mínimo de um minuto; enquanto o banco está coletando, a tela consulta o resultado por até três minutos. Se não terminar, volte mais tarde. Renovação de consentimento/MFA exige ação do usuário em **Renovar autorização**. Desconectar remove o item no provedor e preserva o histórico local. O usuário também pode revogar o consentimento no próprio banco.

## Segurança e limites

- APIs privadas usam a sessão do app, checagem de origem nas escritas e escopo por usuário. Produção não tem usuário automático; requer login, `JWT_SECRET` forte e HTTPS. Configure `APP_ORIGIN=https://SEU-DOMINIO` atrás do proxy reverso. Sem essa configuração, compara a origem com o Host da requisição, não com o endereço interno do Next.
- Desenvolvimento deve ficar em `127.0.0.1`, pois o app já tinha login local automático; não exponha o servidor de desenvolvimento na rede pública.
- API key e client secret ficam no servidor. O navegador recebe somente o Connect Token temporário e dados sanitizados.
- Não guardamos CPF, dados de destinatários ou número completo da conta. Registros bancários são dados pessoais financeiros: proteja PostgreSQL, backups e logs, defina retenção e acesso antes de uso multiusuário público.
- Extrato usa paginação por cursor v2. Reimportação é idempotente por conta/identificador do banco; sem identificador estável, usa o ID da Pluggy. Reconexões que mudam IDs podem exigir ignorar duplicados manualmente; não fazemos deduplicação aproximada que poderia apagar compras reais iguais.
- Conciliação exige BRL e movimento confirmado. Moeda estrangeira sem conversão não é adicionada ao orçamento.
- Bancos podem atrasar ou não entregar parte dos dados. Se a sincronização falhar, conserva o retrato anterior e mostra o erro. Correções/remoções de movimentos vinculados voltam para conferência sem alterar silenciosamente suas contas.
- Alterações nas compras do app continuam sob responsabilidade do usuário; dados novos do cartão podem reabrir uma fatura se aumentarem seu total. Não importamos `payments` de uma fatura como prova automática de quitação.
- Sandbox é identificado na tela e não pode ser conciliado com o orçamento real. Nenhum banco real está conectado até que as chaves e o consentimento estejam presentes.
- Não há promessa de tempo real absoluto. Esta primeira versão é adequada ao uso pessoal em servidor persistente; extratos enormes e implantação serverless exigem uma fila/worker durável para os jobs longos.

## Verificação

`npm run test:banks` testa normalização, centavos, direção de conta/cartão, identificador estável, cursor e segredo de webhook sem acessar banco real.

Para o teste integrado com usuários temporários **somente no PostgreSQL local de desenvolvimento**, use PowerShell:

```powershell
$env:BANK_TEST_DB = "1"
node --env-file=.env --test tests/bank.test.cjs
Remove-Item Env:BANK_TEST_DB
```

O teste recusa host/porta/banco diferentes do local validado, cria dois usuários de teste com UUIDs, cobre conciliação/isolation/idempotência e remove somente esses usuários ao terminar. Não recebe credenciais da Pluggy nem chama uma instituição financeira.

Fontes: [Autenticação e Connect Token](https://docs.pluggy.ai/pt/docs/get-started/authentication), [Configuração do componente](https://docs.pluggy.ai/en/docs/connect-widget/environments), [Webhooks](https://docs.pluggy.ai/en/docs/developer-tools/webhooks-ref), [Extrato por cursor](https://docs.pluggy.ai/pt/reference/transaction/transactions-list-by-cursor).
