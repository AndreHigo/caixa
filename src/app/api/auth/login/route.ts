import { NextRequest, NextResponse } from "next/server";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origem não autorizada" }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password || password.length > 200) {
    return NextResponse.json({ error: "Informe e-mail e senha" }, { status: 400 });
  }

  const expectedEmail = process.env.ADMIN_EMAIL || "admin@local.test";
  const expectedPassword = process.env.ADMIN_PASSWORD || "troque-esta-senha";
  let user = await prisma.user.findUnique({ where: { email: expectedEmail } });
  if (!user) {
    user = await prisma.user.create({ data: { email: expectedEmail, password: await hashPassword(expectedPassword), name: "Usuário principal" } });
  }

  const valid = email === user.email && await verifyPassword(password, user.password);
  if (!valid) return NextResponse.json({ error: "E-mail ou senha inválidos" }, { status: 401 });

  if (!user.password.startsWith("scrypt$")) {
    user = await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(password) } });
  }
  await createSession(user.id); return NextResponse.json({ ok: true, name: user.name });
}
