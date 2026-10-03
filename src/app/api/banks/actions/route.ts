import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { BankError, bankId } from "@/lib/bank-domain";
import { bankBody, bankFailure, bankJson, bankUser } from "@/lib/bank-http";
import { pluggy } from "@/lib/pluggy";
import { connectBank, syncBank } from "@/lib/bank-sync";
import { reviewBankMovement } from "@/lib/bank-review";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  try {
    const user = await bankUser(request, true);
    const body = await bankBody(request);
    if (body.action === "connect") return bankJson({ id: await connectBank(user.id, bankId(body.itemId)) });
    if (body.action === "review") { await reviewBankMovement(user.id, body); return bankJson({ ok: true }); }
    const connection = await prisma.bankConnection.findFirst({ where: { id: bankId(body.connectionId), userId: user.id } });
    if (!connection) throw new BankError("Conexão não encontrada.", 404);
    if (body.action === "sync") return bankJson(await syncBank(connection, body.refresh === true));
    if (body.action === "disconnect") {
      // Preserva o histórico conferido; interrompe a coleta no provedor.
      if (connection.enabled) await pluggy(`/items/${connection.itemId}`, "DELETE");
      await prisma.bankConnection.update({ where: { id: connection.id }, data: { enabled: false, status: "DISCONNECTED", syncError: null } });
      return bankJson({ ok: true });
    }
    throw new BankError("Ação inválida.");
  } catch (error) { return bankFailure(error); }
}
