import { supabase } from "@/lib/supabase/client";
import type { Plano } from "@/lib/planos";

/** Ao sair do plano Grupo (trocar de plano ou cancelar), revoga na hora o
 * acesso de quem foi convidado — marca os convites pendentes/ativos como
 * "removido". Sem isso, sócio/funcionário continuariam com acesso aos
 * dados do negócio no banco mesmo depois de o dono parar de pagar pelo
 * compartilhamento (o RLS só olha se o vínculo está "ativo", não o plano
 * atual). Não falha a troca de plano se isso der erro — só não deixa
 * silenciosamente sem tentar. */
async function revogarCompartilhamentoSeSaiuDoGrupo(usuarioId: string, planoNovo: Plano) {
  if (planoNovo === "grupo") return;
  await supabase
    .from("membros")
    .update({ status: "removido" })
    .eq("conta_mestre_id", usuarioId)
    .in("status", ["pendente", "ativo"]);
}

// Não há gateway de pagamento (Stripe/Mercado Pago) configurado ainda — esta função
// simula a confirmação de pagamento e já deixa o fluxo pronto para plugar um gateway
// real no futuro (troque o corpo desta função pela chamada ao checkout do gateway).
export async function assinarPlano(usuarioId: string, plano: Plano) {
  const agora = new Date();
  const proximoPagamento = new Date(agora);
  proximoPagamento.setMonth(proximoPagamento.getMonth() + 1);

  await supabase.from("usuarios").update({ plano }).eq("id", usuarioId);
  await revogarCompartilhamentoSeSaiuDoGrupo(usuarioId, plano);

  return supabase
    .from("assinaturas")
    .insert({
      usuario_id: usuarioId,
      plano,
      status: "ativa",
      data_inicio: agora.toISOString(),
      data_proximo_pagamento: proximoPagamento.toISOString(),
      id_pagamento_externo: `simulado_${Date.now()}`,
    })
    .select()
    .single();
}

export async function cancelarAssinatura(usuarioId: string) {
  await supabase
    .from("assinaturas")
    .update({ status: "cancelada" })
    .eq("usuario_id", usuarioId)
    .eq("status", "ativa");

  // Ao cancelar, o usuário volta para o plano Grátis imediatamente (fluxo simplificado,
  // sem gateway de pagamento real ainda controlando o fim do ciclo já pago).
  await supabase.from("usuarios").update({ plano: "gratis" }).eq("id", usuarioId);
  await revogarCompartilhamentoSeSaiuDoGrupo(usuarioId, "gratis");
}

export async function ultimaAssinatura(usuarioId: string) {
  const { data } = await supabase
    .from("assinaturas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("data_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
