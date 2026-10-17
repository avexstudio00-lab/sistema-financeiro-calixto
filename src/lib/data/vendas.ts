import { supabase } from "@/lib/supabase/client";
import { campoEmpresa, filtrarPorEmpresa } from "@/lib/empresa/empresaAtiva";
import { criarTransacao, deletarTransacao } from "./transacoes";
import { ajustarEstoque } from "./produtos";
import {
  diasEntreDatasIso,
  validarCondicoesFiado,
  type PadraoFiado,
  type ParcelaFiado,
  type PeriodicidadeFiado,
} from "@/lib/util/fiado";
import { NOMES_MES } from "@/lib/format";
import type { Venda, Produto, Servico, Transacao } from "./tipos";

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

  const { data } = await filtrarPorEmpresa(query);
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

/** Um item do carrinho (seção 15.1): produto do estoque OU serviço do
 * catálogo, com quantidade e valor unitário próprios. */
export interface ItemVenda {
  produto?: Produto | null;
  servico?: Servico | null;
  quantidade: number;
  valorUnitario: number;
}

/** Fiado flexível (seção 15.2): termos definidos a cada venda. */
export interface CondicoesFiadoVenda {
  /** Entrada paga na hora (entra no caixa já). */
  entrada?: { valor: number; forma: NonNullable<Transacao["forma_pagamento"]>; contaId: string | null } | null;
  /** Parcelas com vencimento e valor de cada uma (podem ser diferentes). */
  parcelas: ParcelaFiado[];
  periodicidade: PeriodicidadeFiado;
  /** Grava estas condições como padrão do cliente. */
  salvarComoPadrao?: boolean;
}

export interface DadosVenda {
  usuarioId: string;
  /** Seção 15.1: vários itens (produtos e/ou serviços) na mesma venda. */
  itens: ItemVenda[];
  formaPagamento: Transacao["forma_pagamento"];
  data: string;
  clienteId: string | null;
  contaId: string | null;
  /** Venda fiada (a prazo): em vez de entrar no caixa agora, vira conta a
   * receber no nome do cliente, nas condições combinadas. */
  fiado?: CondicoesFiadoVenda | null;
  /** Checklist (10/out/2026): várias formas de pagamento na mesma venda
   * (ex.: R$ 50 no Pix + R$ 30 em dinheiro). Com 2+ itens, gera um
   * lançamento de receita por forma, cada um na sua carteira. A soma precisa
   * bater com o total da venda (a tela confere). */
  pagamentos?: PagamentoVenda[] | null;
}

export interface PagamentoVenda {
  forma: NonNullable<Transacao["forma_pagamento"]>;
  valor: number;
  contaId: string | null;
  transacao_id?: string | null;
}

/** Empresa da venda quando a tela está na visão "todas": a do cliente (se
 * houver) — assim a venda nunca cai numa empresa diferente da do cliente
 * (causa do "total comprado zerado" do item 4.16). */
async function empresaParaVenda(clienteId: string | null): Promise<{ empresa_id?: string }> {
  const ativa = campoEmpresa();
  if (ativa.empresa_id || !clienteId) return ativa;
  const { data } = await supabase.from("clientes").select("empresa_id").eq("id", clienteId).maybeSingle();
  const id = (data as { empresa_id: string | null } | null)?.empresa_id;
  return id ? { empresa_id: id } : {};
}

/** Nome curto da venda para o extrato: "Corte" ou "Corte + 2 itens". */
export function descricaoDaVenda(nomes: string[]): string {
  if (nomes.length === 0) return "Venda";
  if (nomes.length === 1) return nomes[0];
  return `${nomes[0]} + ${nomes.length - 1} ${nomes.length - 1 === 1 ? "item" : "itens"}`;
}

/** Total da venda = soma dos subtotais (quantidade × valor unitário). */
export function totalDosItens(itens: Pick<ItemVenda, "quantidade" | "valorUnitario">[]): number {
  return Number(itens.reduce((acc, i) => acc + Number((i.quantidade * i.valorUnitario).toFixed(2)), 0).toFixed(2));
}

async function apagarTransacoesPorId(ids: (string | null | undefined)[]) {
  for (const id of ids) {
    if (!id) continue;
    // eslint-disable-next-line no-await-in-loop -- sequencial: cada uma ajusta saldo
    const { data: t } = await supabase.from("transacoes").select("*").eq("id", id).maybeSingle();
    // eslint-disable-next-line no-await-in-loop
    if (t) await deletarTransacao(t as Transacao);
  }
}

