import { supabase } from "@/lib/supabase/client";
import { campoEmpresa, filtrarPorEmpresa } from "@/lib/empresa/empresaAtiva";
import { criarTransacao, deletarTransacao } from "./transacoes";
import { ajustarEstoque } from "./produtos";
import { criarContaReceberParcelada } from "./contasEmpresa";
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

export interface DadosVenda {
  usuarioId: string;
  /** Um dos dois: produto do estoque OU serviço do catálogo (item 5.6). */
  produto?: Produto | null;
  servico?: Servico | null;
  quantidade: number;
  valorUnitario: number;
  formaPagamento: Transacao["forma_pagamento"];
  data: string;
  clienteId: string | null;
  contaId: string | null;
  /** Venda fiada (a prazo, item 5.2): em vez de entrar no caixa agora, vira
   * conta a receber parcelada no nome do cliente. */
  fiado?: { parcelas: number; primeiroVencimento: string } | null;
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

/**
 * Registra uma venda: cria a linha em `vendas`, gera a transação de receita
 * correspondente (pra entrar no faturamento/fluxo de caixa da empresa) e dá
 * baixa no estoque do produto. Se a quantidade vendida for maior que o
 * estoque disponível, o estoque só é zerado (nunca fica negativo) — a venda
 * não é bloqueada por isso, só o produto fica com estoque zerado.
 */
export async function registrarVenda(dados: DadosVenda) {
  const item = dados.produto ?? dados.servico;
  if (!item) return { data: null, error: new Error("Escolha um produto ou serviço.") };
  const nomeItem = item.nome;
  const valorTotal = Number((dados.quantidade * dados.valorUnitario).toFixed(2));
  const categoriaId = await idCategoriaVendas();
  const fiado = dados.fiado && dados.clienteId ? dados.fiado : null;

  const empresa = await empresaParaVenda(dados.clienteId);
  let transacao: Transacao | null = null;
  const dividida = !fiado && dados.pagamentos && dados.pagamentos.length >= 2 ? dados.pagamentos : null;
  const pagamentosGravados: PagamentoVenda[] = [];
  if (dividida) {
    for (const pg of dividida) {
      // eslint-disable-next-line no-await-in-loop -- sequencial: cada um ajusta saldo
      const { data: t, error: erroT } = await criarTransacao({
        usuario_id: dados.usuarioId,
        conta_id: pg.contaId,
        categoria_id: categoriaId,
        tipo: "receita",
        valor: Number(pg.valor.toFixed(2)),
        descricao: `${nomeItem} (${pg.forma})`,
        data: dados.data,
        forma_pagamento: pg.forma,
        tipo_negocio: "negocio",
        ...empresa,
      });
      if (erroT || !t) {
        for (const feito of pagamentosGravados) {
          // eslint-disable-next-line no-await-in-loop
          const { data: tt } = await supabase.from("transacoes").select("*").eq("id", feito.transacao_id).maybeSingle();
          // eslint-disable-next-line no-await-in-loop
          if (tt) await deletarTransacao(tt as Transacao);
        }
        return { data: null, error: erroT };
      }
      pagamentosGravados.push({ ...pg, transacao_id: (t as Transacao).id });
      if (!transacao) transacao = t as Transacao;
    }
  } else if (!fiado) {
    const { data: t, error: erroTransacao } = await criarTransacao({
      usuario_id: dados.usuarioId,
      conta_id: dados.contaId,
      categoria_id: categoriaId,
      tipo: "receita",
      valor: valorTotal,
      descricao: nomeItem,
      data: dados.data,
      forma_pagamento: dados.formaPagamento,
      tipo_negocio: "negocio",
      ...empresa,
    });
    if (erroTransacao || !t) {
      return { data: null, error: erroTransacao };
    }
    transacao = t as Transacao;
  }

  const custoUnitario = dados.produto ? Number(dados.produto.custo) : Number(dados.servico?.custo ?? 0);
  const { data: venda, error: erroVenda } = await supabase
    .from("vendas")
    .insert({
      ...empresa,
      usuario_id: dados.usuarioId,
      pagamentos: dividida ? pagamentosGravados : null,
      produto_id: dados.produto?.id ?? null,
      servico_id: dados.produto ? null : dados.servico?.id ?? null,
      produto_nome: nomeItem,
      quantidade: dados.quantidade,
      valor_unitario: dados.valorUnitario,
      custo_unitario: custoUnitario,
      valor_total: valorTotal,
      forma_pagamento: dados.formaPagamento,
      cliente_id: dados.clienteId,
      data: dados.data,
      transacao_id: transacao?.id ?? null,
    })
    .select()
    .single();

  if (erroVenda) {
    // A transação de receita já foi criada — desfaz pra não deixar um
    // lançamento órfão (e seu efeito no saldo da conta) caso a venda em si
    // não possa ser salva.
    if (dividida) {
      for (const pg of pagamentosGravados) {
        // eslint-disable-next-line no-await-in-loop
        const { data: tt } = await supabase.from("transacoes").select("*").eq("id", pg.transacao_id).maybeSingle();
        // eslint-disable-next-line no-await-in-loop
        if (tt) await deletarTransacao(tt as Transacao);
      }
    } else if (transacao) await deletarTransacao(transacao);
    return { data: null, error: erroVenda };
  }

  if (fiado) {
    await criarContaReceberParcelada(
      {
        usuario_id: dados.usuarioId,
        cliente_id: dados.clienteId,
        descricao: `Fiado: ${nomeItem}`,
        valor: valorTotal,
        vencimento: fiado.primeiroVencimento,
        origem: "fiado",
      },
      Math.max(1, fiado.parcelas)
    );
  }

  if (!dados.produto) {
    return { data: venda, error: null, novoEstoque: null, estoqueInsuficiente: false };
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
  // Ordem pensada para tentativa repetida não duplicar nada: primeiro os
  // lançamentos (idempotente — o que já foi apagado não é achado de novo),
  // depois a linha da venda e, SÓ por último, a devolução do estoque.
  const ids = [
    ...(Array.isArray(venda.pagamentos) ? venda.pagamentos.map((p) => p.transacao_id) : []),
    venda.transacao_id,
  ].filter((id, i, arr): id is string => !!id && arr.indexOf(id) === i);
  for (const id of ids) {
    const { data: t } = await supabase.from("transacoes").select("*").eq("id", id).maybeSingle();
    if (t) {
      const { error: e } = await deletarTransacao(t as Transacao);
      if (e) return { error: e };
    }
  }

  const { error } = await supabase.from("vendas").delete().eq("id", venda.id);
  if (error) return { error };

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
  const quantidade24h = vendas.filter((v) => new Date(v.criado_em).getTime() >= limite24h).length;
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
    pontos.push({ rotulo: NOMES_MES[d.getMonth()], ticketMedio: doMes.length ? total / doMes.length : 0, vendas: doMes.length });
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
