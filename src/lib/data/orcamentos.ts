import { supabase } from "@/lib/supabase/client";
import { campoEmpresa, filtrarPorEmpresa } from "@/lib/empresa/empresaAtiva";
import { criarContaReceberParcelada } from "./contasEmpresa";
import { diasUteisEntre } from "@/lib/util/diasUteis";
import type { ItemOrcamento, Orcamento, StatusOrcamento } from "./tipos";

/** DIAS ÚTEIS sem interação que disparam o alerta de follow-up (5.9 / 4.6). */
export const DIAS_FOLLOW_UP = 3;

export const ROTULO_STATUS_ORCAMENTO: Record<StatusOrcamento, string> = {
  orcado: "Orçado",
  negociacao: "Aguardando resposta",
  fechado: "Fechado",
  perdido: "Perdido",
};

export async function listarOrcamentos(usuarioId: string): Promise<Orcamento[]> {
  const { data } = await filtrarPorEmpresa(
    supabase.from("orcamentos").select("*, clientes(*)").eq("usuario_id", usuarioId).order("criado_em", { ascending: false })
  );
  return ((data as Orcamento[]) ?? []).map((o) => ({ ...o, itens: Array.isArray(o.itens) ? o.itens : [] }));
}

export function totalDosItens(itens: ItemOrcamento[]): number {
  return Number(itens.reduce((acc, i) => acc + i.quantidade * i.valor_unitario, 0).toFixed(2));
}

export interface NovoOrcamento {
  usuario_id: string;
  cliente_id: string | null;
  titulo: string;
  itens: ItemOrcamento[];
  validade: string | null;
  observacoes: string | null;
}

export async function criarOrcamento(o: NovoOrcamento) {
  return supabase
    .from("orcamentos")
    .insert({ ...campoEmpresa(), ...o, titulo: o.titulo.trim(), valor_total: totalDosItens(o.itens), status: "orcado" })
    .select()
    .single();
}

export async function atualizarOrcamento(id: string, o: Omit<NovoOrcamento, "usuario_id">) {
  return supabase
    .from("orcamentos")
    .update({ ...o, titulo: o.titulo.trim(), valor_total: totalDosItens(o.itens) })
    .eq("id", id);
}

/** Muda o status e zera o relógio do follow-up (status_alterado_em). */
export async function mudarStatusOrcamento(id: string, status: StatusOrcamento) {
  return supabase.from("orcamentos").update({ status, status_alterado_em: new Date().toISOString() }).eq("id", id);
}

/** "Já falei com o cliente": registra o contato sem mudar o status — o
 * alerta de follow-up volta a contar 3 dias a partir de agora. */
export async function registrarContatoOrcamento(id: string) {
  return supabase.from("orcamentos").update({ status_alterado_em: new Date().toISOString() }).eq("id", id);
}

export async function excluirOrcamento(id: string) {
  return supabase.from("orcamentos").delete().eq("id", id);
}

/** Orçamento parado: em aberto (orçado/aguardando resposta) e sem
 * interação há 3+ dias úteis (item 4.6 da especificação de 09/out/2026). */
export function precisaFollowUp(o: Pick<Orcamento, "status" | "status_alterado_em">, agora: Date = new Date()): boolean {
  if (o.status !== "orcado" && o.status !== "negociacao") return false;
  return diasUteisEntre(new Date(o.status_alterado_em), agora) >= DIAS_FOLLOW_UP;
}

/** Totais de propostas de um cliente (dossiê 360°, item 4.16). */
export function resumirOrcamentosCliente(orcamentos: Orcamento[]) {
  const soma = (lista: Orcamento[]) => lista.reduce((a, o) => a + Number(o.valor_total), 0);
  const emAnalise = orcamentos.filter((o) => o.status === "orcado" || o.status === "negociacao");
  const aprovados = orcamentos.filter((o) => o.status === "fechado");
  const perdidos = orcamentos.filter((o) => o.status === "perdido");
  return {
    totalOrcado: soma(orcamentos),
    emAnalise: { quantidade: emAnalise.length, valor: soma(emAnalise) },
    aprovados: { quantidade: aprovados.length, valor: soma(aprovados) },
    perdidos: { quantidade: perdidos.length, valor: soma(perdidos) },
  };
}

