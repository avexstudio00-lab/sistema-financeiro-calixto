import { supabase } from "@/lib/supabase/client";
import { COLS_VENDA } from "./colunas";
import { comCustoVendas } from "./custos";
import { ehMovimentoInterno } from "./transacoes";
import { CATEGORIA_APLICACAO, CATEGORIA_RESGATE } from "./movimentosInvestimento";
import {
  calcularLucroRecebidoEntre,
  calcularRecebidoEntre,
  listarInvestimentos,
  listarPagamentosInvestimento,
  listarParcelas,
} from "./investimentos";
import { totalRecebidoRevenda } from "./revenda";
import { listarMetas } from "./metas";
import type { Investimento, Meta, PagamentoInvestimento, ParcelaInvestimento, Transacao, Venda } from "./tipos";
import type { PeriodoRelatorio } from "@/lib/relatorio/periodo";

/**
 * "Meu relatório" (09/nov/2026): o relatório explicado do período — Minha
 * vida, Investimentos e Minha empresa — com comparação com o período
 * anterior e sugestões em linguagem simples ("você poderia investir mais
 * ali", "suas vendas caíram X%"). Tudo calculado a partir do que já está
 * lançado (RLS do próprio usuário), sem tabela nova.
 */

export interface DadosRelatorio {
  transacoesPessoais: Transacao[];
  investimentos: Investimento[];
  parcelasInv: ParcelaInvestimento[];
  pagamentosInv: PagamentoInvestimento[];
  metas: Meta[];
  empresa: { transacoes: Transacao[]; vendas: Venda[] } | null;
}

export async function carregarDadosRelatorio(
  usuarioId: string,
  periodo: PeriodoRelatorio,
  empresaUsuarioId: string | null
): Promise<DadosRelatorio> {
  const inicio = periodo.anterior.inicio < periodo.inicio ? periodo.anterior.inicio : periodo.inicio;
  const fim = periodo.fim;
  const [pessoais, investimentos, parcelasInv, pagamentosInv, metas, empresa] = await Promise.all([
    supabase
      .from("transacoes")
      .select("*, categorias(*)")
      .eq("usuario_id", usuarioId)
      .neq("tipo_negocio", "negocio")
      .gte("data", inicio)
      .lte("data", fim)
      .limit(5000),
    listarInvestimentos(usuarioId),
    listarParcelas(usuarioId),
    listarPagamentosInvestimento(usuarioId),
    listarMetas(usuarioId),
    empresaUsuarioId
      ? Promise.all([
          supabase
            .from("transacoes")
            .select("*, categorias(*)")
            .eq("usuario_id", empresaUsuarioId)
            .eq("tipo_negocio", "negocio")
            .gte("data", inicio)
            .lte("data", fim)
            .limit(5000),
          supabase.from("vendas").select(COLS_VENDA).eq("usuario_id", empresaUsuarioId).gte("data", inicio).lte("data", fim).limit(5000),
        ])
      : Promise.resolve(null),
  ]);
  return {
    transacoesPessoais: (pessoais.data as Transacao[]) ?? [],
    investimentos,
    parcelasInv,
    pagamentosInv,
    metas,
    empresa: empresa
      ? { transacoes: (empresa[0].data as Transacao[]) ?? [], vendas: (await comCustoVendas(((empresa[1].data as unknown as Venda[]) ?? []))) as Venda[] }
      : null,
  };
}

