import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

const COOKIE = "meu-caixa-session";
function sessionSecret() {
  const configuredSecret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production" && !configuredSecret) {
    throw new Error("JWT_SECRET precisa estar configurado em produção");
  }
  return new TextEncoder().encode(configuredSecret || "local-development-secret");
}
const scrypt = promisify(scryptCallback);
const secureCookie = process.env.SESSION_COOKIE_SECURE
  ? process.env.SESSION_COOKIE_SECURE === "true"
  : process.env.NODE_ENV === "production";

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  if (!stored.startsWith("scrypt$")) return stored === password;
  const [, salt, expectedHex] = stored.split("$");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(sessionSecret());
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookie, maxAge: 60 * 60 * 24 * 7, path: "/" });
}

export async function clearSession() { (await cookies()).delete(COOKIE); }

export async function sessionUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, sessionSecret());
      if (typeof payload.userId === "string") return prisma.user.findUnique({ where: { id: payload.userId } });
    } catch { /* token expired or invalid */ }
  }
  if (process.env.NODE_ENV !== "production") {
    return prisma.user.upsert({ where: { email: "local@meu-caixa.test" }, update: {}, create: { email: "local@meu-caixa.test", password: "local", name: "Usuário local" } });
  }
  return null;
}

export { COOKIE };
