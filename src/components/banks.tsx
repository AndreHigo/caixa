"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FinanceData } from "@/stores/finance";

type BankData = { config: { configured: boolean; sandbox: boolean; webhookConfigured: boolean }; connections: any[]; transactions: any[]; cashBalanceCents: number | null; pendingCount: number; total: number; hasMore: boolean };
const money = (cents: number, currency = "BRL") => new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
const date = (value: string) => new Date(value).toLocaleDateString("pt-BR");
const time = (value: string) => new Date(value).toLocaleString("pt-BR");
const connectionStatus: Record<string, string> = { UPDATED: "Atualizado", UPDATING: "Buscando dados", LOGIN_ERROR: "Renove a autorização", WAITING_USER_INPUT: "Precisa de autorização", WAITING_USER_ACTION: "Autorize no banco", DISCONNECTED: "Desconectado", OUTDATED: "Desatualizado" };
const reviewStatus: Record<string, string> = { NEW: "Conferir", LINKED: "Conferido", IGNORED: "Ignorado", CHANGED: "Banco corrigiu", REMOVED: "Removido pelo banco" };
let widgetLoading: Promise<void> | undefined;
type Widget = { init: () => Promise<void>; destroy: () => Promise<void> };
declare global { interface Window { PluggyConnect?: new (options: Record<string, unknown>) => Widget } }

function loadWidget() {
  if (window.PluggyConnect) return Promise.resolve();
  if (!widgetLoading) widgetLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.pluggy.ai/pluggy-connect/v2.7.0/pluggy-connect.js";
    script.async = true; script.referrerPolicy = "no-referrer";
    const timer = window.setTimeout(() => { script.remove(); widgetLoading = undefined; reject(new Error("Não foi possível abrir a autorização bancária. Tente novamente.")); }, 20000);
    script.onload = () => { window.clearTimeout(timer); if (window.PluggyConnect) resolve(); else { widgetLoading = undefined; reject(new Error("Componente bancário indisponível.")); } };
    script.onerror = () => { window.clearTimeout(timer); script.remove(); widgetLoading = undefined; reject(new Error("Não foi possível carregar a autorização bancária.")); };
    document.head.appendChild(script);
  });
  return widgetLoading;
}

