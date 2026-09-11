import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { usuarioAutenticadoDaRequisicao } from "@/lib/supabase/admin";
import { cancelarAssinaturaAsaas } from "@/lib/asaas/client";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { registrarEventoSeguranca } from "@/lib/auditoria";

export const runtime = "nodejs";

/** Mesma regra de "pessoal é pessoal" de src/lib/data/assinaturas.ts: ao
 * sair do plano Grupo, revoga na hora o acesso de sócio/funcionário. */
async function revogarCompartilhamento(supabase: SupabaseClient, usuarioId: string) {
  const { error } = await supabase
    .from("membros")
    .update({ status: "removido" })
    .eq("conta_mestre_id", usuarioId)
    .in("status", ["pendente", "ativo"]);
  // Revogação de acesso não pode falhar em silêncio: se isso não funcionar,
  // sócio/funcionário continuam com acesso aos dados do negócio mesmo
  // depois do plano Grupo ser cancelado.
  if (error) console.error(`Falha ao revogar compartilhamento do usuário ${usuarioId}:`, error);
}

/**
 * Cancela a assinatura real do usuário logado.
 *
 * Correção do Finding #2 (revisão adversarial, ver contexto do projeto
 * seção 6): a versão anterior atualizava `status='cancelada'` filtrando só
 * por `usuario_id + status='ativa'` com `.limit(1)` — se por algum motivo
 * existisse mais de uma linha "ativa" (ex: uma corrida entre checkouts),
 * sobrava assinatura cobrando de verdade no Asaas enquanto o banco já
 * mostrava tudo cancelado. Agora: busca TODAS as linhas ativas do usuário,
 * cancela cada uma no Asaas, e só marca cancelada no banco filtrando pelo
 * `id` da própria linha que acabou de ser cancelada — nunca por um filtro
 * genérico que possa acertar a linha errada (mesmo padrão já usado em
 * processarPagamentoConfirmado do webhook).
 */
export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  const { supabase, user } = autenticado;

  // Rate limit: cancelamento é uma ação rara — 5 tentativas a cada 5
  // minutos é mais que suficiente pra um usuário de verdade (inclusive se
  // a primeira tentativa falhar parcialmente e ele tentar de novo).
  const { permitido } = await limitarRequisicoes("cancelar", {
    limite: 5,
    janelaSegundos: 300,
    identificador: user.id,
  });
  if (!permitido) {
    await registrarEventoSeguranca(user.id, "cancelamento_rate_limitado");
    return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });
  }

  const { data: assinaturasAtivas, error: erroBusca } = await supabase
    .from("assinaturas")
    .select("id, gateway, asaas_subscription_id")
    .eq("usuario_id", user.id)
    .eq("status", "ativa");

  if (erroBusca) {
    return NextResponse.json({ erro: erroBusca.message }, { status: 500 });
  }

  if (!assinaturasAtivas || assinaturasAtivas.length === 0) {
    return NextResponse.json({ ok: true, canceladas: 0 });
  }

  const falhas: string[] = [];
  let canceladas = 0;

  for (const linha of assinaturasAtivas) {
    try {
      if (linha.gateway === "asaas" && linha.asaas_subscription_id) {
        await cancelarAssinaturaAsaas(linha.asaas_subscription_id);
      }
      // Atualiza SEMPRE pelo id desta linha específica — nunca por um
      // filtro genérico de usuario_id+status que possa pegar outra linha.
      const { error: erroUpdate } = await supabase
        .from("assinaturas")
        .update({ status: "cancelada" })
        .eq("id", linha.id);
      if (erroUpdate) throw erroUpdate;
      canceladas += 1;
    } catch (erro) {
      falhas.push(linha.id as string);
      console.error(`Erro ao cancelar assinatura ${linha.id}:`, erro);
    }
  }

  // Só rebaixa pro plano Grátis e revoga sócio/funcionário se TODAS as
  // assinaturas ativas foram mesmo canceladas no Asaas. Se alguma falhou,
  // o Asaas continua cobrando por ela — tirar o acesso do usuário (que
  // continua pagando) ou expulsar a equipe sem necessidade seria pior que
  // não fazer nada; melhor deixar como está e reportar o erro pro usuário
  // tentar de novo.
  if (falhas.length > 0) {
    return NextResponse.json(
      { ok: false, canceladas, falhas, erro: "Algumas assinaturas não puderam ser canceladas no Asaas. Tente novamente." },
      { status: 207 },
    );
  }

  await supabase.from("usuarios").update({ plano: "gratis" }).eq("id", user.id);
  await revogarCompartilhamento(supabase, user.id);
  await registrarEventoSeguranca(user.id, "assinatura_cancelada", { canceladas });

  return NextResponse.json({ ok: true, canceladas });
}
