import { supabase } from "@/lib/supabase/client";
import { criarTransacao, deletarTransacao } from "./transacoes";
import { ajustarEstoque } from "./produtos";
import { NOMES_MES } from "@/lib/format";
import type { Venda, Produto, Transacao } from "./tipos";

export async function listarVendas(
  usuarioId: string,
  filtros?: { inicio?: string; fim?: string }
): Promise<Venda[]> {
  let query = supabase
    .from("vendas")
    .select("*, clientes(*)")
    .eq("usuario_id", usuarioId)
    .order("data", { ascending: false })
    .order("criado_em", { ascending: false });

  if (filtros?.inicio) query = query.gte("data", filtros.inicio);
  if (filtros?.fim) query = query.lte("data", filtros.fim);

  const { data } = await query;
  return (data as Venda[]) ?? [];
}

async function idCategoriaVendas(): Promise<string | null> {
  const { data } = await supabase
    .from("categorias")
    .select("id")
    .is("usuario_id", null)
    .eq("nome", "Vendas")
    .eq("tipo", "receita")
    .maybeSingle();
  return data?.id ?? null;
}

export interface DadosVenda {
  usuarioId: string;
  produto: Produto;
  quantidade: number;
  valorUnitario: number;
  formaPagamento: Transacao["forma_pagamento"];
  data: string;
  clienteId: string | null;
  contaId: string | null;
}

/**
 * Registra uma venda: cria a linha em `vendas`, gera a transação de receita
 * correspondente (pra entrar no faturamento/fluxo de caixa da empresa) e dá
 * baixa no estoque do produto. Se a quantidade vendida for maior que o
 * estoque disponível, o estoque só é zerado (nunca fica negativo) — a venda
 * não é bloqueada por isso, só o produto fica com estoque zerado.
 */
export async function registrarVenda(dados: DadosVenda) {
  const valorTotal = Number((dados.quantidade * dados.valorUnitario).toFixed(2));
  const categoriaId = await idCategoriaVendas();

  const { data: transacao, error: erroTransacao } = await criarTransacao({
    usuario_id: dados.usuarioId,
    conta_id: dados.contaId,
    categoria_id: categoriaId,
    tipo: "receita",
    valor: valorTotal,
    descricao: dados.produto.nome,
    data: dados.data,
    forma_pagamento: dados.formaPagamento,
    tipo_negocio: "negocio",
  });
  if (erroTransacao || !transacao) {
    return { data: null, error: erroTransacao };
  }

  const { data: venda, error: erroVenda } = await supabase
    .from("vendas")
    .insert({
      usuario_id: dados.usuarioId,
      produto_id: dados.produto.id,
      produto_nome: dados.produto.nome,
      quantidade: dados.quantidade,
      valor_unitario: dados.valorUnitario,
      custo_unitario: dados.produto.custo,
      valor_total: valorTotal,
      forma_pagamento: dados.formaPagamento,
      cliente_id: dados.clienteId,
      data: dados.data,
      transacao_id: (transacao as { id: string }).id,
    })
    .select()
    .single();

  if (erroVenda) {
    // A transação de receita já foi criada — desfaz pra não deixar um
    // lançamento órfão (e seu efeito no saldo da conta) caso a venda em si
    // não possa ser salva.
    await deletarTransacao(transacao as Transacao);
    return { data: null, error: erroVenda };
  }

  // Lê o estoque atual direto do banco (em vez de confiar no valor que veio
  // no formulário) pra evitar perder baixas concorrentes de outra venda do
  // mesmo produto feita entre a abertura da tela e o salvamento.
  const { data: produtoAtual } = await supabase
    .from("produtos")
    .select("quantidade_estoque")
    .eq("id", dados.produto.id)
    .maybeSingle();
  const estoqueAntesDaBaixa = produtoAtual
    ? Number(produtoAtual.quantidade_estoque)
    : Number(dados.produto.quantidade_estoque);
  const novoEstoque = await ajustarEstoque(dados.produto.id, estoqueAntesDaBaixa, -dados.quantidade);
  const estoqueInsuficiente = dados.quantidade > estoqueAntesDaBaixa;

  return { data: venda, error: null, novoEstoque, estoqueInsuficiente };
}

/** Apaga a venda, devolve a quantidade ao estoque do produto (se ele ainda
 * existir) e remove a transação de receita vinculada, desfazendo o efeito
 * dela no saldo da conta — mesmo padrão de `deletarTransacao`. Retorna um
 * erro se qualquer uma dessas etapas falhar, pra tela avisar o usuário em
 * vez de dar como concluído silenciosamente. */