export type TomInsight = "bom" | "atencao" | "neutro";
export interface Insight {
  tom: TomInsight;
  texto: string;
}
export interface Numero {
  rotulo: string;
  valor: number;
  /** Variação % contra o período anterior (null = sem base). */
  variacao?: number | null;
  /** true quando subir é ruim (ex.: gastos). */
  subirEhRuim?: boolean;
}
export interface SecaoRelatorio {
  titulo: string;
  numeros: Numero[];
  insights: Insight[];
}
export interface Relatorio {
  vida: SecaoRelatorio;
  investimentos: SecaoRelatorio | null;
  empresa: SecaoRelatorio | null;
}

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(v: number): string {
  return `${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
}
function variacao(atual: number, anterior: number): number | null {
  return anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
}
const entre = (d: string, a: string, b: string) => d >= a && d <= b;

/** Movimentos que só trocam dinheiro de lugar (transferência, aplicar /
 * resgatar investimento, empréstimo pego) — fora de entradas/saídas, igual
 * ao Relatório PDF. */
function ehInterno(t: Transacao): boolean {
  const nome = t.categorias?.nome;
  return ehMovimentoInterno(t) || nome === CATEGORIA_APLICACAO || nome === CATEGORIA_RESGATE || nome === "Empréstimo recebido";
}

function somaPorCategoria(lista: Transacao[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of lista) {
    const nome = t.categorias?.nome ?? "Sem categoria";
    m.set(nome, (m.get(nome) ?? 0) + Number(t.valor));
  }
  return m;
}

function secaoVida(d: DadosRelatorio, p: PeriodoRelatorio): SecaoRelatorio {
  const validas = d.transacoesPessoais.filter((t) => !ehInterno(t));
  const atual = validas.filter((t) => entre(t.data, p.inicio, p.fim));
  const ant = validas.filter((t) => entre(t.data, p.anterior.inicio, p.anterior.fim));
  const soma = (l: Transacao[], tipo: "receita" | "despesa") => l.filter((t) => t.tipo === tipo).reduce((a, t) => a + Number(t.valor), 0);
  const entradas = soma(atual, "receita");
  const saidas = soma(atual, "despesa");
  const entradasAnt = soma(ant, "receita");
  const saidasAnt = soma(ant, "despesa");
  const sobra = entradas - saidas;
  const insights: Insight[] = [];

  if (entradas === 0 && saidas === 0) {
    insights.push({ tom: "neutro", texto: "Nada lançado em Minha vida nesse período. Anote seus gastos e entradas pra o próximo relatório sair completo." });
    return { titulo: "Minha vida", numeros: [], insights };
  }

  insights.push(
    sobra >= 0
      ? { tom: "bom", texto: `Entrou ${moeda(entradas)} e saiu ${moeda(saidas)}: sobrou ${moeda(sobra)}.` }
      : { tom: "atencao", texto: `Saiu ${moeda(saidas)} e entrou ${moeda(entradas)}: você gastou ${moeda(-sobra)} a mais do que ganhou.` }
  );

  const vSaidas = variacao(saidas, saidasAnt);
  if (vSaidas != null && Math.abs(vSaidas) >= 5) {
    insights.push(
      vSaidas > 0
        ? { tom: "atencao", texto: `Seus gastos subiram ${pct(vSaidas)} em relação a ${p.anterior.rotulo}.` }
        : { tom: "bom", texto: `Seus gastos caíram ${pct(vSaidas)} em relação a ${p.anterior.rotulo}. Boa!` }
    );
  }

  const catAtual = somaPorCategoria(atual.filter((t) => t.tipo === "despesa"));
  const catAnt = somaPorCategoria(ant.filter((t) => t.tipo === "despesa"));
  const ordenadas = Array.from(catAtual.entries()).sort((a, b) => b[1] - a[1]);
  if (ordenadas[0] && saidas > 0) {
    insights.push({
      tom: "neutro",
      texto: `Seu maior gasto foi ${ordenadas[0][0]}: ${moeda(ordenadas[0][1])} (${pct((ordenadas[0][1] / saidas) * 100)} de tudo que saiu).`,
    });
  }
  // Categoria que mais cresceu (em reais), se cresceu de forma relevante.
  let maiorAlta: { nome: string; delta: number } | null = null;
  for (const [nome, v] of catAtual) {
    const delta = v - (catAnt.get(nome) ?? 0);
    if (delta > 0 && (!maiorAlta || delta > maiorAlta.delta)) maiorAlta = { nome, delta };
  }
  if (maiorAlta && saidasAnt > 0 && maiorAlta.delta >= Math.max(50, saidas * 0.05)) {
    insights.push({ tom: "atencao", texto: `${maiorAlta.nome} foi o que mais cresceu: ${moeda(maiorAlta.delta)} a mais que em ${p.anterior.rotulo}.` });
  }

  if (sobra > 0) {
    const sugestao = Math.round((sobra * 0.5) / 10) * 10;
    const meta = d.metas
      .filter((m) => m.status === "em_andamento" && Number(m.valor_meta) > Number(m.valor_atual))
      .sort((a, b) => Number(a.valor_atual) / Number(a.valor_meta) - Number(b.valor_atual) / Number(b.valor_meta))[0];
    if (sugestao > 0) {
      insights.push({
        tom: "bom",
        texto: meta
          ? `Dá pra guardar uns ${moeda(sugestao)} (metade do que sobrou) na meta "${meta.nome}" — faltam ${moeda(Number(meta.valor_meta) - Number(meta.valor_atual))} pra chegar lá.`
          : `Dá pra investir uns ${moeda(sugestao)} (metade do que sobrou) — numa reserva, CDB ou num empréstimo/revenda que você já faz.`,
      });
    }
  } else if (ordenadas[0]) {
    insights.push({ tom: "atencao", texto: `Pra fechar no azul no próximo período, comece segurando ${ordenadas[0][0]}.` });
  }

  return {
    titulo: "Minha vida",
    numeros: [
      { rotulo: "Entrou", valor: entradas, variacao: variacao(entradas, entradasAnt) },
      { rotulo: "Saiu", valor: saidas, variacao: vSaidas, subirEhRuim: true },
      { rotulo: sobra >= 0 ? "Sobrou" : "Faltou", valor: Math.abs(sobra) },
    ],
    insights,
  };
}

function secaoInvestimentos(d: DadosRelatorio, p: PeriodoRelatorio): SecaoRelatorio | null {
  if (d.investimentos.length === 0) return null;
  const insights: Insight[] = [];
  const porTipo = (tipo: Investimento["tipo"] | "outros") =>
    d.investimentos.filter((i) => (tipo === "outros" ? i.tipo !== "emprestimo" && i.tipo !== "revenda" : i.tipo === tipo));
  const lucro = (lista: Investimento[], a: string, b: string) => calcularLucroRecebidoEntre(lista, d.parcelasInv, d.pagamentosInv, a, b);

  const emprestimos = porTipo("emprestimo");
  const revendas = porTipo("revenda");
  const lucroTotal = lucro(d.investimentos, p.inicio, p.fim);
  const lucroAnt = lucro(d.investimentos, p.anterior.inicio, p.anterior.fim);
  const recebidoTotal = calcularRecebidoEntre(d.investimentos, d.parcelasInv, d.pagamentosInv, p.inicio, p.fim);

  if (emprestimos.length > 0) {
    const lucroEmp = lucro(emprestimos, p.inicio, p.fim);
    const naRua = emprestimos.filter((i) => !i.quitado).reduce((a, i) => a + Number(i.valor_investido), 0);
    if (lucroEmp > 0) {
      insights.push({
        tom: "bom",
        texto:
          naRua > 0
            ? `Empréstimos te deram ${moeda(lucroEmp)} de lucro — ${pct((lucroEmp / naRua) * 100)} sobre os ${moeda(naRua)} que estão emprestados agora.`
            : `Empréstimos te deram ${moeda(lucroEmp)} de lucro no período.`,
      });
    } else if (naRua > 0) {
      insights.push({ tom: "neutro", texto: `Você tem ${moeda(naRua)} emprestados e nada de lucro entrou nesse período.` });
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const atrasados = emprestimos.filter(
      (i) =>
        !i.quitado &&
        ((i.data_vencimento_final && i.data_vencimento_final < hoje && (i.forma_pagamento ?? "vista") === "vista") ||
          d.parcelasInv.some((pc) => pc.investimento_id === i.id && !pc.pago && pc.data_vencimento < hoje))
    );
    if (atrasados.length > 0) {
      insights.push({
        tom: "atencao",
        texto: `${atrasados.length} ${atrasados.length === 1 ? "empréstimo está" : "empréstimos estão"} com pagamento atrasado: ${atrasados
          .slice(0, 3)
          .map((i) => i.nome)
          .join(", ")}${atrasados.length > 3 ? "…" : ""}.`,
      });
    }
  }

  if (revendas.length > 0) {
    const lucroRev = lucro(revendas, p.inicio, p.fim);
    const naoVendidos = revendas.filter(
      (i) => (i.status_revenda ?? null) === "em_estoque" || (!i.status_revenda && !i.quitado && totalRecebidoRevenda(d.parcelasInv.filter((pc) => pc.investimento_id === i.id), d.pagamentosInv.filter((pg) => pg.investimento_id === i.id)) === 0 && (i.forma_pagamento ?? "vista") === "vista")
    );
    const parado = naoVendidos.reduce((a, i) => a + Number(i.valor_investido), 0);
    if (lucroRev > 0) insights.push({ tom: "bom", texto: `Compra e revenda: ${moeda(lucroRev)} de lucro recebido no período.` });
    if (naoVendidos.length > 0) {
      insights.push({
        tom: "neutro",
        texto: `${naoVendidos.length} ${naoVendidos.length === 1 ? "produto ainda não foi vendido" : "produtos ainda não foram vendidos"} (${moeda(parado)} parados). Vender gira o dinheiro de volta.`,
      });
    }
    const semPreco = revendas.filter((i) => !i.quitado && (i.preco_revenda == null || Number(i.preco_revenda) <= 0));
    if (semPreco.length > 0) insights.push({ tom: "atencao", texto: `${semPreco.length} na compra e revenda sem preço de revenda — sem ele não dá pra calcular o lucro.` });
  }

  const outros = porTipo("outros");
  if (outros.length > 0) {
    const aplicado = outros.reduce((a, i) => a + Number(i.valor_investido), 0);
    insights.push({ tom: "neutro", texto: `${moeda(aplicado)} aplicados em renda fixa, bolsa ou cripto.` });
  }

  const vLucro = variacao(lucroTotal, lucroAnt);
  if (vLucro != null && Math.abs(vLucro) >= 5) {
    insights.push(
      vLucro > 0
        ? { tom: "bom", texto: `O lucro dos investimentos foi ${pct(vLucro)} maior que em ${p.anterior.rotulo}.` }
        : { tom: "atencao", texto: `O lucro dos investimentos foi ${pct(vLucro)} menor que em ${p.anterior.rotulo}.` }
    );
  }

  return {
    titulo: "Investimentos",
    numeros: [
      { rotulo: "Lucro recebido", valor: lucroTotal, variacao: vLucro },
      { rotulo: "Entrou no total", valor: recebidoTotal },
    ],
    insights,
  };
}

function secaoEmpresa(d: DadosRelatorio, p: PeriodoRelatorio): SecaoRelatorio | null {
  if (!d.empresa) return null;
  const validas = d.empresa.transacoes.filter((t) => !ehMovimentoInterno(t));
  const soma = (a: string, b: string, tipo: "receita" | "despesa") =>
    validas.filter((t) => t.tipo === tipo && entre(t.data, a, b)).reduce((x, t) => x + Number(t.valor), 0);
  const faturamento = soma(p.inicio, p.fim, "receita");
  const custos = soma(p.inicio, p.fim, "despesa");
  const faturamentoAnt = soma(p.anterior.inicio, p.anterior.fim, "receita");
  const custosAnt = soma(p.anterior.inicio, p.anterior.fim, "despesa");
  const lucro = faturamento - custos;
  const vendasAtual = d.empresa.vendas.filter((v) => entre(v.data, p.inicio, p.fim));
  const vendasAnt = d.empresa.vendas.filter((v) => entre(v.data, p.anterior.inicio, p.anterior.fim));
  // Venda com carrinho tem várias linhas — conta vendas pelo grupo.
  const contarVendas = (l: Venda[]) => new Set(l.map((v) => v.grupo_venda_id ?? v.id)).size;
  const qtd = contarVendas(vendasAtual);
  const qtdAnt = contarVendas(vendasAnt);
  const totalVendido = vendasAtual.reduce((a, v) => a + Number(v.valor_total), 0);
  const insights: Insight[] = [];

  if (faturamento === 0 && custos === 0 && qtd === 0) {
    insights.push({ tom: "neutro", texto: "Nenhum movimento da empresa nesse período." });
    return { titulo: "Minha empresa", numeros: [], insights };
  }

  const vFat = variacao(faturamento, faturamentoAnt);
  if (vFat != null) {
    insights.push(
      vFat >= 5
        ? { tom: "bom", texto: `Suas vendas melhoraram: o faturamento subiu ${pct(vFat)} em relação a ${p.anterior.rotulo}.` }
        : vFat <= -5
          ? { tom: "atencao", texto: `Suas vendas caíram ${pct(vFat)} em relação a ${p.anterior.rotulo}.` }
          : { tom: "neutro", texto: `Faturamento parecido com ${p.anterior.rotulo}.` }
    );
  }
  insights.push(
    lucro >= 0
      ? { tom: "bom", texto: `A empresa faturou ${moeda(faturamento)}, gastou ${moeda(custos)} e sobrou ${moeda(lucro)}${faturamento > 0 ? ` (${pct((lucro / faturamento) * 100)} do faturamento)` : ""}.` }
      : { tom: "atencao", texto: `A empresa gastou ${moeda(-lucro)} a mais do que faturou nesse período.` }
  );
  const vCustos = variacao(custos, custosAnt);
  if (vCustos != null && vCustos >= 15 && (vFat == null || vCustos > vFat + 10)) {
    insights.push({ tom: "atencao", texto: `Os custos subiram ${pct(vCustos)} — mais rápido que as vendas.` });
  }
  if (qtd > 0) {
    const ticket = totalVendido / qtd;
    insights.push({ tom: "neutro", texto: `${qtd} ${qtd === 1 ? "venda" : "vendas"}, ticket médio de ${moeda(ticket)}${qtdAnt > 0 ? ` (antes: ${qtdAnt})` : ""}.` });
    const porProduto = new Map<string, { valor: number; lucro: number }>();
    for (const v of vendasAtual) {
      const atual = porProduto.get(v.produto_nome) ?? { valor: 0, lucro: 0 };
      atual.valor += Number(v.valor_total);
      atual.lucro += Number(v.valor_total) - Number(v.custo_unitario) * Number(v.quantidade);
      porProduto.set(v.produto_nome, atual);
    }
    const top = Array.from(porProduto.entries()).sort((a, b) => b[1].valor - a[1].valor)[0];
    if (top) insights.push({ tom: "bom", texto: `O que mais vendeu: ${top[0]} (${moeda(top[1].valor)}, lucro de ${moeda(top[1].lucro)}).` });
  }

  return {
    titulo: "Minha empresa",
    numeros: [
      { rotulo: "Faturamento", valor: faturamento, variacao: vFat },
      { rotulo: "Custos", valor: custos, variacao: vCustos, subirEhRuim: true },
      { rotulo: lucro >= 0 ? "Sobrou" : "Prejuízo", valor: Math.abs(lucro) },
    ],
    insights,
  };
}

export function montarRelatorio(d: DadosRelatorio, p: PeriodoRelatorio): Relatorio {
  return { vida: secaoVida(d, p), investimentos: secaoInvestimentos(d, p), empresa: secaoEmpresa(d, p) };
}
