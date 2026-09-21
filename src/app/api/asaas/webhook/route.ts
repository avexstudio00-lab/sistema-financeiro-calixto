import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processarPagamentoConfirmado, processarAssinaturaCancelada } from "@/lib/asaas/ativarAssinatura";

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

// A lógica de negócio (ativar assinatura, cancelar assinatura) mora em
// src/lib/asaas/ativarAssinatura.ts — compartilhada com a rota de
// reconciliação manual /api/asaas/verificar-pagamento, que consulta o Asaas
// direto (em vez de esperar passivamente o webhook) pra fechar o buraco de
// "pagamento aprovado no Asaas mas o webhook nunca chegou/demorou demais e
// o plano nunca ativa" (ver contexto do projeto, sessão de 21/set/2026).

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
        // Evento que não precisamos tratar (ex: PAYMENT_CREATED, PAYMENT_OVERDUE,
        // SUBSCRIPTION_CREATED) — confirma recebido sem reprocessar depois, mas
        // sem fazer nada no banco. A ativação em si só depende de
        // PAYMENT_CONFIRMED/PAYMENT_RECEIVED (aqui) ou da reconciliação manual
        // em /api/asaas/verificar-pagamento (que consulta o Asaas direto).
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
