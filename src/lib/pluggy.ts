import { BankError, nextTransactionPath } from "./bank-domain";

const API = "https://api.pluggy.ai";
let cachedKey: { value: string; expiresAt: number } | undefined;
let authPending: Promise<string> | undefined;

export const bankConfigured = () => Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
export const bankSandbox = () => process.env.PLUGGY_SANDBOX === "true";

async function apiKey() {
  if (!bankConfigured()) throw new BankError("Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET no servidor para conectar seu banco.", 503);
  if (cachedKey && cachedKey.expiresAt > Date.now()) return cachedKey.value;
  if (!authPending) {
    authPending = (async () => {
      const response = await fetch(`${API}/auth`, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }),
      });
      if (!response.ok) throw new BankError("Não foi possível autenticar o provedor. Confira as credenciais e o plano Open Finance.", 502);
      const data = await response.json();
      if (typeof data.apiKey !== "string") throw new BankError("Resposta inválida do provedor bancário.", 502);
      cachedKey = { value: data.apiKey, expiresAt: Date.now() + 90 * 60 * 1000 };
      return data.apiKey as string;
    })();
  }
  try { return await authPending; } finally { authPending = undefined; }
}

export async function pluggy(path: string, method = "GET", body?: unknown, retry = true): Promise<any> {
  if (!/^\/(auth|connect_token|connectors|items|accounts|bills|v2\/transactions)(\/|\?|$)/.test(path)) throw new BankError("Recurso bancário inválido.");
  let response: Response;
  try {
    const key = await apiKey();
    response = await fetch(`${API}${path}`, {
      method, headers: { "Content-Type": "application/json", "X-API-KEY": key },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000),
    });
  } catch (error) {
    if (error instanceof BankError) throw error;
    throw new BankError("O provedor bancário demorou a responder. Tente novamente.", 502);
  }
  if (response.status === 401 && retry) { cachedKey = undefined; return pluggy(path, method, body, false); }
  if (!response.ok) throw new BankError(response.status === 429
    ? "O banco limitou as atualizações. Aguarde antes de sincronizar novamente."
    : "Não foi possível consultar o banco. Confira a conexão e a autorização.", response.status === 429 ? 429 : 502);
  if (response.status === 204) return null;
  return response.json();
}

export async function pageList(path: string) {
  const rows: Record<string, any>[] = [];
  for (let page = 1; page <= 50; page++) {
    const data = await pluggy(`${path}${path.includes("?") ? "&" : "?"}page=${page}&pageSize=500`);
    if (!Array.isArray(data.results)) throw new BankError("Lista bancária inválida.", 502);
    rows.push(...data.results);
    if (!data.totalPages || page >= data.totalPages) return rows;
  }
  throw new BankError("A conta excedeu o volume de uma sincronização.", 502);
}

export async function transactionList(accountId: string) {
  let path = `/v2/transactions?accountId=${encodeURIComponent(accountId)}`;
  const rows: Record<string, any>[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < 100; page++) {
    if (seen.has(path)) throw new BankError("O banco repetiu uma página do extrato.", 502);
    seen.add(path);
    const data = await pluggy(path);
    if (!Array.isArray(data.results)) throw new BankError("Extrato bancário inválido.", 502);
    rows.push(...data.results);
    if (!data.next) return rows;
    path = nextTransactionPath(data.next, accountId);
  }
  throw new BankError("O extrato excedeu o volume de uma sincronização.", 502);
}
