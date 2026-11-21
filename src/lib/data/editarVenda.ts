import { supabase } from "@/lib/supabase/client";
import { atualizarTransacao, deletarTransacao, type NovaTransacao } from "./transacoes";
import { ajustarEstoque, faltaColuna } from "./produtos";
import { COLS_VENDA } from "./colunas";
import { comCustoVendas } from "./custos";
import { arredondar2, somaParcelas, type ParcelaFiado } from "@/lib/util/fiado";
import { descricaoDaVenda, type PagamentoVenda } from "./vendas";
import type { ContaReceber, Transacao, Venda } from "./tipos";

/**
 * Editar uma venda já registrada (19/nov/2026, pedido do usuário: "às vezes
 * muda alguma coisa depois da venda e ele não precisa apagar e refazer").
 *
 * Dá pra mudar: quantidade e preço de cada item, data, cliente, vendedor,
 * forma de pagamento/carteira (à vista), os valores de cada forma (pagamento
 * dividido) e, no fiado, acréscimo, entrada e as parcelas AINDA NÃO
 * recebidas (quantidade de parcelas, valores e vencimentos).
 *
 * Tudo que a venda criou acompanha a mudança, do mesmo jeito que o registro
 * e o "apagar" já fazem:
 *  - lançamento no caixa: atualizado via `atualizarTransacao`, que desfaz o
 *    valor antigo na carteira e aplica o novo (inclusive troca de carteira);
 *  - taxa da maquininha: recalculada na mesma proporção do novo total (ou
 *    apagada, se a forma deixou de ser cartão);
 *  - parcelas do fiado: as recebidas ficam intactas; as pendentes são
 *    trocadas pelas novas, e a soma tem que fechar com o novo total;
 *  - estoque: devolve ou baixa só a diferença de quantidade.
 *
 * O que NÃO dá (nesses casos, apagar e registrar de novo): incluir/tirar
 * itens do carrinho e trocar o tipo da venda (à vista ↔ fiado ↔ dividida).
 */

export type FormaVenda = NonNullable<Transacao["forma_pagamento"]>;

export type TipoPagamentoVenda = "avista" | "dividida" | "fiado" | "sem_caixa";

export interface DetalhesVenda {
  /** Linha que guarda o caixa (lançamento/formas/taxa/acréscimo) primeiro. */
  linhas: Venda[];
  tipo: TipoPagamentoVenda;
  /** À vista: o lançamento do total. Fiado: o lançamento da entrada. */
  transacaoCaixa: Transacao | null;
  /** Parcelas do fiado, recebidas e pendentes, em ordem. */
  titulos: ContaReceber[];
}