async function bankRequest(path: string, body?: unknown) {
  const response = await fetch(`/api/banks${path}`, { cache: "no-store", ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Não foi possível consultar os bancos.");
  return json;
}

export default function Banks({ month, finance, refresh }: { month: string; finance: FinanceData; refresh: () => Promise<void> }) {
  const [data, setData] = useState<BankData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("pending");
  const [account, setAccount] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const widget = useRef<Widget | null>(null);
  const revision = useRef(0);
  const load = useCallback(async () => {
    const revisionId = ++revision.current;
    try {
      const result = await bankRequest(`?month=${month}&page=${page}&review=${filter}&account=${account}`);
      if (revisionId === revision.current) { setData(result); setLoading(false); }
    } catch (error) { if (revisionId === revision.current) { setMessage(error instanceof Error ? error.message : "Falha ao carregar."); setLoading(false); } }
  }, [month, filter, account, page]);
  useEffect(() => { setLoading(true); void load(); return () => { revision.current++; }; }, [load]);
  useEffect(() => { setPage(1); setSelected(null); }, [month, filter, account]);
  useEffect(() => () => { void widget.current?.destroy().catch(() => {}); }, []);
  useEffect(() => {
    if (!data?.connections.some(row => row.enabled && row.status === "UPDATING")) return;
    let polling = false;
    let rounds = 0;
    const timer = window.setInterval(async () => {
      if (polling || document.hidden || rounds++ >= 18) return;
      polling = true;
      try { for (const connection of data.connections.filter(row => row.enabled && row.status === "UPDATING")) await bankRequest("/actions", { action: "sync", connectionId: connection.id }); await load(); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atualizar."); }
      finally { polling = false; }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [data?.connections.map(row => `${row.id}:${row.status}`).join(","), load]);

  const act = async (body: unknown, success: string) => {
    setBusy(true); setMessage("");
    try { const result = await bankRequest("/actions", body); setMessage(result.updating ? "O banco está coletando os dados. Aguarde nesta tela ou volte mais tarde." : success); await load(); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Operação não concluída."); }
    finally { setBusy(false); }
  };
  const connect = async (connectionId?: string) => {
    setBusy(true); setMessage("");
    try {
      const token = await bankRequest("/connect-token", { connectionId });
      await loadWidget();
      await widget.current?.destroy();
      widget.current = new window.PluggyConnect!({
        connectToken: token.accessToken, updateItem: token.itemId, connectorIds: token.connectorIds, includeSandbox: token.sandbox,
        products: ["ACCOUNTS", "CREDIT_CARDS", "TRANSACTIONS"], language: "pt", theme: "dark",
        onSuccess: async ({ item }: { item: { id: string } }) => { await act({ action: "connect", itemId: item.id }, "Banco conectado. Confira os movimentos abaixo."); },
        onError: async (error: { data?: { item?: { id: string } } }) => {
          if (error.data?.item?.id) await act({ action: "connect", itemId: error.data.item.id }, "Conexão registrada. Confira se precisa autorizar no banco.");
          else { setMessage("A conexão não foi concluída. Confira sua autorização no banco e tente novamente."); setBusy(false); }
        },
        onClose: () => { setBusy(false); void load(); },
      });
      await widget.current.init();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao conectar."); setBusy(false); }
  };

  if (loading && !data) return <div className="bank-empty">Carregando bancos…</div>;
  if (!data) return <div className="bank-message" role="alert">{message}<button className="secondary" onClick={() => void load()}>Tentar novamente</button></div>;
  const accounts = data.connections.flatMap(row => row.accounts);
  return <div className="banks-page" aria-busy={busy}>
    <section className="bank-overview">
      <div><span>Saldo consultado nas contas</span><strong>{data.cashBalanceCents == null ? "Não disponível" : money(data.cashBalanceCents)}</strong><small>Não é renda extra. Crédito do cartão não entra neste saldo.</small></div>
      <div className="bank-overview-actions"><span>{data.pendingCount ? `${data.pendingCount} movimento(s) para conferir, em todos os meses` : "Nenhum movimento aguardando conferência"}</span><button className="primary" disabled={busy || !data.config.configured} onClick={() => void connect()}>Conectar banco</button></div>
    </section>
    {message && <div className="bank-message" role="status">{message}</div>}
    {data.config.sandbox && <div className="bank-message warning">Ambiente de teste. Esses dados não entram no orçamento da sua casa.</div>}
    {!data.config.configured && <section className="bank-setup"><h2>Falta configurar a conexão bancária</h2><p>Seu orçamento continua funcionando. Para buscar saldo, extrato e faturas, configure as chaves da Pluggy no servidor. Depois, autorize o compartilhamento no seu banco.</p><details><summary>Como ativar</summary><ol><li>Crie uma conta na <a href="https://dashboard.pluggy.ai" target="_blank" rel="noreferrer">Pluggy</a> e confira a disponibilidade e o custo de Open Finance no plano.</li><li>No arquivo <code>.env</code> do servidor, preencha <code>PLUGGY_CLIENT_ID</code> e <code>PLUGGY_CLIENT_SECRET</code>. Não coloque as chaves aqui nem no GitHub.</li><li>Reinicie o app e clique em Conectar banco.</li></ol><p>Atualização em segundo plano exige configurar o webhook em um endereço público HTTPS. O guia está em <code>docs/INTEGRACAO-BANCARIA.md</code>.</p></details></section>}
    {data.connections.length > 0 && <section className="bank-connections" aria-label="Bancos conectados">{data.connections.map(connection => <article className="bank-connection" key={connection.id}>
      <header><div><h2>{connection.institution}{connection.sandbox ? " · TESTE" : ""}</h2><small>{connectionStatus[connection.status] || "Confira a autorização"}</small></div>{connection.enabled && <button className="secondary" disabled={busy} onClick={() => void act({ action: "sync", connectionId: connection.id, refresh: true }, "Dados consultados. Confira a data de atualização do banco.")}>Atualizar</button>}</header>
      <p className="bank-freshness">Dados do banco: {connection.providerUpdatedAt ? time(connection.providerUpdatedAt) : "Ainda não coletados"}<br />Consulta do app: {connection.lastSyncedAt ? time(connection.lastSyncedAt) : "Aguardando"}{connection.consentExpiresAt && <><br />Autorização até {date(connection.consentExpiresAt)}</>}</p>
      {connection.syncError && <p className="negative-text">{connection.syncError}</p>}
      {connection.accounts.map((row: any) => <div className="bank-account" key={row.id}><div><strong>{row.name}</strong><small>{row.type === "CREDIT" ? "Cartão" : "Conta"}{row.numberLast4 ? ` · final ${row.numberLast4}` : ""}</small></div><div>{row.type === "BANK" ? <strong>{row.balanceCents == null ? "Saldo indisponível" : money(row.balanceCents, row.currency)}</strong> : <><strong>{row.availableLimitCents == null ? "Limite indisponível" : money(row.availableLimitCents, row.currency)}</strong><small>Limite disponível, não dinheiro</small></>}</div>{row.bills.map((bill: any) => <p key={bill.id} className="bank-bill">Fatura do banco · vence {date(bill.dueDate)}: <strong>{money(bill.totalCents, bill.currency)}</strong></p>)}</div>)}
      {connection.enabled && <footer><button className="text-button" disabled={busy} onClick={() => void connect(connection.id)}>Renovar autorização</button><button className="bank-disconnect" disabled={busy} onClick={() => { if (window.confirm(`Desconectar ${connection.institution}? O histórico e os lançamentos conferidos serão preservados.`)) void act({ action: "disconnect", connectionId: connection.id }, "Banco desconectado. Histórico preservado."); }}>Desconectar</button></footer>}
    </article>)}</section>}
    <section className="bank-statement">
      <div className="section-heading-row"><div><h2>Extrato para conferência</h2><p className="muted">Só entra no orçamento depois de vincular ou adicionar. Transferências, estornos e pagamentos do cartão não são novas compras.</p></div><small>{data.total} movimento(s) neste filtro</small></div>
      <div className="bank-filters"><label>Exibir<select value={filter} onChange={e => setFilter(e.target.value)}><option value="pending">Para conferir</option><option value="all">Todos os movimentos</option></select></label><label>Conta<select value={account} onChange={e => setAccount(e.target.value)}><option value="">Todas as contas</option>{accounts.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div>
      {!data.transactions.length ? <div className="bank-empty">{data.connections.length ? "Nenhuma movimentação neste mês e filtro. Veja outro mês ou atualize seu banco." : "Conecte um banco para ver seu extrato aqui. Nenhum dado fictício foi adicionado."}</div> : <div className="bank-movements">{data.transactions.map(row => <div className="bank-movement" key={row.id}><time>{date(row.date)}</time><div className="bank-movement-main"><strong>{row.description}</strong><small>{row.account.connection.institution} · {row.account.type === "CREDIT" ? "Cartão" : "Conta corrente"}{row.installmentNumber ? ` · parcela ${row.installmentNumber}/${row.totalInstallments || "?"}` : ""}{row.status !== "POSTED" ? " · Aguardando banco" : ""}</small></div><strong className={row.direction === "INCOME" ? "positive-text" : ""}>{row.direction === "INCOME" ? "+" : "−"}{money(row.amountCents, row.currency)}</strong><span className={`bank-review-state ${row.reviewStatus}`}>{reviewStatus[row.reviewStatus]}</span>{["NEW", "CHANGED"].includes(row.reviewStatus) && <button className="secondary" disabled={busy} onClick={() => setSelected(row)}>Conferir</button>}</div>)}</div>}
      {(page > 1 || data.hasMore) && <div className="bank-pagination"><button className="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page}</span><button className="secondary" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>Próxima</button></div>}
    </section>
    <p className="bank-disclaimer">Consulta de dados, sem transferir ou pagar por você. A atualização depende do banco, do consentimento e do plano da Pluggy; não é instantânea.</p>
    {selected && <BankReview movement={selected} finance={finance} month={month} onClose={() => setSelected(null)} onSaved={async () => { setSelected(null); setMessage("Movimento conferido. O orçamento foi atualizado sem duplicar lançamentos."); await load(); await refresh(); }} />}
  </div>;
}

function BankReview({ movement, finance, month, onClose, onSaved }: { movement: any; finance: FinanceData; month: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(movement.linkedId ? "acknowledge" : "link");
  const [target, setTarget] = useState("");
  const [category, setCategory] = useState(finance.categories.find(row => row.name === movement.suggestedCategory)?.id || "");
  const [card, setCard] = useState("");
  const [referenceMonth, setReferenceMonth] = useState(movement.referenceMonth || month);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let active = true;
    void bankRequest(`/review?transactionId=${movement.id}`).then(result => { if (active) { setCandidates(result.candidates); setReady(true); } }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; element?.close(); };
  }, [movement.id]);
  const save = async () => {
    setBusy(true); setError("");
    const option = candidates.find(row => `${row.kind}:${row.id}` === target);
    try { await bankRequest("/actions", { action: "review", transactionId: movement.id, mode, categoryId: category, cardId: card, referenceMonth, kind: option?.kind, targetId: option?.id }); await onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível conferir."); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="bank-dialog" aria-labelledby="bank-review-title" onCancel={e => { if (busy) e.preventDefault(); else onClose(); }}><header><h2 id="bank-review-title">Conferir movimento</h2><button className="secondary" disabled={busy} onClick={onClose}>Fechar</button></header><p><strong>{movement.description}</strong><br />{date(movement.date)} · {money(movement.amountCents, movement.currency)} · {movement.direction === "INCOME" ? "Crédito" : "Débito"}</p>
    {error && <p role="alert" className="negative-text">{error}</p>}
    {movement.linkedId ? <><p>O banco corrigiu ou removeu este movimento. Já existe um vínculo ({movement.linkedKind}). Se necessário, corrija o lançamento em Lançamentos ou Cartões; confirmar aqui mantém o valor do seu orçamento, sem alterá-lo automaticamente.</p><button className="primary" disabled={busy} onClick={() => void save()}>Conferi, manter vínculo</button></> : <>
      <label className="field">O que fazer?<select value={mode} onChange={e => setMode(e.target.value)}><option value="link">Vincular a um lançamento que já existe</option><option value="create">Adicionar como novo lançamento</option><option value="ignore">Ignorar (transferência, estorno ou duplicado)</option></select></label>
      {mode === "link" && <><label className="field">Lançamento com o mesmo valor<select value={target} onChange={e => setTarget(e.target.value)}><option value="">{ready ? "Selecione" : "Buscando lançamentos…"}</option>{candidates.map(row => <option key={`${row.kind}:${row.id}`} value={`${row.kind}:${row.id}`}>{row.name} · {date(row.date)}{row.paid ? " · já confirmado" : ""}</option>)}</select></label>{ready && !candidates.length && <p>Não encontrei um lançamento com o mesmo valor próximo dessa data. Cadastre ou corrija o previsto antes de vincular, ou escolha adicionar um novo.</p>}<p>Vincular confirma o pagamento/recebimento sem criar outra linha. Uma compra do cartão continua compondo a fatura, sem marcá-la como paga.</p></>}
      {mode === "create" && <><label className="field">Categoria<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Sem categoria</option>{finance.categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{movement.account.type === "CREDIT" ? <><label className="field">Cartão cadastrado<select value={card} onChange={e => setCard(e.target.value)}><option value="">Selecione</option>{finance.cards.filter(row => row.status === "ACTIVE").map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="field">Mês da fatura<input type="month" value={referenceMonth} onChange={e => setReferenceMonth(e.target.value)} /></label><p>Importa apenas esta parcela de {money(movement.amountCents)}. Não gera parcelas futuras nem soma a compra separadamente nos gastos gerais.</p></> : <p>Cria uma {movement.direction === "INCOME" ? "entrada recebida" : "despesa paga"} na data do extrato. Salário e empréstimo já cadastrados devem ser vinculados para não duplicar a renda.</p>}</>}
      {mode === "ignore" && <p>Guarda o movimento no extrato, sem alterar saldo previsto, renda ou gastos do orçamento.</p>}
      <footer><button className="secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary" disabled={busy || (mode !== "ignore" && (movement.status !== "POSTED" || movement.account.connection.sandbox)) || (mode === "link" && !target) || (mode === "create" && movement.account.type === "CREDIT" && !card)} onClick={() => void save()}>{busy ? "Salvando…" : "Confirmar conferência"}</button></footer>
      {movement.status !== "POSTED" && <p>Movimento ainda pendente no banco. Só pode ser ignorado por enquanto.</p>}
    </>}
  </dialog>;
}
