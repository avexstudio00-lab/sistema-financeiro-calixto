import { supabase } from "@/lib/supabase/client";
import type { ContaFixa, Transacao } from "./tipos";
import { criarTransacao } from "./transacoes";

export interface NovaContaFixa {
  usuario_id: string;
  descricao: string;
  valor: number;
  tipo: "receita" | "despesa";
  categoria_id: string | null;
  conta_id: string | null;
  dia_vencimento: number;
  data_inicio: string;
  data_fim: string | null;
}

export async function listarContasFixas(usuarioId: string): Promise<ContaFixa[]> {
  const { data } = await supabase
    .from("contas_fixas")
    .select("*, categorias(*), contas(*)")
    .eq("usuario_id", usuarioId)
    .order("dia_vencimento", { ascending: true });
  return (data as ContaFixa[]) ?? [];
}

export async function criarContaFixa(dados: NovaContaFixa) {
  return supabase.from("contas_fixas").insert(dados).select().single();
}

export async function atualizarContaFixa(id: string, dados: Partial<NovaContaFixa>) {
  return supabase.from("contas_fixas").update(dados).eq("id", id).select().single();
}

export async function alternarAtivaContaFixa(id: string, ativa: boolean) {
  return supabase.from("contas_fixas").update({ ativa }).eq("id", id);
}

/** Apaga a conta fixa em si. Nunca apaga (nem desfaz) sozinho os lançamentos
 * que ela já gerou em `transacoes` — eles ficam como lançamentos normais, só
 * perdem a referência de origem (`conta_fixa_id` vira nulo pela FK ON DELETE
 * SET NULL). Quem chama decide separadamente (ver `buscarUltimoLancamentoGerado`
 * abaixo) se quer apagar também o lançamento já gerado, pra reverter o efeito
 * no saldo da carteira. */
export async function removerContaFixa(id: string) {
  return supabase.from("contas_fixas").delete().eq("id", id);
}

/** Busca o lançamento mais recente que essa conta fixa já gerou (se algum).
 * Usado na hora de remover uma conta fixa, pra avisar o usuário que ela já
 * lançou algo este mês e oferecer a opção de apagar esse lançamento também
 * (revertendo o valor do saldo da carteira) — sem isso, apagar a conta fixa
 * some da lista mas o valor continua descontado/somado no saldo, e o
 * lançamento continua contando nos resumos e alertas de orçamento. */
export async function buscarUltimoLancamentoGerado(contaFixaId: string): Promise<Transacao | null> {
  const { data } = await supabase
    .from("transacoes")
    .select("*, categorias(*)")
    .eq("conta_fixa_id", contaFixaId)
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Transacao) ?? null;
}

function ultimoDiaDoMes(ano: number, mesIndex0: number): number {
  return new Date(ano, mesIndex0 + 1, 0).getDate();
}

/**
 * Gera automaticamente, em `transacoes`, os lançamentos de contas fixas cujo
 * dia de vencimento deste mês já chegou e que ainda não foram geradas.
 *
 * É "preguiçoso" de propósito: roda no carregamento do painel/da tela de
 * contas fixas, sem precisar de cron nem infraestrutura separada. Idempotente
 * — cada conta fixa só gera uma vez por mês, controlado por
 * ultimo_ano_gerado/ultimo_mes_gerado na própria linha. Se o dia de
 * vencimento não existir no mês corrente (ex: dia 31 em abril), usa o último
 * dia do mês.
 *
 * Retorna quantos lançamentos novos foram criados (pra quem chamou decidir
 * se vale recarregar a lista de transações).
 */
export async function gerarLancamentosPendentes(usuarioId: string): Promise<number> {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mesIndex0 = hoje.getMonth();
  const mesNumero = mesIndex0 + 1;
  const diaHoje = hoje.getDate();
  const hojeStr = hoje.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("contas_fixas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("ativa", true)
    .lte("data_inicio", hojeStr);
  const contasFixas = (data as ContaFixa[]) ?? [];

  let geradas = 0;
  for (const cf of contasFixas) {
    if (cf.data_fim && cf.data_fim < hojeStr) continue;
    if (cf.ultimo_ano_gerado === ano && cf.ultimo_mes_gerado === mesNumero) continue; // já gerada este mês

    const diaVencimentoEfetivo = Math.min(cf.dia_vencimento, ultimoDiaDoMes(ano, mesIndex0));
    if (diaHoje < diaVencimentoEfetivo) continue; // dia de vencimento ainda não chegou

    const dataLancamento = new Date(ano, mesIndex0, diaVencimentoEfetivo).toISOString().slice(0, 10);

    const { error } = await criarTransacao({
      usuario_id: usuarioId,
      conta_id: cf.conta_id,
      categoria_id: cf.categoria_id,
      tipo: cf.tipo,
      valor: Number(cf.valor),
      descricao: cf.descricao,
      data: dataLancamento,
      forma_pagamento: null,
      tipo_negocio: "pessoal",
      is_recorrente: true,
      recorrencia: "mensal",
      conta_fixa_id: cf.id,
    });

    if (!error) {
      await supabase
        .from("contas_fixas")
        .update({ ultimo_ano_gerado: ano, ultimo_mes_gerado: mesNumero })
        .eq("id", cf.id);
      geradas += 1;
    }
  }

  return geradas;
}
