import { supabase } from "@/lib/supabase/client";
import { criarTransacao, deletarTransacao, atualizarTransacao } from "./transacoes";
import type { Transacao } from "./tipos";

/**
 * Ponte entre investimentos e carteiras (item 5.10 da especificação de
 * 03/out/2026): aplicar dinheiro tira da conta de origem (despesa na
 * categoria "Investimentos"); receber parcela, juros, quitação ou resgate
 * coloca na conta de destino (receita em "Resgates e rendimentos"). Cada
 * evento guarda o id do lançamento pra poder desfazer certinho.
 */

export const CATEGORIA_APLICACAO = "Investimentos";
export const CATEGORIA_RESGATE = "Resgates e rendimentos";

async function idCategoriaPadrao(nome: string, tipo: "receita" | "despesa"): Promise<string | null> {
  const { data } = await supabase
    .from("categorias")
    .select("id")
    .is("usuario_id", null)
    .eq("nome", nome)
    .eq("tipo", tipo)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function lancarMovimentoInvestimento(params: {
  usuarioId: string;
  contaId: string;
  sentido: "aplicacao" | "resgate";
  valor: number;
  data: string;
  descricao: string;
  /** Item 6.8: aplicação com caixa da empresa sai como lançamento do negócio. */
  tipoNegocio?: "pessoal" | "negocio";
  /** Itens 6.6/12.6: aporte/retirada de meta fica rastreável no extrato. */
  metaId?: string | null;
}): Promise<string | null> {
  if (!params.contaId || !(params.valor > 0)) return null;
  const tipo = params.sentido === "aplicacao" ? "despesa" : "receita";
  const categoria = await idCategoriaPadrao(params.sentido === "aplicacao" ? CATEGORIA_APLICACAO : CATEGORIA_RESGATE, tipo);
  const { data, error } = await criarTransacao({
    usuario_id: params.usuarioId,
    conta_id: params.contaId,
    categoria_id: categoria,
    tipo,
    valor: Number(params.valor.toFixed(2)),
    descricao: params.descricao.slice(0, 120),
    data: params.data,
    forma_pagamento: null,
    tipo_negocio: params.tipoNegocio ?? "pessoal",
    ...(params.metaId ? { meta_id: params.metaId } : {}),
  });
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/** Desfaz o lançamento ligado a um evento (devolve o saldo da conta). */
export async function estornarMovimento(transacaoId: string | null | undefined) {
  if (!transacaoId) return;
  const { data } = await supabase.from("transacoes").select("*").eq("id", transacaoId).maybeSingle();
  if (data) await deletarTransacao(data as Transacao);
}

/** Acompanha a edição de um evento (valor/data) no lançamento ligado. */
export async function ajustarMovimento(transacaoId: string | null | undefined, valor: number, data: string) {
  if (!transacaoId) return;
  const { data: t } = await supabase.from("transacoes").select("*").eq("id", transacaoId).maybeSingle();
  if (!t) return;
  const original = t as Transacao;
  await atualizarTransacao(original, {
    usuario_id: original.usuario_id,
    conta_id: original.conta_id,
    categoria_id: original.categoria_id,
    tipo: original.tipo,
    valor: Number(valor.toFixed(2)),
    descricao: original.descricao ?? "",
    data,
    forma_pagamento: original.forma_pagamento,
    tipo_negocio: original.tipo_negocio,
  });
}
