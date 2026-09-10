import { NextResponse } from "next/server";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { DIAS_TRIAL, PLANO_TRIAL } from "@/lib/data/assinaturas";

export const runtime = "nodejs";

/**
 * Concede o trial grátis de `DIAS_TRIAL` dias no plano `PLANO_TRIAL` pro
 * usuário autenticado que está chamando.
 *
 * Roda com a service role (`supabaseAdmin`) de propósito — ver Finding #1
 * da revisão adversarial em `contexto-projeto-completo.md` seção 13/14: antes,
 * `iniciarTrial` escrevia direto do client (`status: "ativa"` numa linha de
 * `assinaturas`, mais `usuarios.plano` liberado na hora), o que — combinado
 * com o gap de RLS corrigido na mesma sessão — permitia qualquer usuário se
 * auto-conceder o trial (ou pior, qualquer plano pago) quantas vezes
 * quisesse, direto do navegador, sem passar por aqui. Agora a única forma
 * de uma linha em `assinaturas` nascer "ativa" é via service role: aqui, ou
 * no webhook do Asaas — nunca direto do client (mesmo padrão de
 * /api/asaas/checkout + /api/asaas/webhook).
 *
 * O usuário-alvo vem SEMPRE do token JWT validado por
 * `usuarioAutenticadoDaRequisicao` — nunca de um campo no corpo da
 * requisição — então ninguém pode pedir trial pra conta de outra pessoa.
 */
export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  const { user } = autenticado;
  const admin = supabaseAdmin();

  // Idempotência: nunca mais de um trial por usuário, nem numa corrida
  // entre duas chamadas simultâneas (ex.: duas abas fazendo login ao mesmo
  // tempo). Esta checagem evita a viagem extra no caso comum; quem garante
  // de verdade, mesmo sob corrida, é o índice único
  // `assinaturas_um_trial_por_usuario` no banco.
  const { data: trialExistente } = await admin
    .from("assinaturas")
    .select("id")
    .eq("usuario_id", user.id)
    .eq("gateway", "trial")
    .maybeSingle();

  if (trialExistente) {
    return NextResponse.json({ ok: true, jaTinhaTrial: true });
  }

  const agora = new Date();
  const fimTrial = new Date(agora.getTime() + DIAS_TRIAL * 24 * 60 * 60 * 1000);

  const { error: erroAssinatura } = await admin.from("assinaturas").insert({
    usuario_id: user.id,
    plano: PLANO_TRIAL,
    status: "ativa",
    gateway: "trial",
    data_inicio: agora.toISOString(),
    data_proximo_pagamento: fimTrial.toISOString(),
  });

  if (erroAssinatura) {
    // Código 23505 = violação do índice único: outra chamada concorrente já
    // criou o trial entre a checagem acima e este insert — não é erro de
    // verdade, é a proteção contra corrida funcionando como esperado.
    if (erroAssinatura.code !== "23505") {
      console.error("Erro ao iniciar trial:", erroAssinatura.message);
      return NextResponse.json({ ok: false, erro: erroAssinatura.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, jaTinhaTrial: true });
  }

  const { error: erroUsuario } = await admin
    .from("usuarios")
    .update({ plano: PLANO_TRIAL })
    .eq("id", user.id);
  if (erroUsuario) {
    console.error("Erro ao liberar plano do trial:", erroUsuario.message);
  }

  return NextResponse.json({ ok: true });
}
