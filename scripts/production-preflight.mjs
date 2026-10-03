const required = ["DATABASE_URL", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD", "APP_ORIGIN"];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) throw new Error(`Configuração de produção ausente: ${missing.join(", ")}`);

const placeholders = /replace_with|seu-dominio|example\.com|troque-esta/i;
for (const key of required) {
  if (placeholders.test(process.env[key])) throw new Error(`${key} ainda contém um valor de exemplo.`);
}

if (process.env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET precisa ter pelo menos 32 caracteres aleatórios.");
if (process.env.ADMIN_PASSWORD.length < 14) throw new Error("ADMIN_PASSWORD precisa ter pelo menos 14 caracteres.");

const origin = new URL(process.env.APP_ORIGIN);
if (origin.protocol !== "https:") throw new Error("APP_ORIGIN precisa usar HTTPS em produção.");

const database = new URL(process.env.DATABASE_URL);
if (database.protocol !== "postgresql:" || ["localhost", "127.0.0.1"].includes(database.hostname)) {
  throw new Error("DATABASE_URL precisa apontar para o PostgreSQL do Compose, pelo nome do serviço.");
}

if (Boolean(process.env.PLUGGY_CLIENT_ID) !== Boolean(process.env.PLUGGY_CLIENT_SECRET)) {
  throw new Error("Configure PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET juntos, ou deixe ambos vazios.");
}
for (const key of ["PLUGGY_WEBHOOK_SECRET", "BANK_SYNC_SECRET"]) {
  if (process.env[key] && process.env[key].length < 32) throw new Error(`${key} precisa ter pelo menos 32 caracteres aleatórios.`);
}

console.log("Configuração de produção validada.");
