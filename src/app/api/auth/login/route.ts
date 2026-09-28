import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();
  const expectedEmail = process.env.ADMIN_EMAIL || "admin@local.test";
  const expectedPassword = process.env.ADMIN_PASSWORD || "troque-esta-senha";
  const user = await prisma.user.upsert({ where: { email: expectedEmail }, update: {}, create: { email: expectedEmail, password: expectedPassword, name: "Usuário principal" } });
  if (email !== user.email || password !== user.password) return NextResponse.json({ error: "E-mail ou senha inválidos" }, { status: 401 });
  await createSession(user.id); return NextResponse.json({ ok: true, name: user.name });
}
