import { NextResponse } from "next/server";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { registrarEventoSeguranca } from "@/lib/auditoria";

export const runtime = "nodejs";

/**
 * Guarda a inscricao push (endpoint + chaves) que o navegador do usuario
 * acabou de gerar via `pushManager.subscribe` (ver
 * `src/components/dashboard/NotificacoesPush.tsx`). Roda com a service role
 * -- mesmo padrao de `/api/trial/iniciar` -- porque o usuario-alvo vem sempre
 * do JWT validado, nunca de um campo no corpo da requisicao.
 *
 * Upsert por (usuario_id, endpoint): a mesma pessoa reativando notificacao
 * no mesmo navegador nao cria uma linha duplicada.
 */
export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }
  const { user } = autenticado;

  const { permitido } = await limitarRequisicoes("push-subscribe", {
    limite: 20,
    janelaSegundos: 3600,
    identificador: user.id,
  });
  if (!permitido) {
    return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });
  }

  let corpo: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }

  const endpoint = corpo?.endpoint;
  const p256dh = corpo?.keys?.p256dh;
  const auth = corpo?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ erro: "Inscricao push incompleta." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      usuario_id: user.id,
      endpoint,
      p256dh,
      auth,
    },
    { onConflict: "usuario_id,endpoint" }
  );

  if (error) {
    console.error("Erro ao salvar inscricao push:", error.message);
    return NextResponse.json({ erro: "Erro ao salvar inscricao." }, { status: 500 });
  }

  await registrarEventoSeguranca(user.id, "push_inscrito");

  return NextResponse.json({ ok: true });
}
