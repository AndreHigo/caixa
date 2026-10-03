"use client";
import { create } from "zustand";

export type View = "dashboard" | "planning" | "transactions" | "cards" | "loans" | "categories" | "banks";
export type FinanceData = { selectedMonth: string; cards: any[]; loans: any[]; expenses: any[]; recurringExpenses: any[]; recurringOccurrences: any[]; categories: any[]; rows: any[]; invoices: any[]; installments: any[]; timeline: any[]; forecast: any[]; categoryTotals: Record<string, number>; history: any[]; totals: { totalCents: number; incomeCents: number; cashIncomeCents: number; financingCents: number; restrictedIncomeCents: number; projectedBalanceCents: number; projectedCashBalanceCents: number; paidCents: number; pendingCents: number; overdueCents: number; openCents: number } };
type Store = { view: View; month: string; data: FinanceData | null; loading: boolean; error: string; selectedCardId: string | null; setView: (view: View) => void; setMonth: (month: string) => void; setSelectedCard: (id: string | null) => void; refresh: (month?: string) => Promise<void>; request: (body: unknown, method?: string) => Promise<any> };

const localMonth = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; };
let refreshSequence = 0;

export const useFinanceStore = create<Store>((set, get) => ({
  view: "dashboard", month: localMonth(), data: null, loading: true, error: "", selectedCardId: null,
  setView: view => set({ view }), setMonth: month => { set({ month }); void get().refresh(month); }, setSelectedCard: selectedCardId => set({ selectedCardId }),
  refresh: async (month = get().month) => { const sequence = ++refreshSequence; set({ loading: true, error: "" }); try { const response = await fetch(`/api/finance?month=${month}`, { cache: "no-store" }); const json = await response.json(); if (!response.ok) throw new Error(json.error || "Não foi possível carregar os dados"); if (sequence === refreshSequence) set({ data: json, loading: false, month }); } catch (error) { if (sequence === refreshSequence) set({ loading: false, error: error instanceof Error ? error.message : "Erro desconhecido" }); } },
  request: async (body, method = "POST") => { const response = await fetch("/api/finance", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const json = await response.json(); if (!response.ok) throw new Error(json.error || "Não foi possível salvar"); await get().refresh(); return json; }
}));