/**
 * Registra uma venda (seção 15.1: com 1 ou mais itens): grava uma linha em
 * `vendas` por item, todas com o mesmo `grupo_venda_id`; gera o lançamento
 * de receita pelo TOTAL (ou um por forma de pagamento, ou só a entrada no
 * fiado) — preso à 1ª linha — e dá baixa no estoque de cada produto. Se a
 * quantidade vendida for maior que o estoque, o estoque só é zerado (nunca
 * fica negativo) — a venda não é bloqueada por isso.
 */
export async function registrarVenda(dados: DadosVenda) {
  const itens = dados.itens.filter((i) => (i.produto || i.servico) && i.quantidade > 0);
  if (itens.length === 0) return { data: null, error: new Error("Adicione pelo menos um produto ou serviço.") };
  if (itens.some((i) => !Number.isInteger(i.quantidade))) {
    return { data: null, error: new Error("A quantidade de cada item precisa ser um número inteiro.") };
  }
  const nomes = itens.map((i) => (i.produto ?? i.servico)!.nome);
  const descricao = descricaoDaVenda(nomes);
  const valorTotal = totalDosItens(itens);
  const fiado = dados.fiado && dados.clienteId ? dados.fiado : null;
  if (fiado) {
    const erroFiado = validarCondicoesFiado(valorTotal, fiado.entrada?.valor ?? 0, fiado.parcelas, dados.data);
    if (erroFiado) return { data: null, error: new Error(erroFiado) };
  }
  const categoriaId = await idCategoriaVendas();
  const empresa = await empresaParaVenda(dados.clienteId);
  const grupoVendaId = crypto.randomUUID();

  let transacao: Transacao | null = null;
  const dividida = !fiado && dados.pagamentos && dados.pagamentos.length >= 2 ? dados.pagamentos : null;
  const pagamentosGravados: PagamentoVenda[] = [];
  const desfazerCaixa = () =>
    apagarTransacoesPorId(dividida ? pagamentosGravados.map((p) => p.transacao_id) : [transacao?.id]);

  if (dividida) {
    for (const pg of dividida) {
      // eslint-disable-next-line no-await-in-loop -- sequencial: cada um ajusta saldo
      const { data: t, error: erroT } = await criarTransacao({
        usuario_id: dados.usuarioId,
        conta_id: pg.contaId,
        categoria_id: categoriaId,
        tipo: "receita",
        valor: Number(pg.valor.toFixed(2)),
        descricao: `${descricao} (${pg.forma})`,
        data: dados.data,
        forma_pagamento: pg.forma,
        tipo_negocio: "negocio",
        ...empresa,
      });
      if (erroT || !t) {
        await desfazerCaixa();
        return { data: null, error: erroT };
      }
      pagamentosGravados.push({ ...pg, transacao_id: (t as Transacao).id });
      if (!transacao) transacao = t as Transacao;
    }
  } else if (!fiado || (fiado.entrada && fiado.entrada.valor > 0)) {
    // À vista: o total. Fiado com entrada: só a entrada entra no caixa agora.
    const entrada = fiado?.entrada ?? null;
    const { data: t, error: erroTransacao } = await criarTransacao({
      usuario_id: dados.usuarioId,
      conta_id: entrada ? entrada.contaId : dados.contaId,
      categoria_id: categoriaId,
      tipo: "receita",
      valor: entrada ? Number(entrada.valor.toFixed(2)) : valorTotal,
      descricao: entrada ? `Entrada (fiado): ${descricao}` : descricao,
      data: dados.data,
      forma_pagamento: entrada ? entrada.forma : dados.formaPagamento,
      tipo_negocio: "negocio",
      ...empresa,
    });
    if (erroTransacao || !t) {
      return { data: null, error: erroTransacao };
    }
    transacao = t as Transacao;
  }

  const linhas = itens.map((item, i) => {
    const custoUnitario = item.produto ? Number(item.produto.custo) : Number(item.servico?.custo ?? 0);
    return {
      ...empresa,
      usuario_id: dados.usuarioId,
      grupo_venda_id: grupoVendaId,
      // O caixa (lançamento e formas de pagamento) fica preso à 1ª linha.
      pagamentos: i === 0 && dividida ? pagamentosGravados : null,
      transacao_id: i === 0 ? transacao?.id ?? null : null,
      produto_id: item.produto?.id ?? null,
      servico_id: item.produto ? null : item.servico?.id ?? null,
      produto_nome: nomes[i],
      quantidade: item.quantidade,
      valor_unitario: item.valorUnitario,
      custo_unitario: custoUnitario,
      valor_total: Number((item.quantidade * item.valorUnitario).toFixed(2)),
      forma_pagamento: fiado ? null : dados.formaPagamento,
      cliente_id: dados.clienteId,
      data: dados.data,
    };
  });
  const { data: vendasGravadas, error: erroVenda } = await supabase.from("vendas").insert(linhas).select();

  if (erroVenda || !vendasGravadas) {
    // O lançamento de receita já foi criado — desfaz pra não deixar um
    // lançamento órfão (e seu efeito no saldo da conta).
    await desfazerCaixa();
    return { data: null, error: erroVenda };
  }

  if (fiado) {
    const n = fiado.parcelas.length;
    const titulos = fiado.parcelas.map((p, i) => ({
      ...empresa,
      usuario_id: dados.usuarioId,
      cliente_id: dados.clienteId,
      descricao: n > 1 ? `Fiado: ${descricao} (${i + 1}/${n})` : `Fiado: ${descricao}`,
      valor: Number(p.valor.toFixed(2)),
      vencimento: p.vencimento,
      origem: "fiado",
      venda_grupo_id: grupoVendaId,
      grupo_parcela_id: n > 1 ? grupoVendaId : null,
      parcela_numero: n > 1 ? i + 1 : null,
      parcela_total: n > 1 ? n : null,
    }));
    const { error: erroFiado } = await supabase.from("contas_receber").insert(titulos);
    if (erroFiado) {
      await supabase.from("vendas").delete().eq("grupo_venda_id", grupoVendaId);
      await desfazerCaixa();
      return { data: null, error: erroFiado };
    }
    if (fiado.salvarComoPadrao && dados.clienteId) {
      const entradaPct = fiado.entrada && fiado.entrada.valor > 0 ? Number(((fiado.entrada.valor / valorTotal) * 100).toFixed(2)) : 0;
      const padrao: PadraoFiado = {
        parcelas: n,
        periodicidade: fiado.periodicidade,
        dias_primeiro_vencimento: Math.max(0, diasEntreDatasIso(dados.data, fiado.parcelas[0].vencimento)),
        entrada_percentual: entradaPct,
      };
      // Falhar aqui não desfaz a venda: é só uma preferência.
      await supabase.from("clientes").update({ padrao_fiado: padrao }).eq("id", dados.clienteId);
    }
  }

  // Baixa de estoque por produto (somando se o mesmo produto aparece em
  // mais de uma linha). Lê o estoque atual do banco em vez de confiar no
  // formulário, pra não perder baixas concorrentes.
  const porProduto = new Map<string, { produto: Produto; quantidade: number }>();
  for (const item of itens) {
    if (!item.produto) continue;
    const atual = porProduto.get(item.produto.id);
    porProduto.set(item.produto.id, { produto: item.produto, quantidade: (atual?.quantidade ?? 0) + item.quantidade });
  }
  const estoqueInsuficiente: string[] = [];
  for (const { produto, quantidade } of porProduto.values()) {
    // eslint-disable-next-line no-await-in-loop
    const { data: produtoAtual } = await supabase.from("produtos").select("quantidade_estoque").eq("id", produto.id).maybeSingle();
    const antes = produtoAtual ? Number(produtoAtual.quantidade_estoque) : Number(produto.quantidade_estoque);
    // eslint-disable-next-line no-await-in-loop
    await ajustarEstoque(produto.id, antes, -quantidade);
    if (quantidade > antes) estoqueInsuficiente.push(produto.nome);
  }

  return { data: vendasGravadas as Venda[], error: null, estoqueInsuficiente };
}

