import { supabase } from "@/lib/supabase/client";
import { NOMES_MES } from "@/lib/format";
import type { Transacao } from "./tipos";

function limitesDoMes(ano: number, mes: number) {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
  const fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  return { inicio, fim };
}

async function transacoesNegocioDoMes(usuarioId: string, ano: number, mes: number): Promise<Transacao[]> {
  const { inicio, fim } = limitesDoMes(ano, mes);
  const { data } = await supabase
    .from("transacoes")
    .select("*, categorias(*)")
    .eq("usuario_id", usuarioId)
    .eq("tipo_negocio", "negocio")
    .gte("data", inicio)
    .lte("data", fim);
  return (data as Transacao[]) ?? [];
}

function somar(linhas: { tipo: "receita" | "despesa"; valor: number }[], tipo: "receita" | "despesa") {
  return linhas.filter((l) => l.tipo === tipo).reduce((acc, l) => acc + Number(l.valor), 0);
}

export interface ResumoEmpresa {
  faturamento: number;
  custos: number;
  lucroReal: number;
  variacaoFaturamento: number | null;
  variacaoCustos: number | null;
  saldoAcumulado: number;
}

/**
 * Visão geral do negócio pro "Painel da empresa": faturamento, custos e
 * lucro real do mês, comparado com o mês anterior, mais o saldo acumulado
 * (soma de todas as receitas menos despesas do negócio desde o começo —
 * não é o saldo de uma conta bancária, é o quanto o negócio já rendeu
 * líquido até hoje).
 */
export async function gerarResumoEmpresa(usuarioId: string, ano: number, mes: number): Promise<ResumoEmpresa> {
  const atual = await transacoesNegocioDoMes(usuarioId, ano, mes);
  const mesAnteriorData = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const anterior = await transacoesNegocioDoMes(usuarioId, mesAnteriorData.ano, mesAnteriorData.mes);

  const faturamento = somar(atual, "receita");
  const custos = somar(atual, "despesa");
  const faturamentoAnterior = somar(anterior, "receita");
  const custosAnterior = somar(anterior, "despesa");

  const variacaoFaturamento =
    faturamentoAnterior > 0 ? ((faturamento - faturamentoAnterior) / faturamentoAnterior) * 100 : null;
  const variacaoCustos = custosAnterior > 0 ? ((custos - custosAnterior) / custosAnterior) * 100 : null;

  const { data: todasNegocio } = await supabase
    .from("transacoes")
    .select("tipo, valor")
    .eq("usuario_id", usuarioId)
    .eq("tipo_negocio", "negocio");
  const linhas = (todasNegocio as { tipo: "receita" | "despesa"; valor: number }[]) ?? [];
  const saldoAcumulado = somar(linhas, "receita") - somar(linhas, "despesa");

  return {
    faturamento,
    custos,
    lucroReal: faturamento - custos,
    variacaoFaturamento,
    variacaoCustos,
    saldoAcumulado,
  };
}

export interface ResumoFluxoCaixa {
  faturamento: number;
  gastosOperacionais: number;
  retiradaProLabore: number;
  sobrou: number;
}

/**
 * "A empresa faturou X, gastou Y e sobrou Z. Você retirou W de pró-labore."
 * Pró-labore é identificado pela categoria "Pró-labore" (despesa padrão) —
 * é separado dos demais gastos operacionais só pra ficar claro na frase,
 * mas os dois saem do mesmo caixa do negócio.
 */
export async function gerarFluxoCaixa(usuarioId: string, ano: number, mes: number): Promise<ResumoFluxoCaixa> {
  const atual = await transacoesNegocioDoMes(usuarioId, ano, mes);
  const faturamento = somar(atual, "receita");
  const despesas = atual.filter((t) => t.tipo === "despesa");
  const retiradaProLabore = despesas
    .filter((t) => t.categorias?.nome === "Pró-labore")
    .reduce((acc, t) => acc + Number(t.valor), 0);
  const gastosOperacionais = despesas.reduce((acc, t) => acc + Number(t.valor), 0) - retiradaProLabore;

  return {
    faturamento,
    gastosOperacionais,
    retiradaProLabore,
    sobrou: faturamento - gastosOperacionais - retiradaProLabore,
  };
}

/** Reserva sugerida pro DAS/impostos: só uma % editável do faturamento do
 * mês, pra ajudar a não ser pego de surpresa — não é um cálculo oficial de
 * tributos (isso depende do enquadramento e varia por caso), por isso o
 * percentual fica sempre visível e editável pelo usuário. */
export function calcularReservaSugerida(faturamento: number, percentual: number): number {
  return faturamento * (percentual / 100);
}

export interface PontoFaturamentoAnual {
  mes: string;
  mesNumero: number;
  faturamento: number;
}

/** Faturamento do negócio mês a mês num ano, pro relatório anual (base pra
 * declaração do MEI/ME) — soma das receitas do negócio por mês de calendário. */
export async function faturamentoAnualPorMes(usuarioId: string, ano: number): Promise<PontoFaturamentoAnual[]> {
  const { data } = await supabase
    .from("transacoes")
    .select("valor, data")
    .eq("usuario_id", usuarioId)
    .eq("tipo_negocio", "negocio")
    .eq("tipo", "receita")
    .gte("data", `${ano}-01-01`)
    .lte("data", `${ano}-12-31`);

  const linhas = (data as { valor: number; data: string }[]) ?? [];
  const porMes = new Array(13).fill(0) as number[];
  for (const linha of linhas) {
    const mesNumero = Number(linha.data.slice(5, 7));
    if (mesNumero >= 1 && mesNumero <= 12) porMes[mesNumero] += Number(linha.valor);
  }

  const pontos: PontoFaturamentoAnual[] = [];
  for (let m = 1; m <= 12; m++) {
    pontos.push({ mes: NOMES_MES[m - 1], mesNumero: m, faturamento: porMes[m] });
  }
  return pontos;
}
