// O Next.js pode usar localhost internamente mesmo quando o navegador usa 127.0.0.1.
// Host vem da requisição HTTP; não confiamos em X-Forwarded-Host fornecido pelo cliente.
export function sameOrigin(headers: Headers, fallbackOrigin: string) {
  if (headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = headers.get("origin");
  if (!origin) return true; // clientes server-to-server continuam sujeitos à autenticação
  try {
    const supplied = new URL(origin);
    if (!["http:", "https:"].includes(supplied.protocol) || supplied.origin !== origin) return false;
    if (process.env.APP_ORIGIN) return supplied.origin === new URL(process.env.APP_ORIGIN).origin;
    const host = headers.get("host") || new URL(fallbackOrigin).host;
    return supplied.host.toLowerCase() === host.toLowerCase();
  } catch { return false; }
}