/** Linhas que formam a mesma venda (carrinho). Vendas antigas, sem grupo,
 * são só a própria linha. */
export function chaveDaVenda(v: Pick<Venda, "id" | "grupo_venda_id">): string {
  return v.grupo_venda_id ?? v.id;
}

export interface VendaAgrupada {
  chave: string;
  linhas: Venda[];
  total: number;
  data: string;
  criado_em: string;
  cliente: Venda["clientes"];
}

/** Junta as linhas da mesma venda, mantendo a ordem da lista. */
export function agruparLinhasDeVenda(vendas: Venda[]): VendaAgrupada[] {
  const mapa = new Map<string, VendaAgrupada>();
  for (const v of vendas) {
    const chave = chaveDaVenda(v);
    const atual = mapa.get(chave);
    if (atual) {
      atual.linhas.push(v);
      atual.total = Number((atual.total + Number(v.valor_total)).toFixed(2));
    } else {
      mapa.set(chave, { chave, linhas: [v], total: Number(v.valor_total), data: v.data, criado_em: v.criado_em, cliente: v.clientes ?? null });
    }
  }
  return Array.from(mapa.values());
}

/** Apaga a venda INTEIRA (todas as linhas do carrinho): remove os
 * lançamentos de caixa (desfazendo o efeito no saldo), as parcelas do fiado
 * ainda não recebidas e devolve as quantidades ao estoque. Se alguma
 * parcela do fiado já foi recebida, não apaga (a pessoa desfaz o
 * recebimento antes) — senão o dinheiro recebido ficaria sem origem. */
