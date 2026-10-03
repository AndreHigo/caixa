# Inventário e validação da integração bancária

## Cobertura prevista

| Comportamento | Teste funcional | Inspeção visual |
| --- | --- | --- |
| Sem chaves, sem saldo inventado | API retorna configured=false, saldo=null; conectar desabilitado | Tela vazia, mensagem e guia de ativação legíveis |
| Saldo bancário separado da renda | Totais de orçamento não incluem snapshot | Faixa do dashboard e identificação de limite de crédito |
| Navegação e filtros | Bancos/dashboard, mês anterior/próximo, para conferir/todos, conta, página | Desktop e tela estreita; sem corte lateral |
| Conciliação de conta existente | Vincular aluguel confirma pagamento sem nova despesa | Modal: sugestão, confirmar, fechar e resultado conferido |
| Novo movimento | Adicionar despesa/compra; escolher categoria/cartão/fatura | Valor, contexto do cartão e feedback de sucesso |
| Ignorar transferência | Extrato conserva registro e orçamento não aumenta | Desaparece de pendentes, aparece em todos como ignorado |
| Fatura paga | Débito da conta vincula à fatura; parcelas pagas em cascata | Fluxo de cartão separado das despesas avulsas |
| Falhas e duplicados | Repetição, usuário alheio, centavos, snapshot inválido, pending, webhooks forjados | Erro de provedor ausente não se apresenta como sucesso |
| Consentimento real | Pendente de chaves/consentimento; NÃO assinado como validado | Componente oficial só carregado após clique com configuração válida |

## Evidências executadas

Validação local concluída em 03/10/2026. Testes usam usuários temporários e dados rotulados TESTE, nunca apresentados como dados bancários reais da casa. Fixture excluída após inspeção.

- PostgreSQL: migração `20261003010000_bank_connections` aplicada. Sem seed ou reimportação dos dados da casa.
- `node --env-file=.env --test tests/bank.test.cjs` com `BANK_TEST_DB=1`: **19 testes passaram**, nenhum falhou. Inclui transporte simulado sem rede real e nove verificações integradas de persistência/conciliação. Contagens de usuários/lançamentos da casa preservadas após os testes.
- `tsc --noEmit` e `npm run build`: passaram. Build gerou as seis rotas bancárias dinâmicas; houve aviso não fatal do cache do webpack, sem erro de compilação.
- HTTP em modo produção: sem sessão, `/api/banks` e `/connect-token` retornam 401; webhook e job sem segredo retornam 403; mês inválido retorna 400; origem externa retorna 403; usuário autenticado sem chaves recebe 503 em vez de conexão fictícia.
- O navegador encontrou e confirmou a correção de um bug de origem: o Next usava localhost internamente e recusava as escritas feitas pelo navegador em 127.0.0.1. A guarda agora compara Host público (ou APP_ORIGIN) e continua bloqueando sites alheios.
- UI real, usuário de QA separado: login, Bancos, vincular aluguel, adicionar despesa, ignorar transferência, adicionar parcela de cartão, verificar resultado em Lançamentos e Cartões. Aluguel ficou uma única linha paga; compra de R$ 65 ficou somente na fatura; transferência não virou renda.
- Paginação inspecionada com 56 movimentos de teste, navegação página 1 → 2 → 1. Filtros por conta/status e mês seguinte/anterior foram exercitados. Cadastro ainda pendente no banco tem botão de confirmação desabilitado; Escape fecha o modal.
- Layout inspecionado em desktop e 390 × 844. Sem overflow horizontal do documento; guia de ativação e modal não cortaram campos/botões. Navegação horizontal mantém a aba selecionada visível. Lista de extrato tem rolagem da página, sem um painel interno disputando o scroll.
- Conectar sem configuração fica desabilitado. Atualizar sem chaves exibiu a falha sem apagar o extrato anterior. Nenhuma senha/chave bancária real foi usada e nenhuma conta externa foi conectada.

Não verificado externamente: widget com Connect Token válido, consentimento/MFA real, cobertura e limites do plano, entrega/latência do banco, coleta automática da Pluggy e webhook em URL pública HTTPS. Não há publicação pública nesta validação.

Exploração: alternar rapidamente mês/filtros, abrir e fechar modal por botão/Escape, tentar atualizar sem chaves e verificar preservação do extrato. Inspeção separada do layout inicial, guia aberto e conferência com dados. Conexão externa, consentimento/MFA, webhook HTTPS público e renovação real permanecem gates externos.