export interface EdicaoVenda {
  data: string;
  clienteId: string | null;
  vendedorNome: string | null;
  itens: { id: string; quantidade: number; valorUnitario: number }[];
  /** À vista. */
  formaPagamento?: FormaVenda | null;
  contaId?: string | null;
  /** Dividida: mesma quantidade e ordem das formas gravadas. */
  pagamentos?: PagamentoVenda[];
  /** Fiado. */
  acrescimo?: number;
  entradaValor?: number;
  parcelasPendentes?: ParcelaFiado[];
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const ehCartao = (f: string | null | undefined) => f === "debito" || f === "credito";

async function buscarTransacao(id: string | null | undefined): Promise<Transacao | null> {
  if (!id) return null;
  const { data } = await supabase.from("transacoes").select("*").eq("id", id).maybeSingle();
  return (data as Transacao | null) ?? null;
}

/** Campos editáveis de um lançamento, partindo do que está gravado. */
function baseDoLancamento(t: Transacao, mudancas: Partial<NovaTransacao>): NovaTransacao {
  return {
    usuario_id: t.usuario_id,
    conta_id: t.conta_id,
    categoria_id: t.categoria_id,
    tipo: t.tipo,
    valor: Number(t.valor),
    descricao: t.descricao ?? "",
    data: t.data,
    forma_pagamento: t.forma_pagamento,
    tipo_negocio: t.tipo_negocio,
    empresa_id: t.empresa_id ?? null,
    ...mudancas,
  };
}

function ehLinhaDoCaixa(l: Venda) {
  return !!l.transacao_id || (Array.isArray(l.pagamentos) && l.pagamentos.length > 0) || !!l.taxa_transacao_id || Number(l.acrescimo ?? 0) > 0;
}

/** Uma linha de venda pelo id (venda antiga, fora da lista da tela). */
export async function buscarVendaPorId(id: string): Promise<Venda | null> {
  let { data, error } = await supabase.from("vendas").select(COLS_VENDA).eq("id", id).maybeSingle();
  if (faltaColuna(error)) ({ data, error } = await supabase.from("vendas").select("*").eq("id", id).maybeSingle());
  return error || !data ? null : (data as unknown as Venda);
}

/** Busca a venda inteira (todas as linhas), o caixa e as parcelas, frescos do banco. */
export async function carregarDetalhesVenda(venda: Venda): Promise<{ data: DetalhesVenda | null; error: Error | null }> {
  const consulta = (cols: string) =>
    venda.grupo_venda_id
      ? supabase.from("vendas").select(cols).eq("grupo_venda_id", venda.grupo_venda_id)
      : supabase.from("vendas").select(cols).eq("id", venda.id);
  let { data, error } = await consulta(COLS_VENDA);
  if (faltaColuna(error)) ({ data, error } = await consulta("*"));
  if (error || !data || (data as unknown[]).length === 0) {
    return { data: null, error: new Error("Não encontrei essa venda. Atualize a página e tente de novo.") };
  }
  const brutas = (await comCustoVendas(data as unknown as Venda[])) as Venda[];
  const principal = brutas.find(ehLinhaDoCaixa) ?? brutas[0];
  const linhas = [principal, ...brutas.filter((l) => l.id !== principal.id)];

  let titulos: ContaReceber[] = [];
  if (venda.grupo_venda_id) {
    const { data: t } = await supabase
      .from("contas_receber")
      .select("*")
      .eq("venda_grupo_id", venda.grupo_venda_id)
      .order("parcela_numero", { ascending: true, nullsFirst: true })
      .order("vencimento", { ascending: true });
    titulos = (t as ContaReceber[] | null) ?? [];
  }

  const transacaoCaixa = await buscarTransacao(principal.transacao_id);
  const pagamentos = Array.isArray(principal.pagamentos) ? principal.pagamentos : [];
  // Linha de fiado grava forma_pagamento = null (ver registrarVenda): mesmo
  // que as parcelas tenham sido apagadas em Contas, a entrada continua sendo
  // entrada — tratar como "à vista" viraria o total da venda no caixa.
  const ehFiado = titulos.length > 0 || (!principal.forma_pagamento && !!transacaoCaixa && pagamentos.length < 2);
  const tipo: TipoPagamentoVenda = ehFiado ? "fiado" : pagamentos.length >= 2 ? "dividida" : transacaoCaixa ? "avista" : "sem_caixa";
  return { data: { linhas, tipo, transacaoCaixa, titulos }, error: null };
}

/** Quanto do fiado já está garantido fora das parcelas pendentes. */
export function jaRecebidoDoFiado(detalhes: DetalhesVenda): number {
  return arredondar2(detalhes.titulos.filter((t) => t.status === "recebido").reduce((a, t) => a + Number(t.valor), 0));
}

/** Total da venda com os itens editados (+ acréscimo do fiado na 1ª linha). */
export function totalDaEdicao(detalhes: DetalhesVenda, edicao: Pick<EdicaoVenda, "itens" | "acrescimo">): number {
  const soma = detalhes.linhas.reduce((acc, l) => {
    const item = edicao.itens.find((i) => i.id === l.id);
    const q = item ? item.quantidade : Number(l.quantidade);
    const vu = arredondar2(item ? item.valorUnitario : Number(l.valor_unitario));
    return acc + arredondar2(q * vu);
  }, 0);
  const acrescimo = detalhes.tipo === "fiado" ? arredondar2(edicao.acrescimo ?? Number(detalhes.linhas[0].acrescimo ?? 0)) : 0;
  return arredondar2(soma + acrescimo);
}

/** Confere tudo antes de gravar. Devolve a mensagem de erro ou null. */
export function validarEdicaoVenda(detalhes: DetalhesVenda, edicao: EdicaoVenda): string | null {
  if (!DATA_ISO.test(edicao.data)) return "Informe uma data válida para a venda.";
  for (const l of detalhes.linhas) {
    const item = edicao.itens.find((i) => i.id === l.id);
    if (!item) return "Faltou um item da venda. Feche e abra a edição de novo.";
    if (!Number.isInteger(item.quantidade) || item.quantidade < 1) return `${l.produto_nome}: a quantidade precisa ser um número inteiro, 1 ou mais.`;
    if (!Number.isFinite(item.valorUnitario) || item.valorUnitario < 0) return `${l.produto_nome}: valor unitário inválido.`;
  }
  if (detalhes.tipo === "fiado" && edicao.acrescimo !== undefined && (!Number.isFinite(edicao.acrescimo) || edicao.acrescimo < 0)) {
    return "Acréscimo inválido.";
  }
  const total = totalDaEdicao(detalhes, edicao);
  if (!Number.isFinite(total)) return "Confira os valores da venda.";

  if (detalhes.tipo === "dividida") {
    const gravados = detalhes.linhas[0].pagamentos ?? [];
    const pags = edicao.pagamentos ?? [];
    if (pags.length !== gravados.length) return "As formas de pagamento não batem com as da venda. Feche e abra de novo.";
    if (pags.some((p) => !Number.isFinite(p.valor) || p.valor <= 0)) return "Cada forma de pagamento precisa ter um valor maior que zero.";
    const falta = arredondar2(total - pags.reduce((a, p) => a + p.valor, 0));
    if (Math.abs(falta) >= 0.01) {
      return falta > 0
        ? `As formas de pagamento somam menos que o total — faltam ${falta.toFixed(2).replace(".", ",")}.`
        : `As formas de pagamento somam mais que o total — sobram ${Math.abs(falta).toFixed(2).replace(".", ",")}.`;
    }
  }

  if (detalhes.tipo === "fiado") {
    if (!edicao.clienteId) return "Venda fiada precisa de um cliente.";
    const entradaAtual = detalhes.transacaoCaixa ? Number(detalhes.transacaoCaixa.valor) : 0;
    const entrada = arredondar2(edicao.entradaValor ?? entradaAtual);
    if (!Number.isFinite(entrada) || entrada < 0) return "A entrada não pode ser negativa.";
    if (!detalhes.transacaoCaixa && entrada > 0) return "Esta venda não teve entrada; não dá pra incluir uma agora.";
    const recebido = jaRecebidoDoFiado(detalhes);
    const restante = arredondar2(total - recebido - entrada);
    const pendentes = edicao.parcelasPendentes ?? [];
    if (restante <= -0.01) {
      return `O novo total (${total.toFixed(2).replace(".", ",")}) fica menor do que a entrada mais o que já foi recebido. Ajuste os valores.`;
    }
    if (restante < 0.01) {
      if (pendentes.length > 0) return "Com esses valores não sobra nada a receber — remova as parcelas pendentes.";
      return null;
    }
    if (pendentes.length === 0) return "Ainda falta receber parte da venda — informe pelo menos uma parcela.";
    for (const [i, p] of pendentes.entries()) {
      if (!DATA_ISO.test(p.vencimento)) return `Parcela ${i + 1}: data de vencimento inválida.`;
      if (!(p.valor > 0)) return `Parcela ${i + 1}: o valor precisa ser maior que zero.`;
      if (p.vencimento < edicao.data) return `Parcela ${i + 1}: o vencimento não pode ser antes da data da venda.`;
    }
    const falta = arredondar2(restante - somaParcelas(pendentes));
    if (Math.abs(falta) >= 0.01) {
      return falta > 0
        ? `As parcelas somam menos que o que falta receber — faltam ${falta.toFixed(2).replace(".", ",")}.`
        : `As parcelas somam mais que o que falta receber — sobram ${Math.abs(falta).toFixed(2).replace(".", ",")}.`;
    }
  }
  return null;
}

function mesmasParcelas(a: ParcelaFiado[], b: ParcelaFiado[]) {
  return a.length === b.length && a.every((p, i) => p.vencimento === b[i].vencimento && Math.abs(p.valor - b[i].valor) < 0.005);
}


const PARTE_PAGA = /\(parte paga\)/i;
const NUMERO_PARCELA = /\s*\(\d+\/\d+\)/g;

/** Troca só o ÚLTIMO "(i/n)" da descrição (o do fim é o da parcela; um
 * "(1/2)" no nome do produto fica), mantendo o resto do que a pessoa
 * escreveu; sem número ainda, acrescenta no fim. */
function comNumeroParcela(descricao: string, i: number, n: number): string {
  const novo = n > 1 ? ` (${i}/${n})` : "";
  const achados = [...descricao.matchAll(NUMERO_PARCELA)];
  const ultimo = achados[achados.length - 1];
  const texto =
    ultimo && ultimo.index !== undefined
      ? descricao.slice(0, ultimo.index) + novo + descricao.slice(ultimo.index + ultimo[0].length)
      : `${descricao}${novo}`;
  return texto.trim().slice(0, 200);
}

/**
 * Grava a edição. Pra uma nova tentativa (depois de um erro no meio) nunca
 * contar nada duas vezes, tudo é comparado com o que está NO BANCO agora,
 * não com o que a tela carregou: a venda é relida aqui dentro. Ordem: linhas
 * da venda → estoque (junto, pra quantidade gravada e estoque andarem
 * juntos) → caixa → parcelas.
 */
export async function editarVenda(
  detalhesTela: DetalhesVenda,
  entrada: EdicaoVenda
): Promise<{ error: Error | null; estoqueInsuficiente?: string[] }> {
  const { data: detalhes, error: erroCarga } = await carregarDetalhesVenda(detalhesTela.linhas[0]);
  if (erroCarga || !detalhes) return { error: erroCarga ?? new Error("Não encontrei essa venda.") };
  if (detalhes.tipo !== detalhesTela.tipo) {
    return { error: new Error("Essa venda mudou enquanto você editava. Feche e abra de novo.") };
  }
  // Valor unitário arredondado uma vez só: o gravado bate com o total.
  const edicao: EdicaoVenda = {
    ...entrada,
    itens: entrada.itens.map((i) => ({ ...i, valorUnitario: arredondar2(i.valorUnitario) })),
  };
  const problema = validarEdicaoVenda(detalhes, edicao);
  if (problema) return { error: new Error(problema) };

  const principal = detalhes.linhas[0];
  const total = totalDaEdicao(detalhes, edicao);
  const acrescimo = detalhes.tipo === "fiado" ? arredondar2(edicao.acrescimo ?? Number(principal.acrescimo ?? 0)) : 0;
  const temColunaVendedor = "vendedor_nome" in principal;
  const temColunaAcrescimo = "acrescimo" in principal;
  const vendedor = edicao.vendedorNome?.trim() ? edicao.vendedorNome.trim().slice(0, 80) : null;
  const forma = detalhes.tipo === "avista" ? edicao.formaPagamento ?? principal.forma_pagamento : null;

  const pagamentosNovos: PagamentoVenda[] | null =
    detalhes.tipo === "dividida"
      ? (edicao.pagamentos ?? []).map((p, i) => ({
          forma: p.forma,
          valor: arredondar2(p.valor),
          contaId: p.contaId,
          transacao_id: principal.pagamentos?.[i]?.transacao_id ?? null,
        }))
      : null;

  // 1) Linhas da venda + estoque da diferença.
  const estoqueInsuficiente: string[] = [];
  for (const l of detalhes.linhas) {
    const item = edicao.itens.find((i) => i.id === l.id)!;
    const ehPrincipal = l.id === principal.id;
    const payload: Record<string, unknown> = {
      quantidade: item.quantidade,
      valor_unitario: item.valorUnitario,
      valor_total: arredondar2(item.quantidade * item.valorUnitario + (ehPrincipal ? acrescimo : 0)),
      data: edicao.data,
      cliente_id: edicao.clienteId,
    };
    if (temColunaVendedor) payload.vendedor_nome = vendedor;
    if (detalhes.tipo === "avista") payload.forma_pagamento = forma;
    if (ehPrincipal && detalhes.tipo === "fiado" && temColunaAcrescimo) payload.acrescimo = acrescimo > 0 ? acrescimo : null;
    if (ehPrincipal && pagamentosNovos) payload.pagamentos = pagamentosNovos;
    const { error } = await supabase.from("vendas").update(payload).eq("id", l.id);
    if (error) return { error: new Error(`Não consegui salvar a venda: ${error.message}`) };
    // Logo depois que a linha gravou, a diferença dela vai pro estoque (se
    // a próxima linha falhar, esta já fica certa e a releitura vê diferença 0).
    const delta = Number(l.quantidade) - item.quantidade;
    if (l.produto_id && delta !== 0) {
      const { data: p } = await supabase.from("produtos").select("quantidade_estoque, nome").eq("id", l.produto_id).maybeSingle();
      if (p) {
        const atual = Number((p as { quantidade_estoque: number }).quantidade_estoque);
        await ajustarEstoque(l.produto_id, atual, delta);
        if (delta < 0 && -delta > atual) estoqueInsuficiente.push((p as { nome: string }).nome);
      }
    }
  }

  // 2) Caixa (sempre comparando com o lançamento como está no banco).
  if (detalhes.tipo === "avista" && detalhes.transacaoCaixa) {
    const t = detalhes.transacaoCaixa;
    // Base da taxa = valor do lançamento ANTES de atualizar (é o total que a
    // taxa cobriu; numa nova tentativa as linhas já podem estar com o novo).
    const baseTaxa = Number(t.valor);
    const contaNova = edicao.contaId !== undefined ? edicao.contaId : t.conta_id;
    const mudou =
      Math.abs(Number(t.valor) - total) >= 0.005 || t.data !== edicao.data || t.conta_id !== contaNova || t.forma_pagamento !== forma;
    if (mudou) {
      const { error } = await atualizarTransacao(t, baseDoLancamento(t, { valor: total, data: edicao.data, conta_id: contaNova, forma_pagamento: forma }));
      if (error) return { error: new Error("A venda foi salva, mas o lançamento no caixa não atualizou. Tente salvar de novo.") };
    }
    // Taxa da maquininha acompanha o novo total (ou some, se não é mais cartão).
    const taxaT = await buscarTransacao(principal.taxa_transacao_id);
    if (taxaT) {
      if (!ehCartao(forma)) {
        const { error } = await deletarTransacao(taxaT);
        if (!error) await supabase.from("vendas").update({ taxa_maquininha: null, taxa_transacao_id: null, parcelas_cartao: null }).eq("id", principal.id);
      } else {
        const novaTaxa = baseTaxa > 0 ? arredondar2((Number(taxaT.valor) * total) / baseTaxa) : Number(taxaT.valor);
        if (Math.abs(novaTaxa - Number(taxaT.valor)) >= 0.005 || taxaT.data !== edicao.data || taxaT.conta_id !== contaNova || taxaT.forma_pagamento !== forma) {
          const { error } = await atualizarTransacao(taxaT, baseDoLancamento(taxaT, { valor: novaTaxa, data: edicao.data, conta_id: contaNova, forma_pagamento: forma }));
          if (!error) await supabase.from("vendas").update({ taxa_maquininha: novaTaxa }).eq("id", principal.id);
        }
      }
    }
  }

  if (detalhes.tipo === "dividida" && pagamentosNovos) {
    const nomes = detalhes.linhas.map((l) => l.produto_nome);
    for (const pg of pagamentosNovos) {
      const t = await buscarTransacao(pg.transacao_id);
      if (!t) continue;
      const mudou = Math.abs(Number(t.valor) - pg.valor) >= 0.005 || t.data !== edicao.data || t.conta_id !== pg.contaId || t.forma_pagamento !== pg.forma;
      if (!mudou) continue;
      const { error } = await atualizarTransacao(
        t,
        baseDoLancamento(t, { valor: pg.valor, data: edicao.data, conta_id: pg.contaId, forma_pagamento: pg.forma, descricao: `${descricaoDaVenda(nomes)} (${pg.forma})` })
      );
      if (error) return { error: new Error("A venda foi salva, mas uma das formas de pagamento não atualizou no caixa. Tente salvar de novo.") };
    }
  }

  if (detalhes.tipo === "fiado") {
    // 2a) Entrada (undefined = não mexer).
    const t = detalhes.transacaoCaixa;
    if (t && edicao.entradaValor !== undefined) {
      const valorEntrada = arredondar2(edicao.entradaValor);
      if (valorEntrada < 0.005) {
        const { error } = await deletarTransacao(t);
        if (error) return { error: new Error("Não consegui remover a entrada do caixa. Tente de novo.") };
        await supabase.from("vendas").update({ transacao_id: null }).eq("id", principal.id);
      } else if (Math.abs(Number(t.valor) - valorEntrada) >= 0.005 || t.data !== edicao.data) {
        const { error } = await atualizarTransacao(t, baseDoLancamento(t, { valor: valorEntrada, data: edicao.data }));
        if (error) return { error: new Error("A venda foi salva, mas a entrada não atualizou no caixa. Tente salvar de novo.") };
      }
    }

    // 3) Parcelas: recebidas ficam; pendentes trocam pelas novas.
    const descricao = descricaoDaVenda(detalhes.linhas.map((l) => l.produto_nome));
    const grupo = principal.grupo_venda_id ?? null;
    const recebidas = detalhes.titulos.filter((x) => x.status === "recebido");
    const pendentesAntigas = detalhes.titulos.filter((x) => x.status !== "recebido");
    const novas = (edicao.parcelasPendentes ?? []).map((p) => ({ vencimento: p.vencimento, valor: arredondar2(p.valor) }));
    const iguais = mesmasParcelas(
      pendentesAntigas.map((x) => ({ vencimento: x.vencimento, valor: Number(x.valor) })),
      novas
    );

    let pendentesFinais: ContaReceber[] = pendentesAntigas;
    if (!iguais) {
      // Insere as novas PRIMEIRO; só apaga as antigas depois. Se algo der
      // errado, as antigas continuam lá (nunca some dinheiro a receber).
      let inseridas: ContaReceber[] = [];
      if (novas.length > 0) {
        const linhasNovas = novas.map((p) => ({
          ...(principal.empresa_id ? { empresa_id: principal.empresa_id } : {}),
          usuario_id: principal.usuario_id,
          cliente_id: edicao.clienteId,
          descricao: `Fiado: ${descricao}`.slice(0, 200),
          valor: p.valor,
          vencimento: p.vencimento,
          origem: "fiado",
          venda_grupo_id: grupo,
          // Mantém o "já cobrei" quando o vencimento não mudou.
          ultima_cobranca_em: pendentesAntigas.find((x) => x.vencimento === p.vencimento)?.ultima_cobranca_em ?? null,
        }));
        const { data: ins, error } = await supabase.from("contas_receber").insert(linhasNovas).select("*");
        if (error) return { error: new Error(`A venda foi salva, mas as parcelas novas não gravaram: ${error.message}. Tente salvar de novo.`) };
        inseridas = (ins as ContaReceber[] | null) ?? [];
      }
      const idsAntigos = pendentesAntigas.map((x) => x.id);
      if (idsAntigos.length > 0) {
        const { data: apagadas, error } = await supabase
          .from("contas_receber")
          .delete()
          .in("id", idsAntigos)
          .eq("status", "pendente")
          .select("id");
        if (error || (apagadas?.length ?? 0) !== idsAntigos.length) {
          // Alguma pendente foi recebida/apagada no meio: desfaz as novas.
          if (inseridas.length > 0) {
            const { error: erroDesfazer } = await supabase.from("contas_receber").delete().in("id", inseridas.map((x) => x.id));
            if (erroDesfazer) {
              return { error: new Error("As parcelas mudaram no meio e não consegui desfazer as novas — confira em Contas → A receber (pode ter parcela repetida).") };
            }
          }
          return { error: new Error("As parcelas dessa venda mudaram enquanto você editava (ex.: alguma foi recebida). Feche e abra de novo.") };
        }
      }
      pendentesFinais = inseridas;
    }

    // Numeração "(i/n)" pela ordem dos vencimentos. Título de "parte paga"
    // (recebimento parcial) não conta nem ganha número.
    const numeradas = [...recebidas.filter((x) => !PARTE_PAGA.test(x.descricao)), ...pendentesFinais].sort(
      (a, b) => a.vencimento.localeCompare(b.vencimento) || (a.parcela_numero ?? 99) - (b.parcela_numero ?? 99)
    );
    const n = numeradas.length;
    for (const [i, x] of numeradas.entries()) {
      const payload = {
        cliente_id: edicao.clienteId,
        descricao: comNumeroParcela(x.descricao, i + 1, n),
        parcela_numero: n > 1 ? i + 1 : null,
        parcela_total: n > 1 ? n : null,
        grupo_parcela_id: n > 1 ? grupo : null,
      };
      if (
        x.cliente_id === payload.cliente_id &&
        x.descricao === payload.descricao &&
        (x.parcela_numero ?? null) === payload.parcela_numero &&
        (x.parcela_total ?? null) === payload.parcela_total &&
        (x.grupo_parcela_id ?? null) === payload.grupo_parcela_id
      ) {
        continue;
      }
      await supabase.from("contas_receber").update(payload).eq("id", x.id);
    }
    for (const x of recebidas.filter((r) => PARTE_PAGA.test(r.descricao))) {
      if (x.cliente_id !== edicao.clienteId) await supabase.from("contas_receber").update({ cliente_id: edicao.clienteId }).eq("id", x.id);
    }
  }

  return { error: null, estoqueInsuficiente };
}
