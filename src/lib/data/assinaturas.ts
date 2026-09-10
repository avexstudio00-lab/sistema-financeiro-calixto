import { supabase } from "@/lib/supabase/client";
import type { Plano } from "@/lib/planos";

/** Duração do trial grátis dado no cadastro, em dias. */
export const DIAS_TRIAL = 7;

/** Plano liberado durante o trial grátis do cadastro. */
export const PLANO_TRIAL: Plano = "clt";

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

/**
 * Dá o trial grátis de `DIAS_TRIAL` dias no plano `PLANO_TRIAL`, sem
 * checkout nem cartão — chamado uma única vez, na criação da conta (ver
 * `signUp`/`signIn` em AuthProvider.tsx).
 *
 * A ativação de verdade acontece em /api/trial/iniciar, com a service role
 * — NUNCA escrevendo `status: "ativa"` direto do client. Ver Finding #1 da
 * revisão adversarial (contexto-projeto-completo.md seção 13): a versão
 * anterior desta função fazia exatamente isso (insert direto em
 * `assinaturas` + update direto em `usuarios.plano` pelo client comum), o
 * que — combinado com o gap de RLS corrigido na mesma sessão — permitia
 * qualquer usuário autenticado se auto-conceder o trial (ou qualquer plano
 * pago) quantas vezes quisesse, só replicando a chamada.
 *
 * Esta função aqui só chama a rota e nunca lança erro — pior caso (rota
 * fora do ar, sem sessão etc.), a conta segue no Grátis normalmente
 * (comportamento de antes do trial existir), sem travar cadastro/login.
 */
export async function iniciarTrial(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  try {
    const resposta = await fetch("/api/trial/iniciar", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => null);
      console.error("Erro ao iniciar trial:", corpo?.erro ?? `HTTP ${resposta.status}`);
    }
  } catch (erro) {
    console.error("Erro ao iniciar trial:", erro);
  }
}

/**
 * Verificação "preguiçosa" do trial, mesmo padrão de
 * `gerarLancamentosPendentes` em `contasFixas.ts`: roda a cada carregamento
 * de perfil (ver `AuthProvider.carregarPerfil`) e, se o trial ativo do
 * usuário já passou da data de expiração, marca a assinatura como
 * "expirada" e volta `usuarios.plano` pra "gratis". Devolve `true` quando
 * algo expirou agora de fato, pra quem chamou saber que precisa reler o
 * perfil atualizado.
 */
export async function verificarExpiracaoTrial(usuarioId: string): Promise<boolean> {
  const { data: trialAtivo } = await supabase
    .from("assinaturas")
    .select("id, data_proximo_pagamento")
    .eq("usuario_id", usuarioId)
    .eq("gateway", "trial")
    .eq("status", "ativa")
    .maybeSingle();

  if (!trialAtivo || !trialAtivo.data_proximo_pagamento) return false;
  if (new Date(trialAtivo.data_proximo_pagamento).getTime() > Date.now()) return false;

  await supabase.from("assinaturas").update({ status: "expirada" }).eq("id", trialAtivo.id);

  // Só rebaixa pra "gratis" se `usuarios.plano` ainda for o plano do
  // trial — se a pessoa já assinou de verdade por cima do trial (upgrade
  // no meio do período), o plano pago não pode ser derrubado aqui.
  await supabase
    .from("usuarios")
    .update({ plano: "gratis" })
    .eq("id", usuarioId)
    .eq("plano", PLANO_TRIAL);

  return true;
}

/**
 * Quantos dias faltam pro fim do trial (arredondado pra cima), ou `null`
 * se a assinatura passada não for um trial ativo. Uso só de exibição — a
 * expiração de verdade é feita por `verificarExpiracaoTrial`.
 */
export function diasRestantesTrial(
  assinatura: { gateway?: string; status?: string; data_proximo_pagamento?: string | null } | null | undefined
): number | null {
  if (!assinatura || assinatura.gateway !== "trial" || assinatura.status !== "ativa") return null;
  if (!assinatura.data_proximo_pagamento) return null;
  const ms = new Date(assinatura.data_proximo_pagamento).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