export async function deletarVenda(venda: Venda) {
  if (venda.produto_id) {
    const { data: produto } = await supabase
      .from("produtos")
      .select("quantidade_estoque")
      .eq("id", venda.produto_id)
      .maybeSingle();
    if (produto) {
      await ajustarEstoque(venda.produto_id, Number(produto.quantidade_estoque), venda.quantidade);
    }
  }

  if (venda.transacao_id) {
    const { data: transacao } = await supabase
      .from("transacoes")
      .select("*")
      .eq("id", venda.transacao_id)
      .maybeSingle();
    if (transacao) {
      const { error: erroTransacao } = await deletarTransacao(transacao as Transacao);
      if (erroTransacao) {
        return { error: erroTransacao };
      }
    }
  }

  const { error } = await supabase.from("vendas").delete().eq("id", venda.id);
  return { error };
}

export interface ResumoVendas {
  totalVendido: number;
  ticketMedio: number;
  lucroReal: number;
  quantidadeVendas: number;
}

export function resumirVendas(vendas: Venda[]): ResumoVendas {
  const totalVendido = vendas.reduce((acc, v) => acc + Number(v.valor_total), 0);
  const lucroReal = vendas.reduce(
    (acc, v) => acc + (Number(v.valor_unitario) - Number(v.custo_unitario)) * v.quantidade,
    0
  );
  return {
    totalVendido,
    lucroReal,
    quantidadeVendas: vendas.length,
    ticketMedio: vendas.length > 0 ? totalVendido / vendas.length : 0,
  };
}

export interface PontoVendasPorDia {
  dia: number;
  valor: number;
}

/** Soma o valor vendido por dia do mês informado, pro gráfico de vendas. */
export function agruparVendasPorDia(vendas: Venda[], ano: number, mesNumero: number): PontoVendasPorDia[] {
  const ultimoDia = new Date(ano, mesNumero, 0).getDate();
  const porDia = new Array(ultimoDia + 1).fill(0) as number[];

  for (const v of vendas) {
    const dt = new Date(v.data + "T00:00:00");
    if (dt.getFullYear() !== ano || dt.getMonth() + 1 !== mesNumero) continue;
    porDia[dt.getDate()] += Number(v.valor_total);
  }

  const pontos: PontoVendasPorDia[] = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    pontos.push({ dia, valor: porDia[dia] });
  }
  return pontos;
}

export interface PontoVendasPeriodo {
  rotulo: string;
  valor: number;
}

/** Vendas somadas por semana (1ª a 5ª) dentro do mês informado. */
export function agruparVendasPorSemana(vendas: Venda[], ano: number, mesNumero: number): PontoVendasPeriodo[] {
  const doMes = vendas.filter((v) => {
    const dt = new Date(v.data + "T00:00:00");
    return dt.getFullYear() === ano && dt.getMonth() + 1 === mesNumero;
  });
  const semanas = new Map<number, number>();
  for (const v of doMes) {
    const dt = new Date(v.data + "T00:00:00");
    const semana = Math.ceil(dt.getDate() / 7);
    semanas.set(semana, (semanas.get(semana) ?? 0) + Number(v.valor_total));
  }
  const maxSemana = Math.max(1, ...Array.from(semanas.keys()));
  const pontos: PontoVendasPeriodo[] = [];
  for (let s = 1; s <= maxSemana; s++) {
    pontos.push({ rotulo: `Semana ${s}`, valor: semanas.get(s) ?? 0 });
  }
  return pontos;
}

/** Vendas somadas mês a mês, considerando só o que já estiver na lista
 * (a página busca um período mais largo pra alimentar essa visão). */
export function agruparVendasPorMes(vendas: Venda[], meses = 6): PontoVendasPeriodo[] {
  const agora = new Date();
  const pontos: PontoVendasPeriodo[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const ano = d.getFullYear();
    const mesNumero = d.getMonth() + 1;
    const total = vendas
      .filter((v) => {
        const dt = new Date(v.data + "T00:00:00");
        return dt.getFullYear() === ano && dt.getMonth() + 1 === mesNumero;
      })
      .reduce((acc, v) => acc + Number(v.valor_total), 0);
    pontos.push({ rotulo: NOMES_MES[mesNumero - 1], valor: total });
  }
  return pontos;
}
