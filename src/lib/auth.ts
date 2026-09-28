import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";

const COOKIE = "meu-caixa-session";
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "local-development-secret");

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret);
  cookies().set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" });
}

export function clearSession() { cookies().delete(COOKIE); }

export async function sessionUser() {
  const token = cookies().get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret);
      if (typeof payload.userId === "string") return prisma.user.findUnique({ where: { id: payload.userId } });
    } catch { /* token expired or invalid */ }
  }
  if (process.env.NODE_ENV !== "production") {
    return prisma.user.upsert({ where: { email: "local@meu-caixa.test" }, update: {}, create: { email: "local@meu-caixa.test", password: "local", name: "Usuário local" } });
  }
  return null;
}

export { COOKIE };
