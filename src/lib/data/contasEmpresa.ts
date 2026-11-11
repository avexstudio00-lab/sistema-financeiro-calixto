import { supabase } from "@/lib/supabase/client";
import { campoEmpresa, filtrarPorEmpresa } from "@/lib/empresa/empresaAtiva";
import { adicionarMeses } from "./investimentos";
import { criarTransacao, deletarTransacao } from "./transacoes";
import type { ContaPagar, ContaReceber, Transacao } from "./tipos";

// ---------------------------------------------------------------------------
// Contas a pagar (fornecedores, DAS e outras contas do negócio)
// ---------------------------------------------------------------------------

export async function listarContasPagar(usuarioId: string): Promise<ContaPagar[]> {
  const { data } = await filtrarPorEmpresa(
    supabase
      .from("contas_pagar")
      .select("*, fornecedores(*)")
      .eq("usuario_id", usuarioId)
      .order("vencimento", { ascending: true })
  );
  return (data as ContaPagar[]) ?? [];
}

export interface NovaContaPagar {
  usuario_id: string;
  fornecedor_id: string | null;
  categoria: ContaPagar["categoria"];
  descricao: string;
  valor: number;
  vencimento: string;
}

export async function criarContaPagar(conta: NovaContaPagar) {
  return supabase.from("contas_pagar").insert({ ...campoEmpresa(), ...conta }).select().single();
}

/** Valores das parcelas: divisão igual, com a última absorvendo os centavos. */
export function dividirEmParcelas(valorTotal: number, numeroParcelas: number): number[] {
  const base = Math.floor((valorTotal / numeroParcelas) * 100) / 100;
  const valores = new Array(numeroParcelas).fill(base) as number[];
  valores[numeroParcelas - 1] = Number((valorTotal - base * (numeroParcelas - 1)).toFixed(2));
  return valores;
}

/** Cria uma conta a pagar parcelada (item 5.2): N títulos independentes, um
 * por mês a partir do 1º vencimento, ligados pelo mesmo `grupo_parcela_id`.
 * Cada parcela pode depois ser editada sozinha (item 5.1). */
export async function criarContaPagarParcelada(conta: NovaContaPagar, numeroParcelas: number) {
  const grupo = crypto.randomUUID();
  const valores = dividirEmParcelas(conta.valor, numeroParcelas);
  const linhas = valores.map((valor, i) => ({
    ...campoEmpresa(),
    ...conta,
    valor,
    vencimento: adicionarMeses(conta.vencimento, i),
    descricao: `${conta.descricao} (${i + 1}/${numeroParcelas})`,
    grupo_parcela_id: grupo,
    parcela_numero: i + 1,
    parcela_total: numeroParcelas,
  }));
  return supabase.from("contas_pagar").insert(linhas).select();
}