/** Fechar o orçamento gera o título no Contas a Receber (5.8), à vista ou
 * em parcelas, ligado ao cliente e ao orçamento. O valor entra no caixa
 * (e nas vendas) quando cada parcela for marcada como recebida. */
export async function gerarContaReceberDoOrcamento(o: Orcamento, parcelas: number, primeiroVencimento: string) {
  return criarContaReceberParcelada(
    {
      usuario_id: o.usuario_id,
      cliente_id: o.cliente_id,
      descricao: `Orçamento: ${o.titulo}`,
      valor: Number(o.valor_total),
      vencimento: primeiroVencimento,
      origem: "orcamento",
      orcamento_id: o.id,
    },
    Math.max(1, parcelas)
  );
}

export function mensagemFollowUp(o: Orcamento, nomeEmpresa: string): string {
  const nome = o.clientes?.nome?.split(" ")[0] ?? "tudo bem";
  const itens = o.itens.slice(0, 3).map((i) => `• ${i.quantidade}x ${i.descricao}`).join("\n");
  const total = Number(o.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `Olá, ${nome}! Aqui é da ${nomeEmpresa}. Passando pra saber se você conseguiu avaliar o orçamento "${o.titulo}"${itens ? `:\n${itens}` : ""}\nTotal: ${total}${o.validade ? ` (válido até ${new Date(o.validade + "T00:00:00").toLocaleDateString("pt-BR")})` : ""}.\nPosso ajudar com alguma dúvida?`;
}

/** Ao fechar, os itens entram na esteira de vendas (5.8 / 12.2): uma linha
 * em `vendas` por item (sem lançamento de caixa — o dinheiro entra pelo
 * Contas a Receber), com baixa de estoque nos produtos e o MESMO id de
 * produto/serviço do catálogo (12.11). Itens livres viram venda com o nome
 * digitado, sem estoque. */
export async function registrarVendasDoOrcamento(o: Orcamento) {
  const hoje = new Date().toISOString().slice(0, 10);
  for (const item of o.itens) {
    // Item livre (digitado, sem cadastro) também entra no painel de vendas
    // (item 12.2: "fechado" alimenta as vendas sem lançamento duplicado),
    // só que sem baixa de estoque e com custo zero.
    const livre = !item.ref_id || item.tipo === "livre";
    let custo = 0;
    if (livre) {
      // nada a buscar
    } else if (item.tipo === "produto") {
      const { data: p } = await supabase.from("produtos").select("custo, quantidade_estoque").eq("id", item.ref_id).maybeSingle();
      if (p) {
        custo = Number((p as { custo: number }).custo);
        const atual = Number((p as { quantidade_estoque: number }).quantidade_estoque);
        await supabase.from("produtos").update({ quantidade_estoque: Math.max(0, atual - item.quantidade) }).eq("id", item.ref_id);
      }
    } else {
      const { data: sv } = await supabase.from("servicos").select("custo").eq("id", item.ref_id).maybeSingle();
      custo = Number((sv as { custo: number | null } | null)?.custo ?? 0);
    }
    await supabase.from("vendas").insert({
      ...(o.empresa_id ? { empresa_id: o.empresa_id } : campoEmpresa()),
      usuario_id: o.usuario_id,
      produto_id: !livre && item.tipo === "produto" ? item.ref_id : null,
      servico_id: !livre && item.tipo === "servico" ? item.ref_id : null,
      produto_nome: item.descricao,
      quantidade: Math.max(1, Math.round(item.quantidade)),
      valor_unitario: item.valor_unitario,
      custo_unitario: custo,
      valor_total: Number((item.quantidade * item.valor_unitario).toFixed(2)),
      forma_pagamento: null,
      cliente_id: o.cliente_id,
      data: hoje,
      transacao_id: null,
    });
  }
}
