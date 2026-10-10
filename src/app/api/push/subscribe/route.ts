import { NextResponse } from "next/server";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { registrarEventoSeguranca } from "@/lib/auditoria";
import { z } from "zod";

const esquemaInscricao = z
  .object({
    endpoint: z.string().url().startsWith("https://").max(2048),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }).strict(),
  })
  .strict();

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

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo invalido." }, { status: 400 });
  }
  // Item 2.5 (09/out/2026): validação estrita de esquema com Zod.
  const validado = esquemaInscricao.safeParse(bruto);
  if (!validado.success) {
    return NextResponse.json({ erro: "Inscricao push incompleta." }, { status: 400 });
  }
  const { endpoint } = validado.data;
  const { p256dh, auth } = validado.data.keys;

  const admin = supabaseAdmin();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      usuario_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300) || null,
      atualizado_em: new Date().toISOString(),
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