async function idCategoriaGlobal(nome: string, tipo: "receita" | "despesa"): Promise<string | null> {
  const { data } = await supabase.from("categorias").select("id").is("usuario_id", null).eq("nome", nome).eq("tipo", tipo).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Marca uma conta a pagar (fornecedor, DAS, outra) como paga — ou desfaz.
 * 09/nov/2026: antes só trocava o status, então o dinheiro não saía de
 * carteira nenhuma e o pagamento NUNCA aparecia no fluxo de caixa/lucro
 * (que só leem lançamentos). Agora, ao pagar, gera o lançamento de saída
 * da empresa na carteira escolhida (`contaBancariaId`; `null` = sem
 * carteira específica). `lancar = false` = "paguei por fora / já lancei",
 * só muda o status. Desmarcar apaga o lançamento ligado (estorna o saldo).
 */
export async function marcarContaPagarPaga(
  conta: ContaPagar,
  pago: boolean,
  opcoes: { contaBancariaId?: string | null; lancar?: boolean; data?: string } = {}
) {
  const data = opcoes.data ?? new Date().toISOString().slice(0, 10);
  let transacaoId: string | null = conta.transacao_id ?? null;
  if (pago && !transacaoId && opcoes.lancar !== false) {
    const { data: t } = await criarTransacao({
      usuario_id: conta.usuario_id,
      conta_id: opcoes.contaBancariaId ?? null,
      categoria_id: await idCategoriaGlobal(conta.categoria === "das" ? "Impostos" : "Outras despesas", "despesa"),
      tipo: "despesa",
      valor: Number(conta.valor),
      descricao: `Pago: ${conta.descricao}`.slice(0, 120),
      data,
      forma_pagamento: "pix",
      tipo_negocio: "negocio",
      empresa_id: conta.empresa_id ?? null,
    });
    transacaoId = (t as { id: string } | null)?.id ?? null;
  }
  if (!pago && transacaoId) {
    const { data: t } = await supabase.from("transacoes").select("*").eq("id", transacaoId).maybeSingle();
    if (t) await deletarTransacao(t as Transacao);
    transacaoId = null;
  }
  return supabase
    .from("contas_pagar")
    .update({ status: pago ? "pago" : "pendente", data_pagamento: pago ? data : null, transacao_id: transacaoId })
    .eq("id", conta.id);
}

/** Edição isolada de um título/parcela (item 5.1): valor, vencimento e
 * status — sem mexer nas parcelas vizinhas. */
export async function editarContaPagar(
  id: string,
  dados: { valor: number; vencimento: string; status: ContaPagar["status"]; descricao?: string }
) {
  return supabase
    .from("contas_pagar")
    .update({
      valor: Number(dados.valor.toFixed(2)),
      vencimento: dados.vencimento,
      status: dados.status,
      ...(dados.descricao !== undefined ? { descricao: dados.descricao } : {}),
      data_pagamento: dados.status === "pago" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);
}

export async function deletarContaPagar(id: string) {
  // Item 6.3: se essa conta deu entrada de mercadoria no estoque, apagar a
  // conta tira as unidades de volta (sem deixar estoque negativo).
  const { data } = await supabase
    .from("contas_pagar")
    .select("itens_estoque, estoque_lancado, grupo_parcela_id, transacao_id")
    .eq("id", id)
    .maybeSingle();
  const linha = data as {
    itens_estoque: ItemCompraEstoque[] | null;
    estoque_lancado: boolean;
    grupo_parcela_id: string | null;
    transacao_id: string | null;
  } | null;
  // 09/nov/2026: conta já paga tem lançamento de saída ligado (o dinheiro
  // saiu de uma carteira). Apagar a conta desfaz esse lançamento, igual
  // ao Contas a receber — senão o saldo ficava descontado sem origem.
  if (linha?.transacao_id) {
    const { data: t } = await supabase.from("transacoes").select("*").eq("id", linha.transacao_id).maybeSingle();
    if (t) await deletarTransacao(t as Transacao);
  }
  // Compra parcelada: os itens ficam numa parcela só. Se ainda existem
  // outras parcelas do grupo, os itens "mudam" para uma delas (o estoque só
  // volta quando a ÚLTIMA parcela da compra for apagada).
  if (linha?.estoque_lancado && Array.isArray(linha.itens_estoque) && linha.grupo_parcela_id) {
    const { data: irmas } = await supabase
      .from("contas_pagar")
      .select("id")
      .eq("grupo_parcela_id", linha.grupo_parcela_id)
      .neq("id", id)
      .order("parcela_numero", { ascending: true })
      .limit(1);
    const destino = ((irmas as { id: string }[]) ?? [])[0];
    if (destino) {
      const { error: erroMover } = await supabase
        .from("contas_pagar")
        .update({ itens_estoque: linha.itens_estoque, estoque_lancado: true })
        .eq("id", destino.id);
      if (erroMover) return { data: null, error: erroMover };
      return supabase.from("contas_pagar").delete().eq("id", id);
    }
  }
  if (linha?.estoque_lancado && Array.isArray(linha.itens_estoque)) {
    for (const item of linha.itens_estoque) {
      // eslint-disable-next-line no-await-in-loop
      const { data: p } = await supabase.from("produtos").select("quantidade_estoque").eq("id", item.produto_id).maybeSingle();
      if (p) {
        // eslint-disable-next-line no-await-in-loop
        await supabase
          .from("produtos")
          .update({ quantidade_estoque: Math.max(0, Number((p as { quantidade_estoque: number }).quantidade_estoque) - Number(item.quantidade)) })
          .eq("id", item.produto_id);
      }
    }
  }
  return supabase.from("contas_pagar").delete().eq("id", id);
}

/** Um produto comprado numa conta a pagar de fornecedor (item 6.3). */
export interface ItemCompraEstoque {
  produto_id: string;
  nome: string;
  quantidade: number;
  custo_unitario: number;
}

/**
 * Item 6.3 / 12.3 (09/out/2026): compra de mercadoria lançada como conta a
 * pagar já dá entrada no estoque — sem lançar duas vezes. Soma as unidades e
 * atualiza o custo do produto pelo custo médio ponderado (estoque antigo +
 * compra nova). Os itens ficam gravados na conta (para o dossiê do
 * fornecedor e para desfazer se a conta for apagada).
 */
export async function darEntradaEstoqueDaCompra(contaPagarId: string, itens: ItemCompraEstoque[]) {
  const validos = itens.filter((i) => i.produto_id && i.quantidade > 0);
  if (validos.length === 0) return { error: null };
  for (const item of validos) {
    // eslint-disable-next-line no-await-in-loop -- sequencial (leitura e escrita do mesmo estoque)
    const { data: p } = await supabase.from("produtos").select("quantidade_estoque, custo").eq("id", item.produto_id).maybeSingle();
    if (!p) continue;
    const atual = Number((p as { quantidade_estoque: number }).quantidade_estoque);
    const custoAtual = Number((p as { custo: number }).custo);
    const novaQtd = atual + item.quantidade;
    const custoMedio = novaQtd > 0 ? (Math.max(atual, 0) * custoAtual + item.quantidade * item.custo_unitario) / (Math.max(atual, 0) + item.quantidade) : item.custo_unitario;
    // eslint-disable-next-line no-await-in-loop
    await supabase
      .from("produtos")
      .update({ quantidade_estoque: novaQtd, custo: Number(custoMedio.toFixed(2)) })
      .eq("id", item.produto_id);
  }
  return supabase.from("contas_pagar").update({ itens_estoque: validos, estoque_lancado: true }).eq("id", contaPagarId);
}

// ---------------------------------------------------------------------------
// Contas a receber (clientes)
// ---------------------------------------------------------------------------

export async function listarContasReceber(usuarioId: string): Promise<ContaReceber[]> {
  const { data } = await filtrarPorEmpresa(
    supabase
      .from("contas_receber")
      .select("*, clientes(*)")
      .eq("usuario_id", usuarioId)
      .order("vencimento", { ascending: true })
  );
  return (data as ContaReceber[]) ?? [];
}

export interface NovaContaReceber {
  usuario_id: string;
  cliente_id: string | null;
  descricao: string;
  valor: number;
  vencimento: string;
  origem?: ContaReceber["origem"];
  orcamento_id?: string | null;
}

export async function criarContaReceber(conta: NovaContaReceber) {
  return supabase.from("contas_receber").insert({ ...campoEmpresa(), ...conta }).select().single();
}

/** Conta a receber parcelada — usada pra venda fiada (a prazo) e pra fechar
 * um orçamento em parcelas (itens 5.2 e 5.8). */
export async function criarContaReceberParcelada(conta: NovaContaReceber, numeroParcelas: number, valores?: number[]) {
  if (numeroParcelas <= 1) {
    const { data, error } = await criarContaReceber(conta);
    return { data: data ? [data] : null, error };
  }
  const grupo = crypto.randomUUID();
  const lista = valores && valores.length === numeroParcelas ? valores : dividirEmParcelas(conta.valor, numeroParcelas);
  const linhas = lista.map((valor, i) => ({
    ...campoEmpresa(),
    ...conta,
    valor,
    vencimento: adicionarMeses(conta.vencimento, i),
    descricao: `${conta.descricao} (${i + 1}/${numeroParcelas})`,
    grupo_parcela_id: grupo,
    parcela_numero: i + 1,
    parcela_total: numeroParcelas,
  }));
  return supabase.from("contas_receber").insert(linhas).select();
}

async function idCategoriaVendas(): Promise<string | null> {
  const { data } = await supabase
    .from("categorias")
    .select("id")
    .is("usuario_id", null)
    .eq("nome", "Vendas")
    .eq("tipo", "receita")
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** Marca como recebida (ou desfaz). Títulos que nasceram de venda fiada ou
 * de orçamento fechado ainda não entraram no caixa — então, ao receber,
 * geramos a entrada correspondente no fluxo de caixa do negócio (e, ao
 * desfazer, apagamos essa entrada). Títulos manuais continuam como sempre
 * (só mudam de status). */
export async function marcarContaReceberRecebida(
  conta: ContaReceber,
  recebido: boolean,
  contaBancariaId: string | null = null,
  lancar = true,
  dataRecebimento?: string
) {
  const hoje = dataRecebimento ?? new Date().toISOString().slice(0, 10);
  // 09/nov/2026: conta a receber criada à mão também entra no caixa ao ser
  // recebida (antes só fiado/orçamento). `lancar = false` = "já lancei".
  const geraEntrada = lancar;
  let transacaoId: string | null = conta.transacao_id ?? null;

  if (geraEntrada && recebido && !transacaoId) {
    const { data } = await criarTransacao({
      usuario_id: conta.usuario_id,
      conta_id: contaBancariaId,
      categoria_id: await idCategoriaVendas(),
      tipo: "receita",
      valor: Number(conta.valor),
      descricao: `Recebido: ${conta.descricao}`,
      data: hoje,
      forma_pagamento: "pix",
      tipo_negocio: "negocio",
      empresa_id: conta.empresa_id ?? null,
    });
    transacaoId = (data as { id: string } | null)?.id ?? null;
  }
  if (!recebido && transacaoId) {
    const { data: t } = await supabase.from("transacoes").select("*").eq("id", transacaoId).maybeSingle();
    if (t) await deletarTransacao(t as Transacao);
    transacaoId = null;
  }

  return supabase
    .from("contas_receber")
    .update({
      status: recebido ? "recebido" : "pendente",
      data_recebimento: recebido ? hoje : null,
      transacao_id: transacaoId,
    })
    .eq("id", conta.id);
}

/** Edição isolada de um título/parcela a receber (item 5.1). */
export async function editarContaReceber(
  id: string,
  dados: { valor: number; vencimento: string; descricao?: string }
) {
  return supabase
    .from("contas_receber")
    .update({
      valor: Number(dados.valor.toFixed(2)),
      vencimento: dados.vencimento,
      ...(dados.descricao !== undefined ? { descricao: dados.descricao } : {}),
    })
    .eq("id", id);
}

export async function deletarContaReceber(conta: ContaReceber | string) {
  if (typeof conta !== "string" && conta.transacao_id) {
    const { data: t } = await supabase.from("transacoes").select("*").eq("id", conta.transacao_id).maybeSingle();
    if (t) await deletarTransacao(t as Transacao);
  }
  return supabase
    .from("contas_receber")
    .delete()
    .eq("id", typeof conta === "string" ? conta : conta.id);
}

// ---------------------------------------------------------------------------
// Helpers compartilhados
// ---------------------------------------------------------------------------

/** true quando o vencimento já passou e a conta ainda está pendente —
 * mesma lógica de `parcelaEstaAtrasada` em investimentos.ts. */
export function estaAtrasada(
  item: { vencimento: string; status: "pendente" | "pago" | "recebido" },
  referencia: Date = new Date()
): boolean {
  if (item.status !== "pendente") return false;
  const vencimento = new Date(item.vencimento + "T00:00:00");
  const hoje = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  return vencimento < hoje;
}

/** true quando ainda está pendente e vence de hoje até daqui a `dias` dias
 * (item 5.2: alerta de vencimento iminente — padrão 3 dias). */
export function venceEmBreve(
  item: { vencimento: string; status: "pendente" | "pago" | "recebido" },
  dias = 3,
  referencia: Date = new Date()
): boolean {
  if (item.status !== "pendente") return false;
  const vencimento = new Date(item.vencimento + "T00:00:00");
  const hoje = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + dias);
  return vencimento >= hoje && vencimento <= limite;
}

/**
 * "Receber várias de uma vez" do cliente (10/nov/2026): o cliente deve mais
 * de um título (fiado em parcelas, orçamentos...) e paga tudo num Pix só.
 * Cada título marcado vira recebido (com entrada na carteira). Valor menor
 * que o título = pagou em parte: o título fica com o saldo que falta e a
 * parte paga vira um título já recebido (mesmo cliente, mesma origem).
 */
export async function receberTitulosDoCliente(params: {
  titulos: ContaReceber[];
  alocacoes: { tituloId: string; valor: number }[];
  contaBancariaId: string;
  data: string;
}): Promise<{ ok: number; falhas: string[] }> {
  let ok = 0;
  const falhas: string[] = [];
  for (const a of params.alocacoes) {
    const t = params.titulos.find((x) => x.id === a.tituloId);
    if (!t || !(a.valor > 0)) continue;
    const valorTitulo = Number(t.valor);
    if (a.valor >= valorTitulo - 0.004) {
      // eslint-disable-next-line no-await-in-loop -- sequencial: saldo da carteira
      const { error } = await marcarContaReceberRecebida(t, true, params.contaBancariaId, true, params.data);
      if (error) falhas.push(t.descricao);
      else ok += 1;
      continue;
    }
    // Parte: cria o título da parte paga e já recebe; o original fica com o resto.
    const parte = Number(a.valor.toFixed(2));
    // eslint-disable-next-line no-await-in-loop
    const { data: novo, error: erroNovo } = await supabase
      .from("contas_receber")
      .insert({
        usuario_id: t.usuario_id,
        cliente_id: t.cliente_id,
        descricao: `${t.descricao} (parte paga)`.slice(0, 200),
        valor: parte,
        vencimento: t.vencimento,
        origem: t.origem ?? "manual",
        venda_grupo_id: t.venda_grupo_id ?? null,
        orcamento_id: t.orcamento_id ?? null,
        ...(t.empresa_id ? { empresa_id: t.empresa_id } : {}),
      })
      .select()
      .single();
    if (erroNovo || !novo) {
      falhas.push(t.descricao);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const { error: erroRec } = await marcarContaReceberRecebida(novo as ContaReceber, true, params.contaBancariaId, true, params.data);
    if (erroRec) {
      // eslint-disable-next-line no-await-in-loop
      await supabase.from("contas_receber").delete().eq("id", (novo as ContaReceber).id);
      falhas.push(t.descricao);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await supabase
      .from("contas_receber")
      .update({ valor: Number((valorTitulo - parte).toFixed(2)) })
      .eq("id", t.id);
    ok += 1;
  }
  return { ok, falhas };
}
