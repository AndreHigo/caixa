"use client";

import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

const money = (cents = 0) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);

const monthName = (key: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${key}-01T12:00:00`));

const dateLabel = (value: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(value));

const dateInput = (value?: string | Date) =>
  value ? new Date(value).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

const statusText: Record<string, string> = {
  PAID: "Pago",
  PENDING: "Pendente",
  OPEN: "Fatura aberta",
  CLOSED: "Fechada",
  OVERDUE: "Atrasada",
  RECEIVED: "Recebido",
};

type RequestFn = (body: unknown, method?: string) => Promise<any>;
type RunFn = (action: () => Promise<unknown>, success: string) => void;

function ActionButton({
  children,
  onClick,
  danger = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button type="button" className={danger ? "compact-button danger-button" : "compact-button"} onClick={onClick}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Status({ value }: { value: string }) {
  return <span className={`badge ${value}`}>{statusText[value] || value}</span>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export default function Transactions({
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
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [movement, setMovement] = useState({
    name: "",
    amount: "",
    dueDate: dateInput(),
    categoryId: "",
    type: "OTHER",
    recurrence: "NONE",
  });

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return data.rows.filter((row: any) => {
      const matchesText = !term || `${row.description} ${row.category}`.toLocaleLowerCase("pt-BR").includes(term);
      const matchesStatus = status === "ALL" || row.status === status;
      const matchesKind = kind === "ALL" || row.kind === kind;
      return matchesText && matchesStatus && matchesKind;
    });
  }, [data.rows, kind, search, status]);

  const clearForm = () => {
    setEditingId(null);
    setEditingRecurringId(null);
    setMovement({ name: "", amount: "", dueDate: dateInput(), categoryId: "", type: "OTHER", recurrence: "NONE" });
  };

  const editMovement = (row: any) => {
    if (row.recurringId) {
      const recurring = data.recurringExpenses.find((item: any) => item.id === row.recurringId);
      if (!recurring) return;
      setEditingId(null);
      setEditingRecurringId(recurring.id);
      setMovement({
        name: recurring.name,
        amount: String(recurring.amountCents / 100),
        dueDate: dateInput(recurring.firstDueDate),
        categoryId: recurring.categoryId || "",
        type: recurring.type || "OTHER",
        recurrence: "MONTHLY",
      });
      setShowForm(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const expense = data.expenses.find((item: any) => item.id === row.expenseId);
    if (!expense) return;
    setEditingId(expense.id);
    setMovement({
      name: expense.name,
      amount: String(expense.amountCents / 100),
      dueDate: dateInput(expense.dueDate),
      categoryId: expense.categoryId || "",
      type: expense.type || "OTHER",
      recurrence: "NONE",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveMovement = (event: FormEvent) => {
    event.preventDefault();
    run(
      async () => {
        if (editingRecurringId) {
          await request({ resource: "recurring", id: editingRecurringId, ...movement }, "PATCH");
        } else {
          await request({ resource: "expense", id: editingId, ...movement }, editingId ? "PATCH" : "POST");
        }
        clearForm();
        setShowForm(false);
      },
      editingId || editingRecurringId ? "Lançamento atualizado" : movement.type === "INCOME" ? "Entrada adicionada" : "Gasto adicionado",
    );
  };

  const toggleExpense = (row: any) => {
    const paid = row.status === "PAID";
    if (row.recurringOccurrenceId) {
      run(
        () => request({ resource: "recurringOccurrence", id: row.recurringOccurrenceId, status: paid ? "PENDING" : "PAID" }, "PATCH"),
        paid ? "Pagamento reaberto" : "Pagamento baixado",
      );
      return;
    }
    if (!row.expenseId) return;
    run(
      () => request({ resource: "expense", id: row.expenseId, status: paid ? "PENDING" : "PAID" }, "PATCH"),
      paid ? "Pagamento reaberto" : "Pagamento baixado",
    );
  };

  const toggleLoan = (row: any) => {
    const loan = data.loans.find((item: any) => item.id === row.loanId);
    if (!loan) return;
    const nextPaid = row.status === "PAID"
      ? Math.max(0, loan.paidInstallments - 1)
      : Math.min(loan.totalInstallments, loan.paidInstallments + 1);
    run(
      () => request({ resource: "loan", id: loan.id, paidInstallments: nextPaid }, "PATCH"),
      row.status === "PAID" ? "Baixa desfeita" : "Parcela baixada",
    );
  };

  const removeExpense = (row: any) => {
    if (!window.confirm(`Remover "${row.description}"?`)) return;
    if (row.recurringId) {
      run(() => request({ resource: "recurring", id: row.recurringId }, "DELETE"), "Fixo mensal desativado");
      return;
    }
    if (!row.expenseId) return;
    run(() => request({ resource: "expense", id: row.expenseId }, "DELETE"), "Lançamento removido");
  };

  return (
    <div className="transactions-page">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Lançamentos do mês</p>
          <h2>Todos os lançamentos</h2>
          <p>Contas, entradas e parcelas que formam o caixa de {monthName(month)}.</p>
        </div>
        <button className="quick-add-button" onClick={() => { clearForm(); setShowForm(!showForm); }}>
          {showForm ? "Fechar formulário" : "+ Novo lançamento"}
        </button>
      </section>

      <section className="transactions-summary">
        <div><span>Entradas</span><strong className="positive-text">{money(data.totals.incomeCents)}</strong></div>
        <div><span>Saídas</span><strong>{money(data.totals.totalCents)}</strong></div>
        <div><span>Em aberto</span><strong>{money(data.totals.openCents)}</strong></div>
        <div><span>Já pago</span><strong className="positive-text">{money(data.totals.paidCents)}</strong></div>
      </section>

      {showForm && (
        <section className="panel action-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{editingId || editingRecurringId ? "Editar" : "Novo lançamento"}</p>
              <h2>{editingId || editingRecurringId ? "Editar lançamento" : "Adicionar entrada ou saída"}</h2>
            </div>
            <ActionButton onClick={() => { clearForm(); setShowForm(false); }}>Cancelar</ActionButton>
          </div>
          <form className="form" onSubmit={saveMovement}>
            <div className="form-grid">
              <Field label="Tipo"><select value={movement.type} onChange={event => setMovement({ ...movement, type: event.target.value })}><option value="OTHER">Gasto</option><option value="INCOME">Valor a receber</option></select></Field>
              <Field label="Descrição"><input required value={movement.name} onChange={event => setMovement({ ...movement, name: event.target.value })} placeholder="Ex.: Aluguel" /></Field>
              <Field label="Valor"><input required type="number" min="0.01" step="0.01" value={movement.amount} onChange={event => setMovement({ ...movement, amount: event.target.value })} placeholder="0,00" /></Field>
              <Field label="Vencimento"><input required type="date" value={movement.dueDate} onChange={event => setMovement({ ...movement, dueDate: event.target.value })} /></Field>
              <Field label="Categoria"><select value={movement.categoryId} onChange={event => setMovement({ ...movement, categoryId: event.target.value })}><option value="">Sem categoria</option>{data.categories.map((category: any) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
              <Field label="Repetição"><select value={movement.recurrence} disabled={Boolean(editingId || editingRecurringId)} onChange={event => setMovement({ ...movement, recurrence: event.target.value })}><option value="NONE">Somente neste mês</option><option value="MONTHLY">Fixo todos os meses</option></select></Field>
            </div>
            <div className="form-actions"><button className="quick-add-button" type="submit">{editingId || editingRecurringId ? "Salvar alterações" : "Adicionar lançamento"}</button></div>
          </form>
        </section>
      )}

      <section className="panel transactions-panel">
        <div className="transactions-toolbar">
          <label className="search-box"><span>Buscar</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Ex.: aluguel, mercado, salário" /></label>
          <label className="filter-box"><span>Tipo</span><select value={kind} onChange={event => setKind(event.target.value)}><option value="ALL">Todos</option><option value="card">Cartões</option><option value="loan">Empréstimos</option><option value="expense">Gastos</option><option value="income">Entradas</option><option value="financing">Crédito recebido</option></select></label>
          <label className="filter-box"><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">Todos</option><option value="PENDING">Pendentes</option><option value="OPEN">Faturas abertas</option><option value="OVERDUE">Atrasados</option><option value="PAID">Pagos</option><option value="RECEIVED">Recebidos</option></select></label>
          <span className="result-count">{rows.length} resultado(s)</span>
        </div>
        <div className="list transactions-list">
          {rows.length ? rows.map((row: any) => (
            <div className="row row-interactive transaction-row" key={row.id}>
              <span className="row-dot" style={{ background: row.color || "#82b4ff" }} />
              <div className="row-main"><strong>{row.description}</strong><small>{row.category} · {row.recurring ? "fixo mensal · " : ""}{row.kind === "income" || row.kind === "financing" ? "entra" : row.kind === "card" ? "pagamento programado para" : "vence"} em {dateLabel(row.dueDate)}</small></div>
              <span className={`row-value ${row.kind === "income" || row.kind === "financing" ? "positive-text" : ""}`}>{row.kind === "income" || row.kind === "financing" ? "+" : ""}{money(row.amountCents)}</span>
              <Status value={row.status} />
              <div className="row-actions">
                {row.kind === "card" && <ActionButton onClick={() => goCard(row.cardId)}>Abrir cartão</ActionButton>}
                {row.kind === "expense" || row.kind === "income" ? <><ActionButton onClick={() => editMovement(row)}>Editar</ActionButton><ActionButton onClick={() => toggleExpense(row)}>{row.status === "PAID" ? (row.kind === "income" ? "Reabrir entrada" : "Reabrir") : (row.kind === "income" ? "Confirmar entrada" : "Dar baixa")}</ActionButton><ActionButton danger onClick={() => removeExpense(row)}>Remover</ActionButton></> : null}
                {row.kind === "loan" && <ActionButton onClick={() => toggleLoan(row)}>{row.status === "PAID" ? "Desfazer baixa" : "Dar baixa"}</ActionButton>}
                {row.kind === "financing" && <span className="action-note">Entrada do crédito</span>}
              </div>
            </div>
          )) : <Empty>Nenhum lançamento encontrado com esses filtros.</Empty>}
        </div>
      </section>
    </div>
  );
}
