import type { SupabaseClient } from "@supabase/supabase-js";
import type { PagamentoAsaas } from "@/lib/asaas/client";
import { PLANOS, type Plano } from "@/lib/planos";
import { enviarPushComDedupe } from "@/lib/push/enviarPush";
import { registrarEventoSeguranca } from "@/lib/auditoria";

/**
 * Avisa por push (Bloco 5) quando uma cobranca do Asaas vence sem ser paga
 * (evento `PAYMENT_OVERDUE` do webhook) -- so notifica, nunca muda status de
 * assinatura (isso continua acontecendo so em PAYMENT_CONFIRMED e
 * SUBSCRIPTION_DELETED, ver `ativarAssinatura.ts`).
 *
 * Identifica o dono da cobranca pela assinatura ATIVA cujo
 * `asaas_customer_id` bate com `payment.customer` -- uma cobranca vencida so
 * importa notificar se ainda existe uma assinatura de verdade em risco;
 * uma que ja foi cancelada por outro caminho nao precisa de aviso.
 *
 * Dedupe por `paymentId`: o Asaas pode reenviar o mesmo evento (mesmo
 * padrao de idempotencia do resto do webhook) -- nunca notifica duas vezes
 * pra a mesma cobranca vencida.
 */
export async function notificarFalhaPagamento(payment: PagamentoAsaas, admin: SupabaseClient): Promise<void> {
  const { data: linha } = await admin
    .from("assinaturas")
    .select("id, usuario_id, plano")
    .eq("asaas_customer_id", payment.customer)
    .eq("status", "ativa")
    .maybeSingle();

  if (!linha) return; // Sem assinatura ativa pra esse cliente Asaas -- nada a notificar.

  const nomePlano = PLANOS[linha.plano as Plano]?.nome ?? "seu plano";

  const notificou = await enviarPushComDedupe(admin, linha.usuario_id, "asaas_falha_cobranca", payment.id, {
    titulo: "Pagamento nao confirmado",
    corpo: `A cobranca do ${nomePlano} venceu sem confirmacao. Regularize pra nao perder o acesso.`,
    url: "/dashboard/plano",
  });

  if (notificou) {
    await registrarEventoSeguranca(linha.usuario_id, "push_falha_cobranca_notificada", { paymentId: payment.id });
  }
}
