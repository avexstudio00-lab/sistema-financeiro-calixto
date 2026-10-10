import { supabase } from "@/lib/supabase/client";
import { estornarMovimento, lancarMovimentoInvestimento } from "./movimentosInvestimento";
import type { Investimento, PagamentoInvestimento, ParcelaInvestimento } from "./tipos";

/**
 * Compra e revenda (item 5.3 da especificação de 03/out/2026): preço de
 * revenda, lucro/margem e quitação automática quando o que já foi recebido
 * cobre o preço de revenda.
 */

export interface LucroRevenda {
  lucro: number;
  /** % sobre o custo: (revenda − custo) / custo × 100. */
  margem: number;
}

export function calcularLucroRevenda(custo: number, precoRevenda: number | null | undefined): LucroRevenda | null {
  if (precoRevenda == null || !Number.isFinite(precoRevenda) || precoRevenda <= 0 || !(custo > 0)) return null;
  const lucro = precoRevenda - custo;
  return { lucro, margem: (lucro / custo) * 100 };
}

/** Texto do badge: "Lucro de 30% (R$ 300,00)". */
export function textoLucroRevenda(l: LucroRevenda): string {
  const pct = l.margem.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const valor = Math.abs(l.lucro).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return l.lucro >= 0 ? `Lucro de ${pct}% (${valor})` : `Prejuízo de ${pct.replace("-", "")}% (${valor})`;
}

/** Quanto já entrou: parcelas recebidas + recebimentos avulsos/quitação. */
export function totalRecebidoRevenda(parcelas: ParcelaInvestimento[], pagamentos: PagamentoInvestimento[]): number {
  const deParcelas = parcelas.filter((p) => p.pago).reduce((acc, p) => acc + Number(p.valor), 0);
  const avulsos = pagamentos
    .filter((p) => p.tipo === "recebimento" || p.tipo === "quitacao")
    .reduce((acc, p) => acc + Number(p.valor_pago), 0);
  return deParcelas + avulsos;
}

export function revendaCoberta(inv: Investimento, totalRecebido: number): boolean {
  const preco = Number(inv.preco_revenda ?? 0);
  return preco > 0 && totalRecebido >= preco - 0.005;
}

/**
 * Recalcula e grava a quitação automática (só quando a situação NÃO foi
 * fixada à mão). Quitado = recebido ≥ preço de revenda; sem preço de
 * revenda, mantém a regra antiga (todas as parcelas recebidas).
 */
