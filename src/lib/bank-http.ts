import { NextRequest, NextResponse } from "next/server";
import { sessionUser } from "./auth";
import { BankError } from "./bank-domain";
import { sameOrigin } from "./origin";

export async function bankUser(request: NextRequest, mutation = false) {
  if (mutation) {
    if (!sameOrigin(request.headers, request.nextUrl.origin)) throw new BankError("Requisição não autorizada.", 403);
  }
  const user = await sessionUser();
  if (!user) throw new BankError("Sessão necessária", 401);
  return user;
}

export function bankJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function bankFailure(error: unknown) {
  return bankJson({ error: error instanceof BankError ? error.message : "Não foi possível concluir a operação bancária. Tente novamente." }, error instanceof BankError ? error.status : 500);
}

export async function bankBody(request: NextRequest) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 16384) throw new BankError("Requisição muito grande.", 413);
  try {
    const body = JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error();
    return body as Record<string, any>;
  } catch { throw new BankError("Requisição inválida."); }
}
