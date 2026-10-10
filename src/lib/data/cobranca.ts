import { supabase } from "@/lib/supabase/client";
import { formatarMoeda } from "@/lib/format";
import type { ContaReceber } from "./tipos";

/**
 * Cobrança ativa de venda fiada (itens 6.4 / 12.4 da especificação de
 * 09/out/2026): título a receber de origem "fiado" que venceu e não foi
 * recebido vira um lembrete no painel (e push diário pelo cron), com atalho
 * de WhatsApp e mensagem configurável.
 */
export const MENSAGEM_COBRANCA_PADRAO =
  "Olá, {nome}! Tudo bem? Aqui é da {empresa}. Passando pra lembrar do pagamento de {descricao}, no valor de {valor}, que venceu em {vencimento}. Se já pagou, desconsidere. Qualquer coisa estou à disposição!";

export function montarMensagemCobranca(modelo: string | null | undefined, titulo: ContaReceber, nomeEmpresa: string): string {
  const base = (modelo && modelo.trim()) || MENSAGEM_COBRANCA_PADRAO;
  const nome = titulo.clientes?.nome?.split(" ")[0] ?? "tudo bem";
  return base
    .replace(/\{nome\}/g, nome)
    .replace(/\{empresa\}/g, nomeEmpresa)
    .replace(/\{descricao\}/g, titulo.descricao.replace(/^Fiado:\s*/i, ""))
    .replace(/\{valor\}/g, formatarMoeda(Number(titulo.valor)))
    .replace(/\{vencimento\}/g, new Date(titulo.vencimento + "T00:00:00").toLocaleDateString("pt-BR"));
}

export function fiadosParaCobrar(titulos: ContaReceber[], hojeIso: string): ContaReceber[] {
  return titulos
    .filter((t) => t.status === "pendente" && t.origem === "fiado" && t.vencimento <= hojeIso)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

export async function lerMensagemCobranca(contaMestreId: string): Promise<string | null> {
  const { data } = await supabase.from("config_negocio").select("mensagem_cobranca").eq("usuario_id", contaMestreId).maybeSingle();
  return (data as { mensagem_cobranca: string | null } | null)?.mensagem_cobranca ?? null;
}

export async function salvarMensagemCobranca(contaMestreId: string, texto: string | null) {
  const limpo = texto?.trim() ? texto.trim().slice(0, 600) : null;
  return supabase
    .from("config_negocio")
    .upsert({ usuario_id: contaMestreId, mensagem_cobranca: limpo, atualizado_em: new Date().toISOString() }, { onConflict: "usuario_id" });
}

export async function registrarCobrancaFeita(tituloId: string) {
  return supabase.from("contas_receber").update({ ultima_cobranca_em: new Date().toISOString() }).eq("id", tituloId);
}
