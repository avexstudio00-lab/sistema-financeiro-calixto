import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cancelarAssinaturaAsaas } from "@/lib/asaas/client";
import { PLANOS, type Plano } from "@/lib/planos";
import { registrarEventoSeguranca } from "@/lib/auditoria";

// Sem rate limit nesta rota de propósito: quem chama é o próprio Asaas
// (server-to-server, protegido pelo token compartilhado abaixo, não pelo
// usuário final), e bloquear uma reentrega legítima de webhook seria pior
// do que o risco que o rate limiting resolve nas outras rotas.

export const runtime = "nodejs";

interface EventoAsaas {
  id: string;
  event: string;
  payment?: {
    id: string;
    customer: string;
    subscription?: string;
    value: number;
    status: string;
    externalReference?: string;
    dueDate?: string;
  };
  subscription?: {
    id: string;
    customer: string;
  };
}

/** Soma um mês a uma data "grudando" no último dia do mês de destino quando
 * necessário (ex: 31/jan + 1 mês = 28 ou 29/fev, nunca 2-3/mar) — usar
 * `date.setMonth(date.getMonth()+1)` direto rola pro mês seguinte quando o
 * mês de destino tem menos dias que o de origem. Só afeta a data de
 * "próxima cobrança" mostrada na UI (quem cobra de verdade é o Asaas). */
function adicionarUmMes(data: Date): Date {
  const resultado = new Date(data);
  const diaOriginal = resultado.getDate();
  resultado.setDate(1);
  resultado.setMonth(resultado.getMonth() + 1);
  const ultimoDiaDoMesDestino = new Date(resultado.getFullYear(), resultado.getMonth() + 1, 0).getDate();
  resultado.setDate(Math.min(diaOriginal, ultimoDiaDoMesDestino));
  return resultado;
}

/** Mesma regra de "pessoal é pessoal" das outras rotas — ver
 * src/lib/data/assinaturas.ts para o original client-side. */
async function revogarCompartilhamento(supabase: SupabaseClient, usuarioId: string) {
  const { error } = await supabase
    .from("membros")
    .update({ status: "removido" })
    .eq("conta_mestre_id", usuarioId)
    .in("status", ["pendente", "ativo"]);
  // Revogação de acesso não pode falhar em silêncio: se isso não funcionar,
  // sócio/funcionário continuam com acesso aos dados do negócio mesmo
  // depois do plano Grupo acabar.
  if (error) console.error(`Falha ao revogar compartilhamento do usuário ${usuarioId}:`, error);
}

/** Cancela (no Asaas, se aplicável, e no banco) todas as OUTRAS assinaturas
 * ainda ativas do usuário além da que acabou de ser ativada por `manterId`
 * — nunca duas cobranças recorrentes ao mesmo tempo, mesma regra do
 * cancelamento manual em /api/asaas/cancelar. Usa o mesmo padrão seguro de
 * atualizar sempre pelo `id` de cada linha (Finding #2). */
async function cancelarOutrasAssinaturasAtivas(supabase: SupabaseClient, usuarioId: string, manterId: string) {
  const { data: outras } = await supabase
    .from("assinaturas")
    .select("id, gateway, asaas_subscription_id")
    .eq("usuario_id", usuarioId)
    .eq("status", "ativa")
    .neq("id", manterId);

  for (const linha of outras ?? []) {
    try {
      if (linha.gateway === "asaas" && linha.asaas_subscription_id) {
        await cancelarAssinaturaAsaas(linha.asaas_subscription_id);
      }
      // Só marca "cancelada" no banco DEPOIS de confirmar que o cancelamento
      // no Asaas funcionou (ou não era necessário) — nunca antes. Se o
      // update ficasse fora deste try, uma falha na chamada ao Asaas ainda
      // assim marcaria a linha como cancelada no banco, e o Asaas
      // continuaria cobrando essa assinatura todo mês sem que o app
      // soubesse — exatamente a duplicidade que este cancelamento existe
      // pra evitar.
      const { error: erroUpdate } = await supabase
        .from("assinaturas")
        .update({ status: "cancelada" })
        .eq("id", linha.id);
      if (erroUpdate) throw erroUpdate;
    } catch (erro) {
      console.error(
        `Falha ao cancelar assinatura anterior ${linha.id} (mantida "ativa" no banco pra refletir a realidade — precisa de retry/intervenção manual):`,
        erro,
      );
    }
  }
}

