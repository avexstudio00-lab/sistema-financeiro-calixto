import { NextResponse } from "next/server";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { consultarPagamentosPorReferencia, type PagamentoAsaas } from "@/lib/asaas/client";
import { processarPagamentoConfirmado } from "@/lib/asaas/ativarAssinatura";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Reconciliação ATIVA do pagamento pendente do usuário logado: em vez de só
 * esperar o webhook do Asaas chamar /api/asaas/webhook (que pode demorar ou,
 * no Sandbox, nem disparar sozinho — ver contexto do projeto, sessão de
 * 21/set/2026), esta rota consulta o Asaas DIRETO pelo `externalReference`
 * (o id da própria linha "pendente" em `assinaturas`) e, se o pagamento já
 * estiver confirmado por lá, ativa o plano na hora — sem esperar o webhook.
 *
 * Chamada pelo front-end (tela /dashboard/plano) enquanto mostra a mensagem
 * de "confirmando pagamento" depois do redirect de volta do checkout, e
 * também sob demanda pelo botão "Verificar agora".
 *
 * Só olha a assinatura "pendente" mais recente do PRÓPRIO usuário logado
 * (nunca recebe um id de assinatura do corpo da requisição) — não dá pra
 * alguém consultar/ativar a assinatura de outra pessoa por aqui.
 */
export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) {
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  }
  const { supabase, user } = autenticado;

  // Rate limit generoso: o front chama isso a cada poucos segundos enquanto
  // aguarda a confirmação, então o limite precisa sobrar espaço de sobra
  // pra esse uso normal — só existe pra barrar abuso de verdade.
  const { permitido } = await limitarRequisicoes("verificar-pagamento", {
    limite: 30,
    janelaSegundos: 300,
    identificador: user.id,
  });
  if (!permitido) {
    return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });
  }

  // Busca com o client "como o usuário" (respeita RLS) — garante que só dá
  // pra achar uma linha "pendente" que seja mesmo do próprio usuário logado.
  const { data: linha, error: erroBusca } = await supabase
    .from("assinaturas")
    .select("id")
    .eq("usuario_id", user.id)
    .eq("status", "pendente")
    .eq("gateway", "asaas")
    .order("data_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (erroBusca) {
    return NextResponse.json({ erro: erroBusca.message }, { status: 500 });
  }

  if (!linha) {
    return NextResponse.json({ status: "sem_pendencia" });
  }

  let pagamentos: PagamentoAsaas[];
  try {
    pagamentos = await consultarPagamentosPorReferencia(linha.id);
  } catch (erro) {
    console.error(`Erro ao consultar pagamentos no Asaas pra assinatura ${linha.id}:`, erro);
    // Falha ao falar com o Asaas não é "pagamento recusado" — é só "não deu
    // pra checar agora". O front trata como "continua pendente" e tenta de
    // novo na próxima verificação.
    return NextResponse.json({ status: "pendente" });
  }

  const confirmado = pagamentos.find((p) => p.status === "CONFIRMED" || p.status === "RECEIVED");

  if (confirmado) {
    // A ativação em si precisa da chave service_role (o client "como o
    // usuário" não tem permissão de RLS pra marcar a própria assinatura como
    // "ativa" nem de trocar o próprio plano — de propósito, ver Finding #1
    // em src/lib/data/assinaturas.ts). A linha que vamos ativar já foi
    // confirmada acima como sendo do próprio usuário logado.
    const admin = supabaseAdmin();
    const ativouAgora = await processarPagamentoConfirmado(confirmado, admin);
    return NextResponse.json({ status: "ativado", jaEstavaAtivo: !ativouAgora });
  }

  return NextResponse.json({ status: "pendente" });
}