export async function reavaliarQuitacaoRevenda(investimentoId: string): Promise<void> {
  const [{ data: inv }, { data: parcelas }, { data: pagamentos }] = await Promise.all([
    supabase.from("investimentos").select("*").eq("id", investimentoId).maybeSingle(),
    supabase.from("investimento_parcelas").select("*").eq("investimento_id", investimentoId),
    supabase.from("investimento_pagamentos").select("*").eq("investimento_id", investimentoId),
  ]);
  const investimento = inv as Investimento | null;
  if (!investimento || investimento.tipo !== "revenda" || investimento.status_revenda) return;
  const listaParcelas = (parcelas as ParcelaInvestimento[]) ?? [];
  const recebido = totalRecebidoRevenda(listaParcelas, (pagamentos as PagamentoInvestimento[]) ?? []);
  const quitado = investimento.preco_revenda
    ? revendaCoberta(investimento, recebido)
    : listaParcelas.length > 0 && listaParcelas.every((p) => p.pago);
  if (quitado === investimento.quitado) return;
  await supabase
    .from("investimentos")
    .update({
      quitado,
      valor_quitado: quitado ? Number(recebido.toFixed(2)) : null,
      data_quitacao: quitado ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", investimentoId);
}

export async function salvarPrecoRevenda(investimentoId: string, preco: number | null) {
  const { error } = await supabase
    .from("investimentos")
    .update({ preco_revenda: preco == null ? null : Number(preco.toFixed(2)) })
    .eq("id", investimentoId);
  if (!error) await reavaliarQuitacaoRevenda(investimentoId);
  return { error };
}

/** Recebimento de uma revenda (à vista ou avulso): entra numa carteira. */
export async function registrarRecebimentoRevenda(params: {
  investimento: Investimento;
  usuarioId: string;
  valor: number;
  data: string;
  contaId: string;
}) {
  const transacaoId = await lancarMovimentoInvestimento({
    usuarioId: params.usuarioId,
    contaId: params.contaId,
    sentido: "resgate",
    valor: params.valor,
    data: params.data,
    descricao: `Venda: ${params.investimento.nome}`,
  });
  if (!transacaoId) return { error: { message: "Não foi possível lançar na carteira." } };
  const { error } = await supabase.from("investimento_pagamentos").insert({
    investimento_id: params.investimento.id,
    usuario_id: params.usuarioId,
    parcela_id: null,
    tipo: "recebimento",
    data_pagamento: params.data,
    dias_atraso: 0,
    valor_juros: null,
    valor_diaria: null,
    valor_pago: Number(params.valor.toFixed(2)),
    vencimento_referencia: null,
    proximo_vencimento: null,
    conta_id: params.contaId,
    transacao_id: transacaoId,
  });
  if (error) {
    // O dinheiro já entrou na carteira: desfaz, senão uma nova tentativa
    // lançaria em dobro.
    await estornarMovimento(transacaoId);
    return { error };
  }
  await reavaliarQuitacaoRevenda(params.investimento.id);
  return { error: null };
}

/**
 * Investimento/empréstimo antigo, criado antes da conta de origem ser
 * obrigatória (5.10): registra agora de qual carteira o dinheiro saiu e
 * debita o valor dela, com a data original do investimento.
 */
export async function vincularContaOrigem(inv: Investimento, usuarioId: string, contaId: string) {
  if (inv.conta_origem_id || inv.transacao_origem_id) return { error: { message: "Este investimento já tem carteira de origem." } };
  const transacaoId = await lancarMovimentoInvestimento({
    usuarioId,
    contaId,
    sentido: "aplicacao",
    valor: Number(inv.valor_investido),
    data: inv.data_inicio,
    descricao: `${inv.tipo === "emprestimo" ? "Empréstimo para" : inv.tipo === "revenda" ? "Compra" : "Aplicação"}: ${inv.nome}`,
  });
  if (!transacaoId) return { error: { message: "Não foi possível lançar na carteira." } };
  return supabase.from("investimentos").update({ conta_origem_id: contaId, transacao_origem_id: transacaoId }).eq("id", inv.id);
}

/**
 * "Operação de rolo" (item 4.13 da especificação de 09/out/2026): a venda é
 * paga com dinheiro + um bem recebido em troca. O bem entra como
 * recebimento pelo valor de avaliação (sem carteira — não é dinheiro), então
 * a receita total = dinheiro + bem e o lucro real = receita − custo. Se a
 * pessoa quiser revender o bem, nasce um novo card de Compra e revenda com
 * custo de entrada = valor atribuído na troca (sem tirar dinheiro de carteira
 * nenhuma, porque nada saiu do caixa).
 */
export async function registrarPermutaRevenda(params: {
  investimento: Investimento;
  usuarioId: string;
  data: string;
  descricaoBem: string;
  valorBem: number;
  dinheiro?: { valor: number; contaId: string } | null;
  destinarRevenda: boolean;
}): Promise<{ error: { message: string } | null; novoInvestimentoId?: string | null }> {
  const { investimento, usuarioId, data } = params;
  const valorBem = Number(params.valorBem.toFixed(2));
  if (!(valorBem > 0)) return { error: { message: "Informe o valor atribuído ao bem." } };

  // O bem é gravado PRIMEIRO: se der erro, nada entrou na carteira ainda e
  // uma nova tentativa não duplica o dinheiro.
  const { data: pagBem, error } = await supabase.from("investimento_pagamentos").insert({
    investimento_id: investimento.id,
    usuario_id: usuarioId,
    parcela_id: null,
    tipo: "recebimento",
    data_pagamento: data,
    dias_atraso: 0,
    valor_juros: null,
    valor_diaria: null,
    valor_pago: valorBem,
    vencimento_referencia: null,
    proximo_vencimento: null,
    conta_id: null,
    transacao_id: null,
    recebido_em_bem: true,
  }).select("id").single();
  if (error) return { error: { message: error.message } };

  if (params.dinheiro && params.dinheiro.valor > 0) {
    const r = await registrarRecebimentoRevenda({ investimento, usuarioId, valor: params.dinheiro.valor, data, contaId: params.dinheiro.contaId });
    if (r.error) {
      // Desfaz o bem para a pessoa poder repetir a operação inteira.
      if (pagBem) await supabase.from("investimento_pagamentos").delete().eq("id", (pagBem as { id: string }).id);
      return { error: { message: "Não foi possível lançar a parte em dinheiro. Nada foi gravado; tente de novo." } };
    }
  }

  const descricao = params.descricaoBem.trim().slice(0, 120) || "Bem recebido na troca";
  await supabase
    .from("investimentos")
    .update({
      valor_bem_permuta: Number((Number(investimento.valor_bem_permuta ?? 0) + valorBem).toFixed(2)),
      descricao_bem_permuta: descricao,
    })
    .eq("id", investimento.id);

  let novoInvestimentoId: string | null = null;
  if (params.destinarRevenda) {
    const { data: novo } = await supabase
      .from("investimentos")
      .insert({
        usuario_id: usuarioId,
        nome: descricao.slice(0, 80),
        tipo: "revenda",
        valor_investido: valorBem,
        valor_atual: valorBem,
        taxa: null,
        descricao: `Recebido na troca de "${investimento.nome}"`,
        tipo_ganho: null,
        data_inicio: data,
        forma_pagamento: "vista",
        numero_parcelas: null,
        valor_parcela: null,
        periodicidade_parcelas: null,
        valor_retornavel: null,
        data_vencimento_final: null,
        valor_diaria: null,
        titulo_tesouro: null,
        quantidade_cotas: null,
        permuta_origem_id: investimento.id,
        tipo_ambiente: investimento.tipo_ambiente ?? "PESSOAL",
      })
      .select("id")
      .single();
    novoInvestimentoId = (novo as { id: string } | null)?.id ?? null;
  }

  await reavaliarQuitacaoRevenda(investimento.id);
  return { error: null, novoInvestimentoId };
}

/** Recebimento em bem (permuta): sem carteira e sem lançamento. */
export function ehRecebimentoEmBem(p: PagamentoInvestimento): boolean {
  return p.tipo === "recebimento" && p.recebido_em_bem === true;
}
