import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { BankError, bankId } from "@/lib/bank-domain";
import { bankBody, bankFailure, bankJson, bankUser } from "@/lib/bank-http";
import { bankConfigured, bankSandbox, pageList, pluggy } from "@/lib/pluggy";

export const dynamic = "force-dynamic";
const cooldowns = new Map<string, number>();
export async function POST(request: NextRequest) {
  try {
    const user = await bankUser(request, true);
    if (!bankConfigured()) throw new BankError("Faltam as chaves da Pluggy no servidor. Veja as instruções na tela Bancos.", 503);
    if ((cooldowns.get(user.id) || 0) > Date.now()) throw new BankError("Aguarde alguns segundos antes de abrir outra conexão.", 429);
    if (cooldowns.size > 2000) for (const [id, expires] of cooldowns) if (expires < Date.now()) cooldowns.delete(id);
    cooldowns.set(user.id, Date.now() + 15000);
    const body = await bankBody(request);
    const connection = body.connectionId ? await prisma.bankConnection.findFirst({ where: { id: bankId(body.connectionId), userId: user.id } }) : null;
    if (body.connectionId && !connection) throw new BankError("Conexão não encontrada.", 404);
    if (connection && !connection.enabled) throw new BankError("Conexão desconectada. Adicione o banco novamente.");
    if (!connection && await prisma.bankConnection.count({ where: { userId: user.id, enabled: true } }) >= 10) throw new BankError("Limite de dez instituições conectadas.");
    const connectors = await pageList(`/connectors?countries=BR&isOpenFinance=true&sandbox=${bankSandbox()}`);
    const connectorIds = connectors.filter(row => row.isOpenFinance && (bankSandbox() || !row.isSandbox)).map(row => row.id);
    if (!connectorIds.length) throw new BankError("O provedor não liberou instituições Open Finance para este plano.", 503);
    const token = await pluggy("/connect_token", "POST", { ...(connection ? { itemId: connection.itemId } : {}), options: { clientUserId: user.id, avoidDuplicates: true } });
    if (typeof token.accessToken !== "string") throw new BankError("Token bancário inválido.", 502);
    return bankJson({ accessToken: token.accessToken, connectorIds, itemId: connection?.itemId, sandbox: bankSandbox() });
  } catch (error) { return bankFailure(error); }
}