export async function deletarVenda(venda: Venda) {
  let linhas: Venda[] = [venda];
  if (venda.grupo_venda_id) {
    const { data } = await supabase.from("vendas").select("*").eq("grupo_venda_id", venda.grupo_venda_id);
    if (data && data.length > 0) linhas = data as Venda[];
  }

  if (venda.grupo_venda_id) {
    const { data: titulos } = await supabase
      .from("contas_receber")
      .select("id, status")
      .eq("venda_grupo_id", venda.grupo_venda_id);
    const lista = (titulos as { id: string; status: string }[] | null) ?? [];
    if (lista.some((t) => t.status === "recebido")) {
      return { error: new Error("Esta venda tem parcelas do fiado já recebidas. Desfaça o recebimento em Contas → A receber antes de apagar.") };
    }
    if (lista.length > 0) {
      const { error: e } = await supabase.from("contas_receber").delete().eq("venda_grupo_id", venda.grupo_venda_id);
      if (e) return { error: e };
    }
  }

  // Ordem pensada para tentativa repetida não duplicar nada: primeiro os
  // lançamentos (idempotente — o que já foi apagado não é achado de novo),
  // depois as linhas da venda e, SÓ por último, a devolução do estoque.
  const ids = linhas
    .flatMap((l) => [...(Array.isArray(l.pagamentos) ? l.pagamentos.map((p) => p.transacao_id) : []), l.transacao_id])
    .filter((id, i, arr): id is string => !!id && arr.indexOf(id) === i);
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const { data: t } = await supabase.from("transacoes").select("*").eq("id", id).maybeSingle();
    if (t) {
      // eslint-disable-next-line no-await-in-loop
      const { error: e } = await deletarTransacao(t as Transacao);
      if (e) return { error: e };
    }
  }

  const { error } = venda.grupo_venda_id
    ? await supabase.from("vendas").delete().eq("grupo_venda_id", venda.grupo_venda_id)
    : await supabase.from("vendas").delete().eq("id", venda.id);
  if (error) return { error };

  for (const l of linhas) {
    if (!l.produto_id) continue;
    // eslint-disable-next-line no-await-in-loop
    const { data: produto } = await supabase.from("produtos").select("quantidade_estoque").eq("id", l.produto_id).maybeSingle();
    if (produto) {
      // eslint-disable-next-line no-await-in-loop
      await ajustarEstoque(l.produto_id, Number(produto.quantidade_estoque), l.quantidade);
    }
  }
  return { error: null };
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
  // Seção 15.1: uma venda com vários itens conta como UMA venda.
  const quantidadeVendas = new Set(vendas.map(chaveDaVenda)).size;
  return {
    totalVendido,
    lucroReal,
    quantidadeVendas,
    ticketMedio: quantidadeVendas > 0 ? totalVendido / quantidadeVendas : 0,
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

// ---------------------------------------------------------------------------
// Inteligência comercial (itens 5.14, 5.16 e 7.2 da especificação de 03/out)
// ---------------------------------------------------------------------------

export interface ResumoVendasHoje {
  totalHoje: number;
  quantidade24h: number;
  ultimos: Venda[];
}

/** Painel "vendas do dia": total vendido hoje, nº de vendas nas últimas 24h
 * (pela hora de registro) e as 3 últimas vendas registradas. */
export function resumirVendasHoje(vendas: Venda[], hojeIso: string): ResumoVendasHoje {
  const limite24h = Date.now() - 24 * 60 * 60 * 1000;
  const totalHoje = vendas.filter((v) => v.data === hojeIso).reduce((acc, v) => acc + Number(v.valor_total), 0);
  const quantidade24h = new Set(vendas.filter((v) => new Date(v.criado_em).getTime() >= limite24h).map(chaveDaVenda)).size;
  const ultimos = [...vendas].sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1)).slice(0, 3);
  return { totalHoje, quantidade24h, ultimos };
}

