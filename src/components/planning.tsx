"use client";

import type { ReactNode } from "react";

const money = (cents = 0) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
const monthName = (key: string) => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${key}-01T12:00:00`));
const dateLabel = (value: string | Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(value));
const statusText: Record<string, string> = { PAID: "Pago", PENDING: "Pendente", OPEN: "Fatura aberta", CLOSED: "Fechada", OVERDUE: "Atrasada", RECEIVED: "Recebido" };

function Status({ value }: { value: string }) { return <span className={`badge ${value}`}>{statusText[value] || value}</span>; }

export function MonthOutlook({ data, month, setMonth }: { data: any; month: string; setMonth: (month: string) => void }) {
  const plans = (data.forecast || []).slice(0, 6);
  return (
    <section className="outlook-panel">
      <div className="section-heading-row">
        <div><p className="eyebrow">OLHAR A FRENTE</p><h2>Próximos meses</h2><p className="muted">Um mês vermelho pede contenção antes do problema chegar.</p></div>
        <span className="section-caption">entradas × compromissos</span>
      </div>
      <div className="outlook-grid">
        {plans.map((plan: any) => {
          const negative = plan.availableCents < 0;
          const current = plan.month === month;
          return (
            <button key={plan.month} className={`outlook-month ${current ? "current" : ""} ${negative ? "negative" : "positive"}`} onClick={() => setMonth(plan.month)}>
              <span className="outlook-month-name">{monthName(plan.month).replace(" de ", " ")}</span>
              <strong>{negative ? "Falta " : "Livre "}{money(Math.abs(plan.availableCents))}</strong>
              <span>{money(plan.commitmentsCents)} em compromissos</span>
              <small>fixos {money(plan.fixedCents)} · variáveis {money(plan.variableCents)}</small>
              {plan.financingCents > 0 && <small>inclui {money(plan.financingCents)} de crédito</small>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DecisionCard({ data, plan }: { data: any; plan: any }) {
  const available = plan?.availableCents ?? data.totals.projectedCashBalanceCents;
  const withoutCredit = available - (plan?.financingCents || data.totals.financingCents || 0);
  const negative = available < 0;
  return (
    <section className={`decision-card ${negative ? "negative" : "positive"}`}>
      <div className="decision-main">
        <p className="eyebrow">DECISÃO DO MÊS</p>
        <h2>{negative ? "Este mês não fecha sozinho" : "Este é o valor livre depois das contas"}</h2>
        <strong>{negative ? "−" : ""}{money(Math.abs(available))}</strong>
        <p>{negative ? "Você precisa reduzir saídas ou reservar dinheiro de outro mês." : "Esse é o limite no papel. Alimentação, combustível e imprevistos ainda precisam caber aqui."}</p>
      </div>
      <div className="decision-breakdown">
        <div><span>Entradas em dinheiro</span><strong>{money(plan?.cashIncomeCents ?? data.totals.cashIncomeCents)}</strong></div>
        <div><span>Compromissos previstos</span><strong>{money(plan?.commitmentsCents ?? data.totals.totalCents)}</strong></div>
        <div><span>Contas fixas + parcelas</span><strong>{money(plan?.fixedCents ?? 0)}</strong></div>
        <div><span>Gastos variáveis/cartão</span><strong>{money(plan?.variableCents ?? 0)}</strong></div>
        <div className={withoutCredit < 0 ? "warning-line" : ""}><span>Sem empréstimo/ crédito</span><strong>{withoutCredit < 0 ? "−" : ""}{money(Math.abs(withoutCredit))}</strong></div>
        <small>{plan?.financingCents ? `O resultado melhora com ${money(plan.financingCents)} de crédito recebido neste mês.` : "Não há crédito extraordinário considerado neste mês."}</small>
      </div>
    </section>
  );
}

export default function Planning({ data, month, setMonth, run, request }: { data: any; month: string; setMonth: (month: string) => void; run: (action: () => Promise<unknown>, success: string) => void; request: (body: unknown, method?: string) => Promise<any> }) {
  const plan = (data.forecast || []).find((item: any) => item.month === month) || data.forecast?.[0];
  const toggle = (item: any) => {
    if (item.kind === "card" || item.kind === "financing") return;
    if (item.kind === "loan") {
      const loan = data.loans.find((entry: any) => entry.id === item.loanId);
      if (!loan) return;
      const next = item.status === "PAID" ? Math.max(0, loan.paidInstallments - 1) : Math.min(loan.totalInstallments, loan.paidInstallments + 1);
      run(() => request({ resource: "loan", id: loan.id, paidInstallments: next }, "PATCH"), item.status === "PAID" ? "Baixa desfeita" : "Parcela baixada");
      return;
    }
    if (item.expenseId || item.recurringOccurrenceId) {
      const resource = item.recurringOccurrenceId ? "recurringOccurrence" : "expense";
      const id = item.recurringOccurrenceId || item.expenseId;
      run(() => request({ resource, id, status: item.status === "PAID" ? "PENDING" : "PAID" }, "PATCH"), item.status === "PAID" ? "Pagamento reaberto" : "Pagamento baixado");
    }
  };

  return (
    <div className="planning-page">
      <DecisionCard data={data} plan={plan} />
      <MonthOutlook data={data} month={month} setMonth={setMonth} />
      <section className="planning-layout">
        <article className="panel timeline-panel">
          <div className="section-heading-row"><div><p className="eyebrow">CRONOGRAMA DO MÊS</p><h2>Quanto sobra depois de cada movimento</h2><p className="muted">A ordem segue a data em que o dinheiro deve entrar ou sair.</p></div><span className="section-caption">{monthName(month)}</span></div>
          <div className="cashflow-list">
            {data.timeline.length ? data.timeline.map((item: any, index: number) => {
              const incoming = item.direction === "INCOME";
              return <div className="cashflow-row" key={`${item.title}-${index}`}>
                <span className="cashflow-date">{item.flexibleDate ? `após ${String(item.scheduleAfterDay ?? 10).padStart(2, "0")}` : dateLabel(item.date)}</span>
                <div className="cashflow-row-main"><strong>{item.title}</strong><small>{item.restricted ? "Vale alimentação · não entra no saldo em dinheiro" : item.subtitle}{item.dueDate && dateLabel(item.dueDate) !== dateLabel(item.paymentDate || item.dueDate) ? ` · vence ${dateLabel(item.dueDate)}` : ""}</small></div>
                <div className="cashflow-amount"><strong className={incoming ? "incoming" : "outgoing"}>{incoming ? "+" : "−"}{money(item.amountCents)}</strong><small>depois: <b className={item.balanceAfterCents < 0 ? "negative-text" : ""}>{money(item.balanceAfterCents)}</b></small></div>
                <Status value={item.status} />
                {!incoming && item.kind !== "card" && item.kind !== "financing" && <button className="cashflow-action" onClick={() => toggle(item)}>{item.status === "PAID" ? "Reabrir" : "Baixar"}</button>}
              </div>;
            }) : <div className="empty">Cadastre entradas e contas para montar o cronograma.</div>}
          </div>
        </article>
        <aside className="planning-side">
          <article className="panel rule-panel"><p className="eyebrow">BASE DA PROJEÇÃO</p><h3>O que vai repetir</h3><p>O próximo mês só carrega itens marcados como fixos. Se uma conta não estiver nesta lista, ela não entra automaticamente na previsão.</p><div className="fixed-list">{(data.recurringExpenses || []).filter((item: any) => item.status === "ACTIVE").map((item: any) => <div className="fixed-list-row" key={item.id}><span>{item.name}</span><strong>{money(item.amountCents)}</strong></div>)}</div></article>
          <article className="panel rule-panel"><p className="eyebrow">COMO LER</p><h3>O que esse número significa?</h3><p>“Livre” é o que sobra depois dos lançamentos cadastrados. Ele ainda não reserva alimentação, combustível ou imprevistos automaticamente.</p><p>O valor de um empréstimo aparece como entrada somente no mês em que você recebeu. A parcela continua pesando nos meses seguintes.</p></article>
          <article className="panel rule-panel"><p className="eyebrow">CHECKLIST</p><h3>Antes de gastar</h3><ul><li>Confira o mês atual e o próximo.</li><li>Reserve primeiro o básico da casa.</li><li>Não trate limite do cartão como renda.</li><li>Baixe uma conta somente quando pagar.</li></ul></article>
        </aside>
      </section>
    </div>
  );
}
