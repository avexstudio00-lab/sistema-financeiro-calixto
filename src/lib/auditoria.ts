import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Log de auditoria de segurança (item 6 do checklist revisado em
 * 10/set/2026 — "Registrar eventos importantes do sistema" / "Registrar
 * atividades suspeitas"). Guarda em `eventos_seguranca` (tabela nova, ver
 * SQL entregue ao usuário) quem fez o quê e quando nos pontos que mexem em
 * plano/assinatura/dinheiro — hoje a única forma de reconstruir isso era
 * lendo o estado atual de `assinaturas`, sem histórico de quando/como cada
 * mudança aconteceu.
 *
 * RLS habilitado na tabela sem nenhuma policy — só a service role (usada
 * aqui) consegue ler/escrever, mesmo padrão já usado e considerado correto
 * pelo advisor de segurança do Supabase em `asaas_webhook_events`. Não é
 * exposto no app pro usuário final; é uma trilha pra investigação manual
 * (painel do Supabase) se algo parecer suspeito.
 *
 * Nunca lança erro nem trava o fluxo principal por causa de log — mesma
 * filosofia já usada em todo o resto do projeto (ex: `iniciarTrial`,
 * `console.error` nas integrações externas).
 */
export type TipoEventoSeguranca =
  | "checkout_criado"
  | "checkout_rate_limitado"
  | "assinatura_cancelada"
  | "cancelamento_rate_limitado"
  | "assinatura_ativada_webhook"
  | "assinatura_cancelada_webhook"
  | "trial_iniciado"
  | "trial_rate_limitado";

export async function registrarEventoSeguranca(
  usuarioId: string | null,
  tipo: TipoEventoSeguranca,
  detalhes: Record<string, unknown> = {}
): Promise<void> {
  try {
    const { error } = await supabaseAdmin().from("eventos_seguranca").insert({
      usuario_id: usuarioId,
      tipo,
      detalhes,
    });
    if (error) {
      console.error(`Erro ao registrar evento de segurança (${tipo}):`, error.message);
    }
  } catch (erro) {
    console.error(`Erro ao registrar evento de segurança (${tipo}):`, erro);
  }
}
