import { supabase } from "@/lib/supabase/client";
import type { Meta } from "./tipos";

export async function listarMetas(usuarioId: string): Promise<Meta[]> {
  const { data } = await supabase
    .from("metas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("data_inicio", { ascending: false });
  return (data as Meta[]) ?? [];
}

export async function criarMeta(
  usuarioId: string,
  nome: string,
  valorMeta: number,
  dataFim: string | null
) {
  return supabase
    .from("metas")
    .insert({
      usuario_id: usuarioId,
      nome,
      valor_meta: valorMeta,
      data_fim: dataFim,
    })
    .select()
    .single();
}

export async function atualizarProgressoMeta(metaId: string, valorAtual: number, status: Meta["status"]) {
  return supabase.from("metas").update({ valor_atual: valorAtual, status }).eq("id", metaId);
}

/** Edita os dados base da meta (nome, valor-alvo, prazo) depois de já criada
 * — pedido do usuário em 22/set/2026 ("tem como a pessoa editar tudo?"):
 * antes só dava pra editar o progresso (aporte/retirada), não o cadastro em
 * si. Não mexe em `valor_atual`/`status` — isso continua só por aporte. */
export async function atualizarMeta(
  metaId: string,
  dados: { nome: string; valorMeta: number; dataFim: string | null }
) {
  return supabase
    .from("metas")
    .update({ nome: dados.nome, valor_meta: dados.valorMeta, data_fim: dados.dataFim })
    .eq("id", metaId);
}

/**
 * Em quantos meses a meta é atingida, simulando um aporte mensal
 * hipotético constante a partir de hoje — pedido do usuário em 22/set/2026:
 * "se você guardar tanto por mês, em quanto tempo bate tal meta". Não é uma
 * projeção baseada no ritmo histórico de aportes (o app não guarda um
 * histórico de aportes individuais, só o total acumulado) — é um simulador:
 * a pessoa digita um valor mensal hipotético e vê a estimativa. `null`
 * quando o valor mensal é inválido/zero (nunca chegaria) ou a meta já foi
 * batida (nesse caso o valor restante já é 0).
 */
export function calcularMesesParaAtingirMeta(valorRestante: number, aporteMensal: number): number | null {
  if (valorRestante <= 0) return 0;
  if (!Number.isFinite(aporteMensal) || aporteMensal <= 0) return null;
  return Math.ceil(valorRestante / aporteMensal);
}

/** Exclui a meta de vez (item 4.6 da especificação de 03/out/2026). Hoje os
 * aportes/retiradas de uma meta só atualizam o próprio `valor_atual` — não
 * geram lançamento em conta nenhuma —, então apagar a meta não mexe em saldo
 * de carteira: o dinheiro continua exatamente onde está. Quando a meta passar
 * a ter conta de origem/investimento vinculado (item 5.13), a opção de
 * estornar esses lançamentos entra aqui. */
export async function excluirMeta(metaId: string) {
  return supabase.from("metas").delete().eq("id", metaId);
}

// ---------------------------------------------------------------------------
// Item 5.13 da especificação de 03/out/2026: custódia da meta.
// Quando o dinheiro da meta fica aplicado (poupança ou CDB com liquidez), a
// meta ganha um investimento espelho ("CDB — [Meta]") e passa a mostrar o
// saldo dele. Aportes saem de uma carteira (despesa em "Investimentos") e
// retiradas voltam pra uma carteira (receita em "Resgates e rendimentos").
// ---------------------------------------------------------------------------

export type CustodiaMeta = NonNullable<Meta["custodia"]>;

export const ROTULO_CUSTODIA: Record<CustodiaMeta, string> = {
  caixinha_mp: "Caixinha (Mercado Pago ou similar)",
  conta_secundaria: "Conta separada",
  poupanca: "Poupança",
  cdb_liquidez: "CDB com liquidez diária",
};

/** Custódias que viram um investimento espelho rendendo sozinho. */
export function custodiaRende(c: Meta["custodia"]): c is "poupanca" | "cdb_liquidez" {
  return c === "poupanca" || c === "cdb_liquidez";
}

export async function definirCustodiaMeta(meta: Meta, custodia: CustodiaMeta | null, usuarioId: string) {
  let investimentoId = meta.investimento_id ?? null;
  if (custodiaRende(custodia) && !investimentoId) {
    const ehCdb = custodia === "cdb_liquidez";
    const hoje = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("investimentos")
      .insert({
        usuario_id: usuarioId,
        nome: `${ehCdb ? "CDB" : "Poupança"} — ${meta.nome}`.slice(0, 80),
        tipo: ehCdb ? "cdb" : "poupanca",
        valor_investido: Number(meta.valor_atual),
        valor_atual: Number(meta.valor_atual),
        // CDB: % do CDI (100%). Poupança: taxa recalculada ao vivo.
        taxa: ehCdb ? 100 : 6.17,
        descricao: `Espelho da meta "${meta.nome}"`,
        tipo_ganho: null,
        data_inicio: hoje,
        forma_pagamento: null,
      })
      .select("id")
      .single();
    investimentoId = (data as { id: string } | null)?.id ?? null;
  }
  return supabase.from("metas").update({ custodia, investimento_id: investimentoId }).eq("id", meta.id);
}

/** Aporte (+) ou retirada (−) na meta, movimentando a carteira e o
 * investimento espelho quando houver. */
export async function movimentarMeta(params: {
  meta: Meta;
  usuarioId: string;
  valor: number;
  sentido: "aporte" | "retirada";
  contaId: string | null;
  valorAtualEspelho?: number | null;
}) {
  const { meta, valor, sentido } = params;
  const { lancarMovimentoInvestimento } = await import("./movimentosInvestimento");
  if (params.contaId) {
    await lancarMovimentoInvestimento({
      usuarioId: params.usuarioId,
      contaId: params.contaId,
      sentido: sentido === "aporte" ? "aplicacao" : "resgate",
      valor,
      data: new Date().toISOString().slice(0, 10),
      descricao: `${sentido === "aporte" ? "Aporte na meta" : "Retirada da meta"}: ${meta.nome}`,
    });
  }
  const base = params.valorAtualEspelho ?? Number(meta.valor_atual);
  const novoValor = Math.max(0, sentido === "aporte" ? base + valor : base - valor);
  if (meta.investimento_id) {
    const { data: inv } = await supabase
      .from("investimentos")
      .select("valor_investido")
      .eq("id", meta.investimento_id)
      .maybeSingle();
    const investido = Number((inv as { valor_investido: number } | null)?.valor_investido ?? 0);
    const novoInvestido = Math.max(0, sentido === "aporte" ? investido + valor : investido - valor);
    await supabase
      .from("investimentos")
      .update({ valor_investido: novoInvestido, valor_atual: novoValor })
      .eq("id", meta.investimento_id);
  }
  const status: Meta["status"] = novoValor >= Number(meta.valor_meta) ? "concluida" : "em_andamento";
  await supabase
    .from("metas")
    .update({ valor_atual: Number(novoValor.toFixed(2)), status, conta_origem_id: params.contaId ?? meta.conta_origem_id ?? null })
    .eq("id", meta.id);
}

/** Sincroniza a meta com o valor estimado do investimento espelho (o
 * rendimento entra sozinho na meta). Só grava se mudou mais de 1 centavo. */
export async function sincronizarMetaComEspelho(meta: Meta, valorEspelho: number) {
  if (Math.abs(Number(meta.valor_atual) - valorEspelho) < 0.01) return false;
  const status: Meta["status"] = valorEspelho >= Number(meta.valor_meta) ? "concluida" : "em_andamento";
  await supabase.from("metas").update({ valor_atual: Number(valorEspelho.toFixed(2)), status }).eq("id", meta.id);
  return true;
}