/**
 * Ativa/renova o plano a partir de um pagamento confirmado.
 *
 * Identifica a linha certa em `assinaturas` de duas formas, nessa ordem:
 * 1. Por `id` direto — o checkout foi criado com `externalReference` igual
 *    ao id da linha "pendente", e o Asaas devolve esse valor de volta em
 *    `payment.externalReference`. Caminho principal, sem ambiguidade.
 * 2. Se por algum motivo o externalReference não vier (ex: assinatura
 *    alterada manualmente no painel do Asaas), cai para o plano B já
 *    documentado no projeto: acha a linha "pendente" do cliente Asaas em
 *    questão cujo VALOR do plano bate com o valor pago — nunca "a mais
 *    recente", porque pode haver mais de uma tentativa de checkout em
 *    aberto ao mesmo tempo.
 */
type LinhaAssinatura = { id: string; usuario_id: string; plano: Plano; status: string };

async function processarPagamentoConfirmado(payment: NonNullable<EventoAsaas["payment"]>, admin: SupabaseClient) {
  let linha: LinhaAssinatura | null = null;

  if (payment.externalReference) {
    const { data } = await admin
      .from("assinaturas")
      .select("id, usuario_id, plano, status")
      .eq("id", payment.externalReference)
      .maybeSingle();
    if (data) linha = data as LinhaAssinatura;
  }

  if (!linha) {
    const { data: candidatas } = await admin
      .from("assinaturas")
      .select("id, usuario_id, plano, status")
      .eq("status", "pendente")
      .eq("gateway", "asaas");

    linha = (candidatas ?? []).find((c) => PLANOS[c.plano as Plano].preco === payment.value) ?? null;
  }

  if (!linha) {
    throw new Error(
      `Pagamento ${payment.id} confirmado mas nenhuma assinatura pendente correspondente foi encontrada (externalReference=${payment.externalReference ?? "-"}, valor=${payment.value}).`,
    );
  }

  // Uma reentrega tardia do Asaas (o evento original já tinha sido
  // processado, mas por algum corte de rede o Asaas nunca recebeu o 200 e
  // reenviou) não pode "ressuscitar" uma assinatura que o próprio usuário
  // já cancelou explicitamente nesse meio tempo — o Asaas não vai cobrar
  // de novo por uma assinatura que ele mesmo já apagou, então reativar
  // aqui só daria acesso pago de graça e sem controle algum.
  if (linha.status === "cancelada") {
    console.warn(
      `Pagamento ${payment.id} confirmado para a assinatura ${linha.id}, que já está "cancelada" (provável reentrega tardia do Asaas após cancelamento do usuário) — ignorando reativação.`,
    );
    return;
  }

  const proximoPagamento = adicionarUmMes(payment.dueDate ? new Date(payment.dueDate) : new Date());

  const { error: erroUpdate } = await admin
    .from("assinaturas")
    .update({
      status: "ativa",
      asaas_subscription_id: payment.subscription ?? null,
      asaas_customer_id: payment.customer,
      data_proximo_pagamento: proximoPagamento.toISOString(),
    })
    .eq("id", linha.id);
  if (erroUpdate) throw erroUpdate;

  await admin.from("usuarios").update({ plano: linha.plano }).eq("id", linha.usuario_id);
  await cancelarOutrasAssinaturasAtivas(admin, linha.usuario_id, linha.id);
  await registrarEventoSeguranca(linha.usuario_id, "assinatura_ativada_webhook", {
    assinaturaId: linha.id,
    plano: linha.plano,
    paymentId: payment.id,
  });
}

