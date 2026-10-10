import { NextResponse } from "next/server";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { registrarEventoSeguranca } from "@/lib/auditoria";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { z } from "zod";

const esquema = z.object({ endpoint: z.string().url().max(2048) }).strict();

export const runtime = "nodejs";

/** Remove a inscricao push deste navegador -- chamado quando a pessoa
 * desativa notificacoes em `NotificacoesPush.tsx`. Rate limit folgado (30/h) so
 * pra conter abuso; validacao Zod no corpo (item 2.5). */
export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }
  const { user } = autenticado;

  const { permitido } = await limitarRequisicoes("push-unsubscribe", { limite: 30, janelaSegundos: 3600, identificador: user.id });
  if (!permitido) {
    return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });
  }

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }
  const validado = esquema.safeParse(bruto);
  if (!validado.success) {
    return NextResponse.json({ erro: "Endpoint nao informado." }, { status: 400 });
  }
  const corpo = validado.data;

  const admin = supabaseAdmin();
  // Sempre filtrado por usuario_id (nao so endpoint) -- ninguem pode apagar
  // a inscricao de outra pessoa mesmo que descubra/adivinhe o endpoint dela.
  await admin.from("push_subscriptions").delete().eq("usuario_id", user.id).eq("endpoint", corpo.endpoint);

  await registrarEventoSeguranca(user.id, "push_cancelado");

  return NextResponse.json({ ok: true });
}
