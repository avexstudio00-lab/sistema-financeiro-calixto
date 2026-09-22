import { NextResponse } from "next/server";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { registrarEventoSeguranca } from "@/lib/auditoria";

export const runtime = "nodejs";

/** Remove a inscricao push deste navegador -- chamado quando a pessoa
 * desativa notificacoes em `NotificacoesPush.tsx`. Sem rate limit: e uma
 * acao de "desligar", nunca vale a pena bloquear. */
export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }
  const { user } = autenticado;

  let corpo: { endpoint?: string };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }

  if (!corpo?.endpoint) {
    return NextResponse.json({ erro: "Endpoint nao informado." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  // Sempre filtrado por usuario_id (nao so endpoint) -- ninguem pode apagar
  // a inscricao de outra pessoa mesmo que descubra/adivinhe o endpoint dela.
  await admin.from("push_subscriptions").delete().eq("usuario_id", user.id).eq("endpoint", corpo.endpoint);

  await registrarEventoSeguranca(user.id, "push_cancelado");

  return NextResponse.json({ ok: true });
}