export interface ItemRankingABC {
  nome: string;
  quantidade: number;
  faturamento: number;
  lucro: number;
  margem: number;
  participacao: number;
  classe: "A" | "B" | "C";
}

/** Ranking ABC por lucro real (7.2): lucro = (preço praticado − custo) ×
 * quantidade, somado por produto/serviço. Classe A = itens que somam os
 * primeiros 80% do lucro; B = até 95%; C = o resto. */
export function rankingABC(vendas: Venda[]): ItemRankingABC[] {
  const mapa = new Map<string, { nome: string; quantidade: number; faturamento: number; lucro: number }>();
  for (const v of vendas) {
    const chave = v.produto_id ?? v.servico_id ?? v.produto_nome;
    const atual = mapa.get(chave) ?? { nome: v.produto_nome, quantidade: 0, faturamento: 0, lucro: 0 };
    atual.quantidade += v.quantidade;
    atual.faturamento += Number(v.valor_total);
    atual.lucro += (Number(v.valor_unitario) - Number(v.custo_unitario)) * v.quantidade;
    mapa.set(chave, atual);
  }
  const itens = Array.from(mapa.values()).sort((a, b) => b.lucro - a.lucro);
  const lucroTotal = itens.reduce((acc, i) => acc + Math.max(0, i.lucro), 0);
  let acumulado = 0;
  return itens.map((i) => {
    const participacao = lucroTotal > 0 ? Math.max(0, i.lucro) / lucroTotal : 0;
    acumulado += participacao;
    const classe: "A" | "B" | "C" = acumulado <= 0.8 || (participacao > 0 && acumulado - participacao < 0.8) ? "A" : acumulado <= 0.95 ? "B" : "C";
    return {
      ...i,
      margem: i.faturamento > 0 ? (i.lucro / i.faturamento) * 100 : 0,
      participacao: participacao * 100,
      classe: i.lucro <= 0 ? "C" : classe,
    };
  });
}

export interface PontoTicketMedio {
  rotulo: string;
  ticketMedio: number;
  vendas: number;
}

/** Ticket médio mês a mês nos últimos `meses` meses (5.16). */
export function ticketMedioPorMes(vendas: Venda[], meses = 6): PontoTicketMedio[] {
  const agora = new Date();
  const pontos: PontoTicketMedio[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const prefixo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const doMes = vendas.filter((v) => v.data.startsWith(prefixo));
    const total = doMes.reduce((acc, v) => acc + Number(v.valor_total), 0);
    const qtd = new Set(doMes.map(chaveDaVenda)).size;
    pontos.push({ rotulo: NOMES_MES[d.getMonth()], ticketMedio: qtd ? total / qtd : 0, vendas: qtd });
  }
  return pontos;
}

export interface PontoRitmoDiario {
  dia: number;
  valor: number;
  mediaMovel: number;
}

/** Vendas dia a dia no mês com média móvel de 7 dias (5.16). */
export function ritmoDiarioComMediaMovel(vendas: Venda[], ano: number, mesNumero: number, janela = 7): PontoRitmoDiario[] {
  const pontos = agruparVendasPorDia(vendas, ano, mesNumero);
  return pontos.map((p, i) => {
    const inicio = Math.max(0, i - janela + 1);
    const fatia = pontos.slice(inicio, i + 1);
    return { dia: p.dia, valor: p.valor, mediaMovel: fatia.reduce((acc, x) => acc + x.valor, 0) / fatia.length };
  });
}
