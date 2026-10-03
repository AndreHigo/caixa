import { createHash, timingSafeEqual } from "node:crypto";

export class BankError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function secretMatches(actual: string | null, expected: string | undefined) {
  if (!actual || !expected || expected.length < 32) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function bankId(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(value)) throw new BankError("Identificador inválido.");
  return value;
}

export function bankMonth(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new BankError("Mês inválido.");
  return value;
}

export function bankDate(value: unknown) {
  if (typeof value !== "string") throw new BankError("O banco retornou uma data inválida.", 502);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new BankError("O banco retornou uma data inválida.", 502);
  return date;
}

export function bankCents(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new BankError("O banco retornou um valor inválido.", 502);
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > 2147483647) throw new BankError("Valor bancário fora do intervalo suportado.", 502);
  return cents;
}

export function bankCurrency(value: unknown) {
  const code = String(value || "BRL").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new BankError("O banco retornou uma moeda inválida.", 502);
  return code;
}

export function guessCategory(description: string, category?: string | null) {
  const value = `${description} ${category || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/farmacia|drogaria|saude|health|pharmac/.test(value)) return "Saúde";
  if (/gasolina|combust|posto|fuel|transport|uber|pneu|oficina/.test(value)) return "Transporte";
  if (/mercado|supermerc|grocery|grocer/.test(value)) return "Mercado";
  if (/aluguel|energia|energisa|agua|saneamento|utilities|rent/.test(value)) return "Casa";
  if (/chatgpt|netflix|spotify|subscription|assinatura|celular|internet/.test(value)) return "Assinaturas";
  if (/restaurante|lanchonete|cinema|entertainment/.test(value)) return "Lazer";
  return null;
}

export function normalizeTransaction(raw: Record<string, any>, accountType: string) {
  const description = String(raw.description || "Movimentação bancária").slice(0, 200);
  const cents = bankCents(raw.amountInAccountCurrency ?? raw.amount);
  // O sinal dos cartões é invertido em relação à conta corrente.
  const direction = raw.type === "DEBIT" ? "EXPENSE" : raw.type === "CREDIT" ? "INCOME"
    : accountType === "CREDIT" ? (cents >= 0 ? "EXPENSE" : "INCOME") : (cents < 0 ? "EXPENSE" : "INCOME");
  const metadata = raw.creditCardMetadata || {};
  return {
    externalId: bankId(raw.id),
    stableKey: raw.providerId ? `provider:${createHash("sha256").update(String(raw.providerId)).digest("hex")}` : `pluggy:${bankId(raw.id)}`,
    description, date: bankDate(raw.date), amountCents: Math.abs(cents), direction,
    currency: bankCurrency(raw.amountInAccountCurrency != null ? raw.accountCurrencyCode : raw.currencyCode),
    status: raw.status === "POSTED" ? "POSTED" : "PENDING",
    providerCategory: raw.category ? String(raw.category).slice(0, 160) : null,
    suggestedCategory: guessCategory(description, raw.category),
    operationType: raw.operationType ? String(raw.operationType).slice(0, 100) : null,
    billExternalId: metadata.billId ? String(metadata.billId).slice(0, 120) : null,
    installmentNumber: Number.isInteger(metadata.installmentNumber) && metadata.installmentNumber > 0 ? metadata.installmentNumber : null,
    totalInstallments: Number.isInteger(metadata.totalInstallments) && metadata.totalInstallments > 0 ? metadata.totalInstallments : null,
    referenceMonth: metadata.billForecastDate && /^\d{4}-(0[1-9]|1[0-2])/.test(String(metadata.billForecastDate)) ? String(metadata.billForecastDate).slice(0, 7) : null,
  };
}

// O cursor é uma query do provedor, nunca uma URL arbitrária enviada ao servidor.
export function nextTransactionPath(next: unknown, accountId: string) {
  if (typeof next !== "string" || !next.startsWith("?") || next.length > 4000 || /[#\r\n\0]/.test(next)) throw new BankError("Cursor bancário inválido.", 502);
  const query = new URLSearchParams(next);
  if (query.getAll("accountId").length !== 1 || query.get("accountId") !== accountId) throw new BankError("Cursor retornou outra conta.", 502);
  return `/v2/transactions${next}`; // cursor opaco: preservar a query exatamente como veio
}

export function assertItemOwner(item: Record<string, any>, userId: string, allowSandbox: boolean) {
  if (item.clientUserId !== userId) throw new BankError("Esta conexão não pertence ao seu usuário.", 403);
  if (!item.connector?.isOpenFinance) throw new BankError("Escolha uma conexão regulamentada de Open Finance.");
  if (item.connector?.isSandbox && !allowSandbox) throw new BankError("Uma conexão de teste não pode ser usada como banco real.");
}
