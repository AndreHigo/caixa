"use client";

import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { MonthOutlook } from "@/components/planning";

const money = (cents = 0) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
const monthName = (key: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${key}-01T12:00:00`));
const dateLabel = (value: string | Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(value));
const dateInput = (value?: string | Date) => value ? new Date(value).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
const statusText: Record<string, string> = { PAID: "Pago", PENDING: "Pendente", OPEN: "Fatura aberta", CLOSED: "Fechada", OVERDUE: "Atrasada", RECEIVED: "Recebido" };
type RequestFn = (body: unknown, method?: string) => Promise<any>;
type RunFn = (action: () => Promise<unknown>, success: string) => void;

function Status({ value }: { value: string }) { return <span className={`badge ${value}`}>{statusText[value] || value}</span>; }
function ActionButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) { return <button type="button" className="compact-button" onClick={onClick}>{children}</button>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="quick-field"><span>{label}</span>{children}</label>; }

export default function Dashboard({ data, month, setMonth, goCard, goTransactions, goBanks, run, request }: { data: any; month: string; setMonth: (month: string) => void; goCard: (id: string) => void; goTransactions: () => void; goBanks: () => void; run: RunFn; request: RequestFn }) {
  const [showForm, setShowForm] = useState(false);
  const [movement, setMovement] = useState({ name: "", amount: "", dueDate: dateInput(`${month}-01T12:00:00`), paymentDate: "", scheduleType: "FIXED", scheduleAfterDay: "10", categoryId: "", type: "OTHER", recurrence: "NONE" });
  const plan = (data.forecast || []).find((item: any) => item.month === month);
  const nextActions = useMemo(() => data.rows.filter((row: any) => row.status !== "PAID" && row.status !== "RECEIVED").slice(0, 6), [data.rows]);
  const resetForm = () => setMovement({ name: "", amount: "", dueDate: dateInput(`${month}-01T12:00:00`), paymentDate: "", scheduleType: "FIXED", scheduleAfterDay: "10", categoryId: "", type: "OTHER", recurrence: "NONE" });
  const saveMovement = (event: FormEvent) => {
    event.preventDefault();
    run(async () => { await request({ resource: "expense", ...movement }, "POST"); resetForm(); setShowForm(false); }, movement.type === "INCOME" ? "Entrada adicionada" : "Gasto adicionado");
  };
  const toggle = (row: any) => {
    if (row.kind === "card") return goCard(row.cardId);
    if (row.kind === "loan") {
      const loan = data.loans.find((item: any) => item.id === row.loanId);
      if (!loan) return;
      const next = row.status === "PAID" ? Math.max(0, loan.paidInstallments - 1) : Math.min(loan.totalInstallments, loan.paidInstallments + 1);
      run(() => request({ resource: "loan", id: loan.id, paidInstallments: next }, "PATCH"), row.status === "PAID" ? "Baixa desfeita" : "Parcela baixada");
      return;
    }
    const resource = row.recurringOccurrenceId ? "recurringOccurrence" : "expense";
    const id = row.recurringOccurrenceId || row.expenseId;
    if (!id) return;
    run(() => request({ resource, id, status: row.status === "PAID" ? "PENDING" : "PAID" }, "PATCH"), row.status === "PAID" ? "Pagamento reaberto" : "Pagamento baixado");
  };

  return <div className="dashboard">
    <section className={`dashboard-hero ${data.totals.projectedCashBalanceCents >= 0 ? "positive" : "negative"}`}>
      <div className="hero-main"><p className="eyebrow">CONTROLE DA CASA · {monthName(month)}</p><h2>{data.totals.projectedCashBalanceCents >= 0 ? "Livre no papel" : "Falta para fechar"}</h2><strong>{data.totals.projectedCashBalanceCents < 0 ? "−" : ""}{money(Math.abs(data.totals.projectedCashBalanceCents))}</strong><p>{data.totals.financingCents ? `Inclui ${money(data.totals.financingCents)} recebidos de empréstimo neste mês.` : "Sem crédito extraordinário neste mês."}</p></div>
      <div className="hero-side"><div><span>Entradas em dinheiro</span><strong>{money(data.totals.cashIncomeCents)}</strong></div><div><span>Compromissos previstos</span><strong>{money(data.totals.totalCents)}</strong></div><div><span>Sem empréstimo</span><strong className={data.totals.cashIncomeCents - data.totals.financingCents - data.totals.totalCents < 0 ? "negative-text" : ""}>{data.totals.cashIncomeCents - data.totals.financingCents - data.totals.totalCents < 0 ? "−" : ""}{money(Math.abs(data.totals.cashIncomeCents - data.totals.financingCents - data.totals.totalCents))}</strong></div></div>
    </section>

    <section className="bank-dashboard-strip"><div><span>Saldo consultado no banco</span><strong>{data.bankSummary?.cashBalanceCents == null ? "Banco não conectado" : money(data.bankSummary.cashBalanceCents)}</strong><small>{data.bankSummary?.updatedAt ? `Dados do banco em ${new Date(data.bankSummary.updatedAt).toLocaleString("pt-BR")}. Não somados à renda.` : "Seu planejamento acima é uma previsão, não o saldo da conta."}</small></div><button className="secondary" onClick={goBanks}>{data.bankSummary?.pendingCount ? `Conferir ${data.bankSummary.pendingCount} movimento(s)` : "Abrir bancos"}</button></section>
    <section className="dashboard-toolbar"><div><p className="eyebrow">O QUE FAZER AGORA</p><h2>Primeiro, olhe o mês. Depois, olhe o próximo.</h2></div><button className="quick-add-button" onClick={() => { resetForm(); setShowForm(!showForm); }}>{showForm ? "Fechar" : "+ Novo lançamento"}</button></section>
    {showForm && <section className="quick-form-card"><div><p className="eyebrow">LANÇAMENTO RÁPIDO</p><h3>Adicionar entrada ou saída</h3></div><form onSubmit={saveMovement}><Field label="Tipo"><select value={movement.type} onChange={event => setMovement({ ...movement, type: event.target.value })}><option value="OTHER">Gasto</option><option value="INCOME">Entrada</option></select></Field><Field label="Descrição"><input required value={movement.name} onChange={event => setMovement({ ...movement, name: event.target.value })} placeholder="Ex.: supermercado" /></Field><Field label="Valor"><input required type="number" min="0.01" step="0.01" value={movement.amount} onChange={event => setMovement({ ...movement, amount: event.target.value })} placeholder="0,00" /></Field><Field label="Data"><input required type="date" value={movement.dueDate} onChange={event => setMovement({ ...movement, dueDate: event.target.value })} /></Field><Field label="Categoria"><select value={movement.categoryId} onChange={event => setMovement({ ...movement, categoryId: event.target.value })}><option value="">Sem categoria</option>{data.categories.map((category: any) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Field label="Repetição"><select value={movement.recurrence} onChange={event => setMovement({ ...movement, recurrence: event.target.value })}><option value="NONE">Somente este mês</option><option value="MONTHLY">Fixo todos os meses</option></select></Field><div className="quick-form-actions"><button className="quick-add-button" type="submit">Salvar</button><ActionButton onClick={() => setShowForm(false)}>Cancelar</ActionButton></div></form></section>}

    <section className="dashboard-columns"><article className="priority-card"><div className="priority-header"><div><p className="eyebrow">AGENDA</p><h2>O que vem primeiro</h2><span>Contas e entradas na ordem do pagamento.</span></div><span className="priority-count">{nextActions.length}</span></div>{nextActions.length ? nextActions.map((row: any) => <div className="priority-item" key={row.id}><span className="priority-date">{row.scheduleType === "AFTER_DAY" ? `após ${String(row.scheduleAfterDay ?? 10).padStart(2, "0")}` : dateLabel(row.scheduleDate || row.paymentDate || row.dueDate)}</span><div className="priority-main"><strong>{row.description}</strong><small>{row.category} · {row.kind === "income" || row.kind === "financing" ? "entrada" : row.kind === "card" ? "fatura" : "saída"}</small></div><strong className={row.kind === "income" || row.kind === "financing" ? "positive-text" : ""}>{row.kind === "income" || row.kind === "financing" ? "+" : ""}{money(row.amountCents)}</strong><Status value={row.status} /><ActionButton onClick={() => toggle(row)}>{row.kind === "card" ? "Abrir" : row.status === "PAID" ? "Reabrir" : row.kind === "income" ? "Confirmar" : "Baixar"}</ActionButton></div>) : <div className="empty">Nada pendente neste mês.</div>}</article>
      <article className="month-note"><p className="eyebrow">LEITURA RÁPIDA</p><h2>{plan?.availableCents >= 0 ? "Dá para fechar, mas não sobrou tudo para gastar." : "O mês está apertado."}</h2><p>{plan?.availableCents >= 0 ? `Depois dos compromissos, o sistema projeta ${money(plan.availableCents)}. Separe alimentação, combustível e imprevistos antes de considerar esse valor livre.` : `Faltam ${money(Math.abs(plan?.availableCents || data.totals.projectedCashBalanceCents))} para cobrir o que está lançado. Veja o cronograma e priorize o básico.`}</p><button className="text-button" onClick={() => setMonth((data.forecast?.[1] || {}).month || month)}>Ver próximo mês →</button><button className="text-button" onClick={() => goTransactions()}>Revisar lançamentos →</button></article></section>

    <MonthOutlook data={data} month={month} setMonth={setMonth} />

    <section className="recent-card"><div className="dashboard-section-heading compact-heading"><div><p className="eyebrow">REGISTROS</p><h2>Últimos lançamentos do mês</h2><span>Edite, remova ou dê baixa em Lançamentos.</span></div><button className="show-more-inline" onClick={goTransactions}>Abrir lançamentos</button></div><div className="compact-list">{data.rows.slice(-6).reverse().map((row: any) => <div className="compact-row" key={row.id}><span className="compact-dot" style={{ background: row.color || "#82b4ff" }} /><div><strong>{row.description}</strong><small>{row.category} · {row.scheduleType === "AFTER_DAY" ? "sem dia fixo" : dateLabel(row.scheduleDate || row.paymentDate || row.dueDate)}</small></div><strong className={row.kind === "income" || row.kind === "financing" ? "positive-text" : ""}>{row.kind === "income" || row.kind === "financing" ? "+" : ""}{money(row.amountCents)}</strong><Status value={row.status} /></div>)}</div></section>

    <section className="category-summary"><div className="section-heading-row"><div><p className="eyebrow">ONDE ESTÁ INDO</p><h2>Gastos por categoria</h2></div><button className="text-button" onClick={goTransactions}>Ver tudo →</button></div>{Object.entries(data.categoryTotals).slice(0, 6).map(([name, value]) => { const max = Math.max(1, ...Object.values(data.categoryTotals).map(item => Number(item))); return <div className="category-summary-row" key={name}><div><span>{name}</span><strong>{money(Number(value))}</strong></div><div className="category-bar"><b style={{ width: `${Math.max(4, Number(value) / max * 100)}%` }} /></div></div>; })}</section>
  </div>;
}