/** Espelha no banco um cancelamento feito direto no painel do Asaas (sem
 * passar pelo botão "Cancelar assinatura" do app) — Finding #3 da revisão
 * adversarial: identifica a linha pelo `asaas_subscription_id`, que sempre
 * vem preenchido num evento SUBSCRIPTION_DELETED. */
async function processarAssinaturaCancelada(subscription: NonNullable<EventoAsaas["subscription"]>, admin: SupabaseClient) {
  const { data: linha } = await admin
    .from("assinaturas")
    .select("id, usuario_id")
    .eq("asaas_subscription_id", subscription.id)
    .eq("status", "ativa")
    .maybeSingle();

  if (!linha) return; // Já cancelada por aqui, ou nunca esteve ativa no nosso banco — nada a fazer.

  await admin.from("assinaturas").update({ status: "cancelada" }).eq("id", linha.id);
  await admin.from("usuarios").update({ plano: "gratis" }).eq("id", linha.usuario_id);
  await revogarCompartilhamento(admin, linha.usuario_id);
  await registrarEventoSeguranca(linha.usuario_id, "assinatura_cancelada_webhook", {
    assinaturaId: linha.id,
    asaasSubscriptionId: subscription.id,
  });
}

export async function POST(request: Request) {
  const tokenEsperado = process.env.ASAAS_WEBHOOK_TOKEN;
  const tokenRecebido = request.headers.get("asaas-access-token");
  if (!tokenEsperado || !tokenRecebido || tokenRecebido !== tokenEsperado) {
    return NextResponse.json({ erro: "Token inválido." }, { status: 401 });
  }

  let evento: EventoAsaas;
  try {
    evento = await request.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  if (!evento?.id || !evento?.event) {
    return NextResponse.json({ erro: "Evento sem id/event." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Idempotência: um evento já processado com sucesso nunca é reprocessado.
  // Um evento que falhou antes (ou nunca chegou a ser registrado) é
  // reprocessado normalmente — é assim que uma tentativa anterior com erro
  // se recupera numa próxima entrega do Asaas.
  const { data: eventoExistente } = await admin
    .from("asaas_webhook_events")
    .select("processado_com_sucesso, criado_em")
    .eq("id", evento.id)
    .maybeSingle();

  if (eventoExistente?.processado_com_sucesso) {
    return NextResponse.json({ ok: true, jaProcessado: true });
  }

  // Preserva o horário da primeira tentativa mesmo quando este evento está
  // sendo reprocessado depois de uma falha — só pra trilha de auditoria não
  // mentir sobre quando o Asaas de fato entregou o evento pela 1ª vez.
  const criadoEm = eventoExistente?.criado_em ?? new Date().toISOString();

  try {
    switch (evento.event) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED":
        if (!evento.payment) throw new Error(`Evento ${evento.event} sem campo "payment".`);
        await processarPagamentoConfirmado(evento.payment, admin);
        break;
      case "SUBSCRIPTION_DELETED":
        if (!evento.subscription) throw new Error(`Evento ${evento.event} sem campo "subscription".`);
        await processarAssinaturaCancelada(evento.subscription, admin);
        break;
      default:
        // Evento que não precisamos tratar (ex: PAYMENT_CREATED, PAYMENT_OVERDUE) —
        // confirma recebido sem reprocessar depois, mas sem fazer nada no banco.
        break;
    }

    await admin.from("asaas_webhook_events").upsert({
      id: evento.id,
      event_type: evento.event,
      payload: evento,
      processado_com_sucesso: true,
      erro: null,
      criado_em: criadoEm,
    });

    return NextResponse.json({ ok: true });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(`Erro processando evento Asaas ${evento.id} (${evento.event}):`, erro);

    await admin.from("asaas_webhook_events").upsert({
      id: evento.id,
      event_type: evento.event,
      payload: evento,
      processado_com_sucesso: false,
      erro: mensagem,
      criado_em: criadoEm,
    });

    // 500 de propósito — o Asaas tenta reentregar este evento mais tarde.
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}
