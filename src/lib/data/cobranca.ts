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

/**
 * Tela "Cobrança" (10/nov/2026): uma mensagem por CLIENTE com tudo o que ele
 * deve (não uma por título), editável antes de abrir o WhatsApp.
 * Variáveis: {nome} {empresa} {total} {quantidade} {itens} — e as antigas
 * {descricao} {valor} {vencimento} (viram o resumo/total/1º vencimento).
 */
export const MODELOS_COBRANCA: { id: string; rotulo: string; texto: string }[] = [
  {
    id: "gentil",
    rotulo: "Gentil",
    texto:
      "Olá, {nome}! Tudo bem? Aqui é da {empresa} 😊\nPassando pra lembrar com carinho do que ficou em aberto:\n{itens}\nTotal: {total}.\nSe já pagou, pode desconsiderar. Qualquer coisa é só me chamar!",
  },
  {
    id: "lembrete",
    rotulo: "Lembrete direto",
    texto:
      "Oi, {nome}! Aqui é da {empresa}. Lembrete dos pagamentos em aberto:\n{itens}\nTotal: {total}. Pode ser por Pix? Me avisa quando fizer, por favor. Obrigado!",
  },
  {
    id: "firme",
    rotulo: "Firme e educado",
    texto:
      "Olá, {nome}. Aqui é da {empresa}. Identificamos {quantidade} pagamento(s) em atraso:\n{itens}\nTotal: {total}. Peço que regularize assim que possível ou me diga uma data pra combinarmos. Obrigado pela compreensão.",
  },
];

export function montarMensagemCliente(
  modelo: string | null | undefined,
  nomeCliente: string,
  titulos: ContaReceber[],
  nomeEmpresa: string
): string {
  const base = (modelo && modelo.trim()) || MODELOS_COBRANCA[0].texto;
  const ordenados = [...titulos].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const total = ordenados.reduce((acc, t) => acc + Number(t.valor), 0);
  const hoje = new Date().toISOString().slice(0, 10);
  const itens = ordenados
    .map((t) => {
      const data = new Date(t.vencimento + "T00:00:00").toLocaleDateString("pt-BR");
      return `• ${t.descricao.replace(/^Fiado:\s*/i, "")} — ${formatarMoeda(Number(t.valor))} (${t.vencimento < hoje ? "venceu" : "vence"} ${data})`;
    })
    .join("\n");
  const primeiro = ordenados[0];
  return base
    .replace(/\{nome\}/g, nomeCliente.split(" ")[0] || "tudo bem")
    .replace(/\{empresa\}/g, nomeEmpresa)
    .replace(/\{total\}/g, formatarMoeda(total))
    .replace(/\{quantidade\}/g, String(ordenados.length))
    .replace(/\{itens\}/g, itens)
    .replace(/\{descricao\}/g, ordenados.length === 1 ? (primeiro?.descricao ?? "").replace(/^Fiado:\s*/i, "") : `${ordenados.length} compras`)
    .replace(/\{valor\}/g, formatarMoeda(total))
    .replace(/\{vencimento\}/g, primeiro ? new Date(primeiro.vencimento + "T00:00:00").toLocaleDateString("pt-BR") : "");
}

export async function registrarCobrancaFeitaVarios(ids: string[]) {
  if (ids.length === 0) return;
  return supabase.from("contas_receber").update({ ultima_cobranca_em: new Date().toISOString() }).in("id", ids);
}
