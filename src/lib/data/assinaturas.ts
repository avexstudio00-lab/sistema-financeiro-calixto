import { supabase } from "@/lib/supabase/client";
import type { Plano } from "@/lib/planos";

/**
 * Inicia a assinatura de um plano pago de verdade via Asaas: chama a Route
 * Handler /api/asaas/checkout (que cria o checkout hospedado no Asaas e a
 * linha "pendente" em `assinaturas`) e devolve a URL do checkout para
 * redirecionar o usuário. A ativação de fato (status "ativa", plano
 * liberado) só acontece depois, quando o pagamento é confirmado e o
 * webhook do Asaas chama /api/asaas/webhook — não é síncrono com esta
 * chamada.
 */
export async function iniciarCheckoutAssinatura(plano: Exclude<Plano, "gratis">): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Você precisa estar logado.");

  const resposta = await fetch("/api/asaas/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ plano }),
  });

  const corpo = await resposta.json();
  if (!resposta.ok) {
    throw new Error(corpo?.erro ?? "Não foi possível iniciar o checkout.");
  }

  return corpo.checkoutUrl as string;
}

/**
 * Cancela a(s) assinatura(s) ativa(s) do usuário de verdade no Asaas (via
 * Route Handler /api/asaas/cancelar) e no banco, e volta o usuário para o
 * plano Grátis.
 */
export async function cancelarAssinaturaReal(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Você precisa estar logado.");

  const resposta = await fetch("/api/asaas/cancelar", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  // A rota sempre devolve um campo "ok" explícito no corpo — inclusive numa
  // resposta HTTP 207 (sucesso parcial: algumas assinaturas cancelaram,
  // outras não), que `resposta.ok` sozinho não distingue de um 200 normal
  // (Response.ok é true pra qualquer status 2xx). É o "ok" do corpo que diz
  // se cancelou de verdade tudo.
  const corpo = await resposta.json();
  if (!corpo?.ok) {
    throw new Error(corpo?.erro ?? "Não foi possível cancelar a assinatura.");
  }
}

/**
 * Assinatura "atual" pra mostrar na tela de plano: prioriza a que está
 * "ativa" (é a que está cobrando de verdade), não simplesmente a mais
 * recente por data — senão uma tentativa de checkout abandonada pra outro
 * plano (linha "pendente" mais nova) esconderia a assinatura ativa de
 * verdade e faria até o botão "Cancelar assinatura" sumir da tela.
 */
export async function ultimaAssinatura(usuarioId: string) {
  const { data: ativa } = await supabase
    .from("assinaturas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("status", "ativa")
    .order("data_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ativa) return ativa;

  const { data: maisRecente } = await supabase
    .from("assinaturas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("data_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  return maisRecente;
}
