"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFinanceStore } from "@/stores/finance";
import Dashboard from "@/components/dashboard";
import Transactions from "@/components/transactions";
import "@/app/dashboard.css";

const money = (cents = 0) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(cents) / 100);

const monthName = (key: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${key}-01T12:00:00`));

const dateLabel = (value: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));

const dateInput = (value?: string | Date) =>
  value
    ? new Date(value).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

const previousMonth = (key: string) => {
  const date = new Date(`${key}-01T12:00:00`);
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 7);
};

const nextMonth = (key: string) => {
  const date = new Date(`${key}-01T12:00:00`);
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 7);
};

const statusText: Record<string, string> = {
  PAID: "Pago",
  PENDING: "Pendente",
  OPEN: "Aberta",
  CLOSED: "Fechada",
  OVERDUE: "Atrasada",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  RECEIVED: "Recebido",
};

const colors = ["#8de0b8", "#f6c177", "#82b4ff", "#f58f8f", "#c4a7e7", "#f2a6d3"];
type RequestFn = (body: unknown, method?: string) => Promise<any>;
type RunFn = (action: () => Promise<unknown>, success: string) => void;

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`field${full ? " full" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Button({
  children,
  onClick,
  kind = "secondary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "danger-button";
  type?: "button" | "submit";
}) {
  return (
    <button type={type} className={kind} onClick={onClick}>
      {children}
    </button>
  );
}

function Status({ value }: { value: string }) {
  return <span className={`badge ${value}`}>{statusText[value] || value}</span>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export default function AppShell() {
  const {
    view,
    setView,
    month,
    setMonth,
    data,
    loading,
    error,
    refresh,
    selectedCardId,
    setSelectedCard,
    request,
  } = useFinanceStore();
  const [toast, setToast] = useState("");
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const run: RunFn = async (action, success) => {
    try {
      await action();
      notify(success);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Não foi possível concluir");
    }
  };

  const pageDescription = view === "dashboard"
    ? "Veja quanto entra, quanto sai e o que ainda falta pagar."
    : view === "transactions"
      ? "Cadastre contas, entradas e gastos; edite ou confirme cada um."
      : view === "cards"
        ? "Acompanhe a fatura e veja as compras que formam o total."
      : view === "loans"
          ? "Controle as parcelas e o que ainda falta pagar."
          : "Use categorias para encontrar seus gastos mais rápido.";

  if (loading && !data) return <div className="loading-screen">Carregando seu caixa…</div>;
  if (error && !data) {
    return (
      <div className="loading-screen">
        <div className="error">{error}</div>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">$</div>
          <div>
            <strong>Meu caixa</strong>
            <small>finanças da casa</small>
          </div>
        </div>
        <nav className="nav">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>
            Visão geral
          </button>
          <button className={view === "transactions" ? "active" : ""} onClick={() => setView("transactions")}>
            Lançamentos
          </button>
          <button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>
            Cartões
          </button>
          <button className={view === "loans" ? "active" : ""} onClick={() => setView("loans")}>
            Empréstimos
          </button>
          <button className={view === "categories" ? "active" : ""} onClick={() => setView("categories")}>
            Categorias
          </button>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Resumo financeiro</p>
            <h1>
              {view === "dashboard"
                ? "Visão geral"
                : view === "transactions"
                  ? "Lançamentos"
                : view === "cards"
                  ? "Cartões de crédito"
                  : view === "loans"
                    ? "Empréstimos externos"
                    : "Categorias"}
            </h1>
            <p>{pageDescription}</p>
          </div>
          <div className="month-control">
            <button aria-label="Mês anterior" title="Mês anterior" onClick={() => setMonth(previousMonth(month))}>‹</button>
            <button
              className="month-trigger"
              aria-expanded={monthMenuOpen}
              aria-label="Escolher mês"
              onClick={() => setMonthMenuOpen(open => !open)}
            >
              <span>{monthName(month)}</span>
              <span className="month-chevron">⌄</span>
            </button>
            {monthMenuOpen && (
              <div className="month-menu" role="menu">
                {Array.from({ length: 18 }, (_, index) => {
                  const date = new Date();
                  date.setMonth(date.getMonth() - 6 + index);
                  const value = date.toISOString().slice(0, 7);
                  return (
                    <button
                      key={value}
                      className={value === month ? "selected" : ""}
                      role="menuitem"
                      onClick={() => {
                        setMonth(value);
                        setMonthMenuOpen(false);
                      }}
                    >
                      {monthName(value)}
                    </button>
                  );
                })}
              </div>
            )}
            <button aria-label="Próximo mês" title="Próximo mês" onClick={() => setMonth(nextMonth(month))}>›</button>
          </div>
        </header>

        {view === "dashboard" && (
          <Dashboard
            data={data}
            month={month}
            goCard={id => {
              setSelectedCard(id);
              setView("cards");
            }}
            goTransactions={() => setView("transactions")}
            run={run}
            request={request}
          />
        )}
        {view === "transactions" && (
          <Transactions
            data={data}
            month={month}
            goCard={id => {
              setSelectedCard(id);
              setView("cards");
            }}
            run={run}
            request={request}
          />
        )}
        {view === "cards" && (
          <Cards
            data={data}
            month={month}
            selectedCardId={selectedCardId}
            setSelectedCard={setSelectedCard}
            run={run}
            request={request}
          />
        )}
        {view === "loans" && <Loans data={data} run={run} request={request} />}
        {view === "categories" && <Categories data={data} run={run} request={request} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function LegacyDashboard({
  data,
  month,
  goCard,
  run,
  request,
}: {
  data: any;
  month: string;
  goCard: (id: string) => void;
  run: RunFn;
  request: RequestFn;
}) {
  const [status, setStatus] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [showMovement, setShowMovement] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [movement, setMovement] = useState({
    name: "",
    amount: "",
    dueDate: dateInput(),
    categoryId: "",
    type: "OTHER",
  });

  const rows = data.rows.filter(
    (row: any) =>
      (status === "ALL" || row.status === status) &&
      (kind === "ALL" || row.kind === kind),
  );
  const chartData = Object.entries(data.categoryTotals).map(([name, value]) => ({
    name,
    value: Number(value),
  }));
  const cashBalance = data.totals.projectedCashBalanceCents;

  const clearMovement = () => {
    setEditingId(null);
    setMovement({
      name: "",
      amount: "",
      dueDate: dateInput(),
      categoryId: "",
      type: "OTHER",
    });
  };

  const editMovement = (row: any) => {
    const expense = data.expenses.find((item: any) => item.id === row.expenseId);
    if (!expense) return;
    setEditingId(expense.id);
    setMovement({
      name: expense.name,
      amount: String(expense.amountCents / 100),
      dueDate: dateInput(expense.dueDate),
      categoryId: expense.categoryId || "",
      type: expense.type || "OTHER",
    });
    setShowMovement(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveMovement = (event: FormEvent) => {
    event.preventDefault();
    run(
      async () => {
        await request(
          { resource: "expense", id: editingId, ...movement },
          editingId ? "PATCH" : "POST",
        );
        clearMovement();
        setShowMovement(false);
      },
      editingId
        ? "Movimento atualizado"
        : movement.type === "INCOME"
          ? "Entrada adicionada"
          : "Gasto adicionado",
    );
  };

  const removeExpense = (row: any) => {
    if (!window.confirm(`Remover "${row.description}"?`)) return;
    run(
      () => request({ resource: "expense", id: row.expenseId }, "DELETE"),
      "Lançamento removido",
    );
  };

  const toggleExpense = (row: any) => {
    const paid = row.status === "PAID";
    run(
      () =>
        request(
          { resource: "expense", id: row.expenseId, status: paid ? "PENDING" : "PAID" },
          "PATCH",
        ),
      paid ? "Pagamento reaberto" : "Pagamento baixado",
    );
  };

  const toggleLoan = (row: any) => {
    const loan = data.loans.find((item: any) => item.id === row.loanId);
    if (!loan) return;
    const nextPaid =
      row.status === "PAID"
        ? Math.max(0, loan.paidInstallments - 1)
        : Math.min(loan.totalInstallments, loan.paidInstallments + 1);
    run(
      () =>
        request(
          { resource: "loan", id: loan.id, paidInstallments: nextPaid },
          "PATCH",
        ),
      row.status === "PAID" ? "Baixa da parcela desfeita" : "Parcela baixada",
    );
  };

  const removeLoan = (row: any) => {
    if (!window.confirm(`Desativar "${row.description}"?`)) return;
    run(
      () => request({ resource: "loan", id: row.loanId }, "DELETE"),
      "Empréstimo desativado",
    );
  };

  return (
    <>
      <section className={`cashflow-highlight ${cashBalance >= 0 ? "positive" : "negative"}`}>
        <div>
          <p className="eyebrow">RESULTADO DO MÊS</p>
          <h2>{cashBalance >= 0 ? "Livre projetado após compromissos" : "Falta projetada em dinheiro"}</h2>
          <strong className="cashflow-value">{money(Math.abs(cashBalance))}</strong>
          <p className="cashflow-formula">
            {money(data.totals.cashIncomeCents)} em dinheiro − {money(data.totals.totalCents)} em saídas
          </p>
        </div>
        <div className="cashflow-breakdown">
          <div>
            <span>Salários e renda em dinheiro</span>
            <strong>{money(data.totals.cashIncomeCents - data.totals.financingCents)}</strong>
          </div>
          <div>
            <span>Empréstimo recebido neste mês</span>
            <strong>{money(data.totals.financingCents)}</strong>
          </div>
          <div>
            <span>Vale-alimentação restrito</span>
            <strong>{money(data.totals.restrictedIncomeCents)}</strong>
          </div>
          <small>
            O empréstimo aparece como entrada uma única vez; a parcela mensal continua nas saídas.
          </small>
        </div>
      </section>

      <section className="grid summary-grid">
        <Summary label="Saídas do mês" value={money(data.totals.totalCents)} note="faturas, parcelas e avulsos" />
        <Summary label="Entradas previstas" value={money(data.totals.incomeCents)} note="salários, renda e vale" tone="success" />
        <Summary label="Em aberto" value={money(data.totals.openCents)} note="pendentes + atrasadas" tone="warning" />
        <Summary label="Já pago" value={money(data.totals.paidCents)} note="compromissos baixados" tone="success" />
        <Summary label="Atrasado" value={money(data.totals.overdueCents)} note="prioridade de ação" tone="danger" />
      </section>

      <div className="section-title">
        <div>
          <p className="eyebrow">COMPROMISSOS DE {monthName(month).toUpperCase()}</p>
          <h2>Lista geral de gastos</h2>
        </div>
        <Button kind="primary" onClick={() => { clearMovement(); setShowMovement(!showMovement); }}>
          {showMovement ? "Fechar formulário" : "+ Adicionar movimento"}
        </Button>
      </div>

      {showMovement && (
        <section className="panel action-panel">
          <div className="panel-header">
            <div>
              <h2>{editingId ? "Editar lançamento" : "Novo lançamento"}</h2>
              <small>Aluguel, energia, salários, vale, alimentação e outros compromissos.</small>
            </div>
            {editingId && <Button onClick={() => { clearMovement(); setShowMovement(false); }}>Cancelar edição</Button>}
          </div>
          <form className="form" onSubmit={saveMovement}>
            <div className="form-grid">
              <Field label="Tipo">
                <select value={movement.type} onChange={event => setMovement({ ...movement, type: event.target.value })}>
                  <option value="OTHER">Gasto</option>
                  <option value="INCOME">Valor a receber</option>
                </select>
              </Field>
              <Field label="Descrição">
                <input required value={movement.name} onChange={event => setMovement({ ...movement, name: event.target.value })} placeholder="Ex.: Aluguel" />
              </Field>
              <Field label="Valor">
                <input required type="number" min="0.01" step="0.01" value={movement.amount} onChange={event => setMovement({ ...movement, amount: event.target.value })} placeholder="0,00" />
              </Field>
              <Field label="Data">
                <input required type="date" value={movement.dueDate} onChange={event => setMovement({ ...movement, dueDate: event.target.value })} />
              </Field>
              <Field label="Categoria">
                <select value={movement.categoryId} onChange={event => setMovement({ ...movement, categoryId: event.target.value })}>
                  <option value="">Sem categoria</option>
                  {data.categories.map((category: any) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="form-actions">
              <Button kind="primary" type="submit">{editingId ? "Salvar alterações" : "Adicionar movimento"}</Button>
              {!editingId && <Button onClick={() => setShowMovement(false)}>Cancelar</Button>}
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>O que vence no mês</h2>
            <small>Faturas de cartão entram como um único lançamento agregado.</small>
          </div>
          <div className="filters">
            <select value={kind} onChange={event => setKind(event.target.value)}>
              <option value="ALL">Todos os tipos</option>
              <option value="card">Cartões</option>
              <option value="loan">Empréstimos</option>
              <option value="expense">Avulsos</option>
              <option value="income">Entradas</option>
              <option value="financing">Empréstimo recebido</option>
            </select>
            <select value={status} onChange={event => setStatus(event.target.value)}>
              <option value="ALL">Todos os status</option>
              <option value="PAID">Pagos</option>
              <option value="PENDING">Pendentes</option>
              <option value="OPEN">Faturas abertas</option>
              <option value="OVERDUE">Atrasados</option>
              <option value="RECEIVED">Recebidos</option>
            </select>
          </div>
        </div>
        <div className="list">
          {rows.length ? rows.map((row: any) => (
            <div className="row row-interactive" key={row.id}>
              <span className="row-dot" style={{ background: row.color || "#82b4ff" }} />
              <div className="row-main">
                <strong>{row.description}</strong>
                <small>
                  {row.category} · {row.kind === "income" || row.kind === "financing" ? "entra" : row.kind === "card" ? "pagamento programado para" : "vence"} em {dateLabel(row.dueDate)}
                </small>
              </div>
              <span className="row-value">{money(row.amountCents)}</span>
              <Status value={row.status} />
              <div className="row-actions">
                {row.kind === "card" && <Button onClick={() => goCard(row.cardId)}>Ver cartão</Button>}
                {row.kind === "expense" && <>
                  <Button onClick={() => editMovement(row)}>Editar</Button>
                  <Button onClick={() => toggleExpense(row)}>{row.status === "PAID" ? "Reabrir" : "Dar baixa"}</Button>
                  <Button kind="danger-button" onClick={() => removeExpense(row)}>Remover</Button>
                </>}
                {row.kind === "loan" && <>
                  <Button onClick={() => toggleLoan(row)}>{row.status === "PAID" ? "Desfazer baixa" : "Dar baixa"}</Button>
                  <Button kind="danger-button" onClick={() => removeLoan(row)}>Desativar</Button>
                </>}
                {row.kind === "income" && <>
                  <Button onClick={() => editMovement(row)}>Editar</Button>
                  <Button onClick={() => toggleExpense(row)}>{row.status === "PAID" ? "Reabrir" : "Dar baixa"}</Button>
                  <Button kind="danger-button" onClick={() => removeExpense(row)}>Remover</Button>
                </>}
                {row.kind === "financing" && <span className="action-note">Origem do crédito</span>}
              </div>
            </div>
          )) : <Empty>Nenhum compromisso encontrado neste mês.</Empty>}
        </div>
      </section>

      <section className="grid two-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">CRONOGRAMA</p>
              <h2>Saldo depois de cada movimento</h2>
            </div>
          </div>
          <div className="timeline">
            {data.timeline.length ? data.timeline.map((item: any, index: number) => (
              <div className="timeline-item" key={`${item.title}-${index}`}>
                <span className="timeline-date">{dateLabel(item.date)}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle} · saldo depois: {money(item.balanceCents)}</small>
                </div>
                <div>
                  <strong className={item.kind === "income" || item.kind === "financing" ? "incoming" : "outgoing"}>
                    {item.kind === "income" || item.kind === "financing" ? "+" : "−"} {money(item.amountCents)}
                  </strong>
                  <Status value={item.status} />
                </div>
              </div>
            )) : <Empty>O cronograma será montado conforme você cadastrar compromissos.</Empty>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">CATEGORIAS</p>
              <h2>Onde o dinheiro vai</h2>
            </div>
          </div>
          {chartData.length ? (
            <>
              <div className="chart-box">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                      {chartData.map((entry, index) => <Cell key={entry.name} fill={colors[index % colors.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => money(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="legend">
                {chartData.slice(0, 6).map((item, index) => (
                  <div className="legend-row" key={item.name}>
                    <span><i className="legend-dot" style={{ background: colors[index % colors.length] }} />{item.name}</span>
                    <strong>{money(item.value)}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : <Empty>Cadastre compras ou gastos para ver a distribuição.</Empty>}
        </article>
      </section>

      <section className="grid two-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">EVOLUÇÃO</p>
              <h2>Últimos seis meses</h2>
            </div>
          </div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.history}>
                <CartesianGrid stroke="#223751" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#91a5bd", fontSize: 11 }} tickFormatter={(value) => value.slice(5)} />
                <YAxis tick={{ fill: "#91a5bd", fontSize: 11 }} tickFormatter={(value) => `R$${Math.round(value / 100)}`} />
                <Tooltip formatter={(value: number) => money(value)} />
                <Bar dataKey="totalCents" fill="#8de0b8" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>
    </>
  );
}

function Summary({
  label,
  value,
  note,
  tone = "",
}: {
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <article className={`card summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function Cards({
  data,
  month,
  selectedCardId,
  setSelectedCard,
  run,
  request,
}: {
  data: any;
  month: string;
  selectedCardId: string | null;
  setSelectedCard: (id: string | null) => void;
  run: RunFn;
  request: RequestFn;
}) {
  const [showCardForm, setShowCardForm] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [card, setCard] = useState({
    name: "",
    brand: "Visa",
    limit: "",
    closingDay: "20",
    dueDay: "28",
    paymentDay: "",
    color: "#8de0b8",
    description: "",
  });
  const [purchase, setPurchase] = useState({
    description: "",
    categoryId: "",
    purchaseDate: dateInput(),
    total: "",
    installments: "1",
    note: "",
  });
  const selected = data.cards.find((item: any) => item.id === selectedCardId) || data.cards[0];
  const invoice = selected && data.invoices.find((item: any) => item.cardId === selected.id);
  const details = selected
    ? data.installments.filter((row: any) => row.purchase.cardId === selected.id)
    : [];
  const currentDetails = details.filter((row: any) => row.referenceMonth === month);

  const preview = selected && purchase.total
    ? (() => {
        const date = new Date(`${purchase.purchaseDate}T12:00:00`);
        if (date.getDate() > selected.closingDay) date.setMonth(date.getMonth() + 1);
        const total = Math.round(Number(purchase.total) * 100);
        const count = Math.max(1, Number(purchase.installments));
        const base = Math.floor(total / count);
        return Array.from({ length: count }, (_, index) => ({
          month: new Date(date.getFullYear(), date.getMonth() + index, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }),
          amount: index === count - 1 ? total - base * (count - 1) : base,
        }));
      })()
    : [];

  const resetCard = () => {
    setEditingCardId(null);
    setCard({ name: "", brand: "Visa", limit: "", closingDay: "20", dueDay: "28", paymentDay: "", color: "#8de0b8", description: "" });
  };

  const editCard = (item: any) => {
    setEditingCardId(item.id);
    setCard({
      name: item.name,
      brand: item.brand,
      limit: String(item.limitCents / 100),
      closingDay: String(item.closingDay),
      dueDay: String(item.dueDay),
      paymentDay: item.paymentDay ? String(item.paymentDay) : "",
      color: item.color,
      description: item.description || "",
    });
    setShowCardForm(true);
  };

  const saveCard = (event: FormEvent) => {
    event.preventDefault();
    run(
      async () => {
        const result = await request(
          { resource: "card", id: editingCardId, ...card },
          editingCardId ? "PATCH" : "POST",
        );
        if (!editingCardId && result.id) setSelectedCard(result.id);
        resetCard();
        setShowCardForm(false);
      },
      editingCardId ? "Cartão atualizado" : "Cartão cadastrado",
    );
  };

  const removeCard = (item: any) => {
    if (!window.confirm(`Desativar "${item.name}"?`)) return;
    run(() => request({ resource: "card", id: item.id }, "DELETE"), "Cartão desativado");
  };

  const resetPurchase = () => {
    setEditingPurchaseId(null);
    setPurchase({ description: "", categoryId: "", purchaseDate: dateInput(), total: "", installments: "1", note: "" });
  };

  const editPurchase = (row: any) => {
    const item = row.purchase;
    setEditingPurchaseId(item.id);
    setPurchase({
      description: item.description,
      categoryId: item.categoryId || "",
      purchaseDate: dateInput(item.purchaseDate),
      total: String(item.totalCents / 100),
      installments: String(item.installments),
      note: item.note || "",
    });
    setShowPurchaseForm(true);
  };

  const savePurchase = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    run(
      async () => {
        await request(
          {
            resource: "purchase",
            id: editingPurchaseId,
            cardId: selected.id,
            ...purchase,
          },
          editingPurchaseId ? "PATCH" : "POST",
        );
        resetPurchase();
        setShowPurchaseForm(false);
      },
      editingPurchaseId ? "Compra atualizada" : "Compra adicionada à fatura",
    );
  };

  const removePurchase = (row: any) => {
    if (!window.confirm(`Remover "${row.purchase.description}" da fatura?`)) return;
    run(
      () => request({ resource: "purchase", id: row.purchase.id }, "DELETE"),
      "Compra removida",
    );
  };

  const pay = () =>
    invoice &&
    run(
      () => request({ resource: "payInvoice", invoiceId: invoice.id, paid: invoice.status !== "PAID" }),
      invoice.status === "PAID" ? "Fatura reaberta" : "Fatura marcada como paga",
    );

  return (
    <>
      <div className="section-title">
        <div>
          <p className="eyebrow">Cartões cadastrados</p>
          <h2>Escolha um cartão para acompanhar</h2>
        </div>
        <Button kind="primary" onClick={() => { resetCard(); setShowCardForm(!showCardForm); }}>
          {showCardForm ? "Fechar" : "+ Novo cartão"}
        </Button>
      </div>

      {showCardForm && (
        <section className="panel action-panel">
          <div className="panel-header">
            <div>
              <h2>{editingCardId ? "Editar cartão" : "Novo cartão"}</h2>
              <small>O limite usado é calculado pelas parcelas ainda não pagas.</small>
            </div>
          </div>
          <form className="form" onSubmit={saveCard}>
            <div className="form-grid">
              <Field label="Nome do cartão"><input required value={card.name} onChange={event => setCard({ ...card, name: event.target.value })} placeholder="Ex.: Nubank Roxinho" /></Field>
              <Field label="Bandeira"><select value={card.brand} onChange={event => setCard({ ...card, brand: event.target.value })}><option>Visa</option><option>Mastercard</option><option>Elo</option><option>Hipercard</option></select></Field>
              <Field label="Limite total"><input type="number" min="0" step="0.01" value={card.limit} onChange={event => setCard({ ...card, limit: event.target.value })} placeholder="0,00" /></Field>
              <Field label="Dia de fechamento"><input required type="number" min="1" max="28" value={card.closingDay} onChange={event => setCard({ ...card, closingDay: event.target.value })} /></Field>
              <Field label="Dia de vencimento"><input required type="number" min="1" max="31" value={card.dueDay} onChange={event => setCard({ ...card, dueDay: event.target.value })} /></Field>
              <Field label="Dia de pagamento programado"><input type="number" min="1" max="31" value={card.paymentDay} onChange={event => setCard({ ...card, paymentDay: event.target.value })} placeholder="Igual ao vencimento" /></Field>
              <Field label="Cor"><input type="color" value={card.color} onChange={event => setCard({ ...card, color: event.target.value })} /></Field>
              <Field label="Descrição" full><input value={card.description} onChange={event => setCard({ ...card, description: event.target.value })} placeholder="Opcional" /></Field>
            </div>
            <div className="form-actions">
              <Button type="submit" kind="primary">{editingCardId ? "Salvar alterações" : "Salvar cartão"}</Button>
              {editingCardId && <Button onClick={() => { resetCard(); setShowCardForm(false); }}>Cancelar</Button>}
            </div>
          </form>
        </section>
      )}

      <section className="card-list">
        {data.cards.length ? data.cards.map((item: any) => (
          <div className={`account-card ${selected?.id === item.id ? "selected" : ""}`} key={item.id}>
            <button className="account-card-select" onClick={() => setSelectedCard(item.id)}>
              <div className="account-card-top">
                <span style={{ color: item.color }}>● {item.brand}</span>
                <Status value={item.status === "ACTIVE" ? "ACTIVE" : "INACTIVE"} />
              </div>
              <h3>{item.name}</h3>
              <p>Fecha dia {item.closingDay} · vence dia {item.dueDay} · paga dia {item.paymentDay || item.dueDay}</p>
              <div className="account-limit"><span>Limite</span><strong>{money(item.limitCents)}</strong></div>
              <div className="account-card-metrics">
                <span>Usado <strong>{money(item.usedCents)}</strong></span>
                <span>Livre <strong>{money(item.availableCents)}</strong></span>
              </div>
            </button>
            <div className="account-card-actions">
              <Button onClick={() => editCard(item)}>Editar</Button>
              {item.status === "ACTIVE" && <Button kind="danger-button" onClick={() => removeCard(item)}>Desativar</Button>}
            </div>
          </div>
        )) : <Empty>Nenhum cartão cadastrado ainda. Comece pelo botão “Novo cartão”.</Empty>}
      </section>

      {selected && (
        <section className="panel" style={{ marginTop: 18 }}>
          <div className="detail-head">
            <div>
              <p className="eyebrow">{selected.brand} · fechamento dia {selected.closingDay}</p>
              <h2>{selected.name}</h2>
              <p className="muted">{selected.description || "Detalhe completo das compras e parcelas."}</p>
            </div>
            <div className="detail-total">
              <span className="muted">Fatura de {monthName(month)}</span>
              <strong>{money(invoice?.totalCents || 0)}</strong>
              <small className="muted">Vence {invoice ? dateLabel(invoice.dueDate) : "—"} · paga {invoice ? dateLabel(invoice.paymentDate || invoice.dueDate) : "—"}</small>
              <Status value={invoice?.status || "OPEN"} />
            </div>
          </div>
          <div className="detail-stats">
            <span>Limite total <strong>{money(selected.limitCents)}</strong></span>
            <span>Usado em parcelas <strong>{money(selected.usedCents)}</strong></span>
            <span>Disponível <strong>{money(selected.availableCents)}</strong></span>
          </div>
          <div className="nav-tabs">
            <button className="active">Compras da fatura</button>
            <button onClick={() => { resetPurchase(); setShowPurchaseForm(!showPurchaseForm); }}>{showPurchaseForm ? "Fechar formulário" : "+ Adicionar compra"}</button>
            <button onClick={pay}>{invoice?.status === "PAID" ? "Reabrir fatura" : "Marcar fatura como paga"}</button>
          </div>

          {showPurchaseForm && (
            <form className="form action-panel" onSubmit={savePurchase}>
              <div className="panel-header">
                <div><h3>{editingPurchaseId ? "Editar compra" : "Nova compra no cartão"}</h3><small>As parcelas são distribuídas e a última recebe o ajuste de centavos.</small></div>
              </div>
              <div className="form-grid">
                <Field label="Descrição"><input required value={purchase.description} onChange={event => setPurchase({ ...purchase, description: event.target.value })} placeholder="Ex.: Mercado" /></Field>
                <Field label="Categoria"><select value={purchase.categoryId} onChange={event => setPurchase({ ...purchase, categoryId: event.target.value })}><option value="">Sem categoria</option>{data.categories.map((category: any) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
                <Field label="Data da compra"><input required type="date" value={purchase.purchaseDate} onChange={event => setPurchase({ ...purchase, purchaseDate: event.target.value })} /></Field>
                <Field label="Valor total"><input required type="number" min="0.01" step="0.01" value={purchase.total} onChange={event => setPurchase({ ...purchase, total: event.target.value })} placeholder="0,00" /></Field>
                <Field label="Parcelas"><input required type="number" min="1" max="60" value={purchase.installments} onChange={event => setPurchase({ ...purchase, installments: event.target.value })} /></Field>
                <Field label="Observações"><input value={purchase.note} onChange={event => setPurchase({ ...purchase, note: event.target.value })} placeholder="Opcional" /></Field>
              </div>
              {preview.length > 0 && <div className="preview"><strong>Prévia das parcelas</strong>{preview.map((item, index) => <div className="preview-row" key={`${item.month}-${index}`}><span>{item.month} · parcela {index + 1}/{preview.length}</span><strong>{money(item.amount)}</strong></div>)}</div>}
              <div className="form-actions">
                <Button type="submit" kind="primary">{editingPurchaseId ? "Salvar compra" : "Adicionar compra"}</Button>
                <Button onClick={() => { resetPurchase(); setShowPurchaseForm(false); }}>Cancelar</Button>
              </div>
            </form>
          )}

          <div className="section-title">
            <div><p className="eyebrow">Compras da fatura</p><h3>{currentDetails.length} lançamento(s) em {monthName(month)}</h3></div>
            <span className="muted">Total: {money(currentDetails.reduce((sum: number, row: any) => sum + row.amountCents, 0))}</span>
          </div>
          <div className="list">
            {currentDetails.length ? currentDetails.map((row: any) => (
              <div className="row row-interactive" key={row.id}>
                <span className="row-dot" style={{ background: row.purchase.category?.color || selected.color }} />
                <div className="row-main"><strong>{row.purchase.description}</strong><small>{row.purchase.category?.name || "Sem categoria"} · compra em {dateLabel(row.purchase.purchaseDate)} · parcela {row.number}/{row.purchase.installments}</small></div>
                <span className="row-value">{money(row.amountCents)}</span>
                <Status value={row.status} />
                <div className="row-actions"><Button onClick={() => editPurchase(row)}>Editar</Button><Button kind="danger-button" onClick={() => removePurchase(row)}>Remover</Button></div>
              </div>
            )) : <Empty>Nenhuma compra lançada neste cartão para este mês.</Empty>}
          </div>
        </section>
      )}
    </>
  );
}

function Loans({ data, run, request }: { data: any; run: RunFn; request: RequestFn }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    principal: "",
    totalInstallments: "12",
    installment: "",
    dueDay: "10",
    startDate: dateInput(),
    receivedDate: dateInput(),
    interestRate: "",
  });

  const reset = () => {
    setEditingId(null);
    setShowForm(false);
    setForm({ name: "", principal: "", totalInstallments: "12", installment: "", dueDay: "10", startDate: dateInput(), receivedDate: dateInput(), interestRate: "" });
  };

  const edit = (loan: any) => {
    setEditingId(loan.id);
    setShowForm(true);
    setForm({
      name: loan.name,
      principal: String(loan.principalCents / 100),
      totalInstallments: String(loan.totalInstallments),
      installment: String(loan.installmentCents / 100),
      dueDay: String(loan.dueDay),
      startDate: dateInput(loan.startDate),
      receivedDate: dateInput(loan.receivedDate || loan.startDate),
      interestRate: loan.interestRate ? String(loan.interestRate) : "",
    });
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    run(
      async () => {
        await request({ resource: "loan", id: editingId, ...form }, editingId ? "PATCH" : "POST");
        reset();
      },
      editingId ? "Empréstimo atualizado" : "Empréstimo cadastrado",
    );
  };

  const togglePayment = (loan: any) => {
    const paid = loan.paidInstallments >= loan.totalInstallments;
    const next = paid ? Math.max(0, loan.paidInstallments - 1) : Math.min(loan.totalInstallments, loan.paidInstallments + 1);
    run(() => request({ resource: "loan", id: loan.id, paidInstallments: next }, "PATCH"), paid ? "Última baixa desfeita" : "Parcela marcada como paga");
  };

  const toggleStatus = (loan: any) => {
    run(() => request({ resource: "loan", id: loan.id, status: loan.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }, "PATCH"), loan.status === "ACTIVE" ? "Empréstimo desativado" : "Empréstimo reativado");
  };

  return (
    <>
      <div className="section-title">
        <div><p className="eyebrow">Empréstimos</p><h2>Empréstimos e parcelas</h2></div>
        <Button kind="primary" onClick={() => { if (showForm) reset(); else { setEditingId(null); setShowForm(true); } }}>{showForm ? "Fechar formulário" : "+ Novo empréstimo"}</Button>
      </div>
      <section className={showForm ? "grid two-grid" : "grid"}>
        {showForm && <article className="panel action-panel">
          <div className="panel-header"><div><h2>{editingId ? "Editar empréstimo" : "Novo empréstimo"}</h2><small>O valor recebido aparece na Visão geral; só a parcela pesa nos meses seguintes.</small></div></div>
          <form className="form" onSubmit={save}>
            <div className="form-grid">
              <Field label="Nome/descrição" full><input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Nubank pessoal" /></Field>
              <Field label="Valor contratado"><input required type="number" min="0.01" step="0.01" value={form.principal} onChange={event => setForm({ ...form, principal: event.target.value })} /></Field>
              <Field label="Número de parcelas"><input required type="number" min="1" value={form.totalInstallments} onChange={event => setForm({ ...form, totalInstallments: event.target.value })} /></Field>
              <Field label="Valor da parcela"><input required type="number" min="0.01" step="0.01" value={form.installment} onChange={event => setForm({ ...form, installment: event.target.value })} /></Field>
              <Field label="Dia de vencimento"><input required type="number" min="1" max="31" value={form.dueDay} onChange={event => setForm({ ...form, dueDay: event.target.value })} /></Field>
              <Field label="Data da primeira parcela"><input required type="date" value={form.startDate} onChange={event => setForm({ ...form, startDate: event.target.value })} /></Field>
              <Field label="Data em que recebeu o dinheiro"><input required type="date" value={form.receivedDate} onChange={event => setForm({ ...form, receivedDate: event.target.value })} /></Field>
              <Field label="Juros (% opcional)"><input type="number" min="0" step="0.01" value={form.interestRate} onChange={event => setForm({ ...form, interestRate: event.target.value })} /></Field>
            </div>
            <div className="form-actions"><Button type="submit" kind="primary">{editingId ? "Salvar alterações" : "Salvar empréstimo"}</Button>{editingId && <Button onClick={reset}>Cancelar</Button>}</div>
          </form>
        </article>}
        <article className="panel">
          <div className="panel-header"><div><h2>Empréstimos cadastrados</h2><small>Baixe uma parcela por vez e desfaça a última baixa se precisar corrigir.</small></div></div>
          <div className="list">
            {data.loans.length ? data.loans.map((loan: any) => (
              <div className="row row-interactive" key={loan.id}>
                <span className="row-dot" style={{ background: "#f6c177" }} />
                <div className="row-main"><strong>{loan.name}</strong><small>{loan.paidInstallments}/{loan.totalInstallments} parcelas pagas · recebido em {dateLabel(loan.receivedDate || loan.startDate)} · vence dia {loan.dueDay} · saldo contratado {money(Math.max(0, loan.principalCents - loan.paidInstallments * loan.installmentCents))}</small></div>
                <span className="row-value">{money(loan.installmentCents)}</span>
                <Status value={loan.status} />
                <div className="row-actions">
                  <Button onClick={() => edit(loan)}>Editar</Button>
                  <Button onClick={() => togglePayment(loan)}>{loan.paidInstallments >= loan.totalInstallments ? "Desfazer baixa" : "Dar baixa"}</Button>
                  <Button kind="danger-button" onClick={() => toggleStatus(loan)}>{loan.status === "ACTIVE" ? "Desativar" : "Reativar"}</Button>
                </div>
              </div>
            )) : <Empty>Nenhum empréstimo externo cadastrado.</Empty>}
          </div>
        </article>
      </section>
    </>
  );
}

function Categories({ data, run, request }: { data: any; run: RunFn; request: RequestFn }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", color: "#8de0b8", icon: "tag" });

  const reset = () => {
    setEditingId(null);
    setShowForm(false);
    setForm({ name: "", color: "#8de0b8", icon: "tag" });
  };

  const edit = (category: any) => {
    setEditingId(category.id);
    setShowForm(true);
    setForm({ name: category.name, color: category.color, icon: category.icon });
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      await request({ resource: "category", id: editingId, ...form }, editingId ? "PATCH" : "POST");
      reset();
    }, editingId ? "Categoria atualizada" : "Categoria criada");
  };

  const remove = (category: any) => {
    if (!window.confirm(`Remover a categoria "${category.name}"?`)) return;
    run(() => request({ resource: "category", id: category.id }, "DELETE"), "Categoria removida");
  };

  return (
    <>
      <div className="section-title"><div><p className="eyebrow">Categorias</p><h2>Categorias de gastos</h2></div><Button kind="primary" onClick={() => { if (showForm) reset(); else { setEditingId(null); setShowForm(true); } }}>{showForm ? "Fechar formulário" : "+ Nova categoria"}</Button></div>
      <section className={showForm ? "grid two-grid" : "grid"}>
        {showForm && <article className="panel action-panel">
          <div className="panel-header"><div><h2>{editingId ? "Editar categoria" : "Nova categoria"}</h2><small>Use cores para reconhecer os gastos rapidamente.</small></div></div>
          <form className="form" onSubmit={save}>
            <Field label="Nome"><input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Educação" /></Field>
            <Field label="Cor"><input type="color" value={form.color} onChange={event => setForm({ ...form, color: event.target.value })} /></Field>
            <Field label="Ícone"><input value={form.icon} onChange={event => setForm({ ...form, icon: event.target.value })} placeholder="tag" /></Field>
            <div className="form-actions"><Button type="submit" kind="primary">{editingId ? "Salvar alterações" : "Salvar categoria"}</Button>{editingId && <Button onClick={reset}>Cancelar</Button>}</div>
          </form>
        </article>}
        <article className="panel">
          <div className="panel-header"><div><h2>Catálogo atual</h2><small>{data.categories.length} categoria(s)</small></div></div>
          <div className="list">
            {data.categories.map((category: any) => (
              <div className="row row-interactive" key={category.id}>
                <span className="row-dot" style={{ background: category.color }} />
                <div className="row-main"><strong>{category.name}</strong><small>Disponível para cartões e gastos avulsos</small></div>
                <span className="muted">{category.icon}</span>
                <div className="row-actions"><Button onClick={() => edit(category)}>Editar</Button><Button kind="danger-button" onClick={() => remove(category)}>Remover</Button></div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
