import { supabase } from "@/lib/supabase/client";
import { normalizarTexto } from "@/lib/util/texto";
import type { LancamentoLido } from "@/lib/util/csvImportacao";
import type { Conta, Investimento, ParcelaInvestimento } from "./tipos";
import {
  marcarEmprestimoQuitadoPorParcelas,
  marcarParcelaPaga,
  registrarPagamentoJuros,
  registrarQuitacaoAntecipadaParcelado,
  registrarQuitacaoEmprestimo,
} from "./investimentos";
import { reavaliarQuitacaoRevenda, registrarRecebimentoRevenda } from "./revenda";
import { itensAbertos, preSelecionar, type AlocacaoRecebimento } from "./receberVarias";

/**
 * Importação de extrato — "O que é isso?" de cada linha (10/nov/2026).
 *
 * Além de gasto/receita normal, uma linha do extrato pode ser:
 *  - emprestei dinheiro / comprei para revenda → abre o formulário de
 *    sempre (NovoInvestimentoModal) já preenchido; ele mesmo lança a saída,
 *    então a linha do extrato NÃO é importada de novo;
 *  - recebi de um empréstimo (parcela, quitação, só juros) / recebi de uma
 *    revenda → dá baixa na operação certa (código E1, R2...) e lança a
 *    entrada na carteira do extrato;
 *  - paguei uma dívida → lançamento ligado à dívida;
 *  - transferência entre minhas carteiras/caixinhas → não conta como gasto
 *    nem como receita.
 */

export type AcaoExtrato =
  | "normal"
  | "emprestei"
  | "receb_emprestimo"
  | "comprei_revenda"
  | "receb_revenda"
  | "divida"
  | "transferencia";

export type ModoRecebimento = "parcela" | "quitacao" | "juros" | "quitar_parcelas" | "recebimento";

export const ROTULO_ACAO: Record<AcaoExtrato, { despesa: string; receita: string }> = {
  normal: { despesa: "Gasto normal", receita: "Receita normal" },
  emprestei: { despesa: "Emprestei dinheiro", receita: "" },
  receb_emprestimo: { despesa: "", receita: "Recebi de um empréstimo" },
  comprei_revenda: { despesa: "Comprei para revenda", receita: "" },
  receb_revenda: { despesa: "", receita: "Recebi de uma revenda" },
  divida: { despesa: "Paguei uma dívida", receita: "" },
  transferencia: { despesa: "Mandei para minha carteira/caixinha", receita: "Veio da minha carteira/caixinha" },
};

export function acoesDoTipo(tipo: "receita" | "despesa"): AcaoExtrato[] {
  return tipo === "despesa"
    ? ["normal", "emprestei", "comprei_revenda", "divida", "transferencia"]
    : ["normal", "receb_emprestimo", "receb_revenda", "transferencia"];
}

/** Empréstimo ou revenda em aberto, com o que precisa pra dar baixa. */
export interface OperacaoAberta {
  investimento: Investimento;
  rotulo: string; // "E3 · Ingrid (parcelado)"
  parcelasAbertas: ParcelaInvestimento[];
  todasParcelas: ParcelaInvestimento[];
  /** Pedaços do nome (sem acento) usados pra reconhecer no extrato. */
  palavras: string[];
}

const IGNORAR_NOME = new Set(["de", "da", "do", "das", "dos", "e", "para", "pra", "emprestimo", "revenda", "compra"]);

function palavrasDoNome(nome: string): string[] {
  return normalizarTexto(nome)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 3 && !IGNORAR_NOME.has(p));
}

export async function carregarOperacoesAbertas(usuarioId: string): Promise<OperacaoAberta[]> {
  const [{ data: invs }, { data: parcelas }] = await Promise.all([
    supabase
      .from("investimentos")
      .select("*")
      .eq("usuario_id", usuarioId)
      .in("tipo", ["emprestimo", "revenda"])
      .eq("quitado", false)
      .order("data_criacao", { ascending: true }),
    supabase.from("investimento_parcelas").select("*").eq("usuario_id", usuarioId).order("numero", { ascending: true }),
  ]);
  const todas = (parcelas as ParcelaInvestimento[] | null) ?? [];
  return ((invs as Investimento[] | null) ?? []).map((inv) => {
    const doInv = todas.filter((p) => p.investimento_id === inv.id);
    const forma = inv.forma_pagamento === "parcelado" ? "parcelado" : "à vista";
    return {
      investimento: inv,
      rotulo: `${inv.codigo ? `${inv.codigo} · ` : ""}${inv.nome} (${forma})`,
      parcelasAbertas: doInv.filter((p) => !p.pago),
      todasParcelas: doInv,
      palavras: palavrasDoNome(inv.nome),
    };
  });
}

/** Modo padrão de recebimento de uma operação para um valor. */
export function modoPadrao(op: OperacaoAberta, valor: number, jaUsadas?: Set<string>): { modo: ModoRecebimento; parcelaId: string | null } {
  const inv = op.investimento;
  const livres = op.parcelasAbertas.filter((p) => !jaUsadas?.has(p.id));
  if (inv.forma_pagamento === "parcelado" && livres.length > 0) {
    const igual = livres.find((p) => Math.abs(Number(p.valor) - valor) < 0.01);
    return { modo: "parcela", parcelaId: (igual ?? livres[0]).id };
  }
  if (inv.tipo === "revenda") return { modo: "recebimento", parcelaId: null };
  const combinado = Number(inv.valor_retornavel ?? inv.valor_investido);
  return { modo: valor >= combinado * 0.99 ? "quitacao" : "juros", parcelaId: null };
}

/**
 * Sugestões automáticas por linha:
 *  - nome de uma carteira/caixinha na descrição ("Dinheiro reservado Pouco
 *    ego") → transferência pra/de essa carteira;
 *  - entrada com o nome da pessoa de um empréstimo em aberto ("Pix recebido
 *    INGRID SILVA") → recebi de um empréstimo, já com a parcela/quitação.
 */
export function sugerirLigacoes(params: {
  itens: LancamentoLido[];
  operacoes: OperacaoAberta[];
  carteiras: Conta[];
  contaImportacaoId: string;
}): (
  | { acao: "transferencia"; carteiraId: string }
  | { acao: "receb_emprestimo"; investimentoId: string; modo: ModoRecebimento; parcelaId: string | null; divisao?: AlocacaoRecebimento[] }
  | null
)[] {
  const carteiras = params.carteiras
    .filter((c) => c.id !== params.contaImportacaoId)
    .map((c) => ({ id: c.id, chave: normalizarTexto(c.nome).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim() }))
    .filter((c) => c.chave.length >= 3)
    // nome maior primeiro ("Pouco ego moto" antes de "Pouco ego")
    .sort((a, b) => b.chave.length - a.chave.length);
  const emprestimos = params.operacoes.filter((o) => o.investimento.tipo === "emprestimo" && o.palavras.length > 0);
  // Duas entradas da mesma pessoa no extrato não pegam a mesma parcela.
  const parcelasUsadas = new Set<string>();

  return params.itens.map((item) => {
    const desc = ` ${normalizarTexto(item.descricao).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()} `;
    const carteira = carteiras.find((c) => desc.includes(` ${c.chave} `));
    if (carteira) return { acao: "transferencia", carteiraId: carteira.id };
    if (item.tipo === "receita" && emprestimos.length > 0) {
      // Todas as palavras do nome cadastrado aparecem na descrição (ex.:
      // "Ingrid" ou "Ingrid Souza"); com mais de um da mesma pessoa, prefere
      // o que tem parcela/valor igual ao recebido.
      const candidatos = emprestimos.filter((o) => o.palavras.every((p) => desc.includes(` ${p} `)));
      if (candidatos.length > 0) {
        // 10/nov/2026: um Pix só pagando vários contratos/parcelas da mesma
        // pessoa — se a soma do que vence no dia (ou outra combinação) bater
        // exatamente com o valor, já sugere dividido.
        const abertos = itensAbertos(candidatos).filter((i) => !i.parcela || !parcelasUsadas.has(i.parcela.id));
        const pre = preSelecionar(abertos, item.valor, item.data);
        if (pre.exata && pre.valores.size > 1) {
          const divisao: AlocacaoRecebimento[] = [];
          for (const it of abertos) {
            const v = pre.valores.get(it.chave);
            if (v == null) continue;
            if (it.parcela) parcelasUsadas.add(it.parcela.id);
            divisao.push({
              investimentoId: it.operacao.investimento.id,
              parcelaId: it.parcela?.id ?? null,
              tipo: it.tipo,
              valor: v,
              modoAvista: it.tipo === "avista" ? "quitacao" : undefined,
            });
          }
          return { acao: "receb_emprestimo", investimentoId: divisao[0].investimentoId, modo: "parcela", parcelaId: null, divisao };
        }
        if (pre.exata && pre.valores.size === 1) {
          const [chave] = Array.from(pre.valores.keys());
          const it = abertos.find((x) => x.chave === chave);
          if (it) {
            if (it.parcela) parcelasUsadas.add(it.parcela.id);
            return {
              acao: "receb_emprestimo",
              investimentoId: it.operacao.investimento.id,
              modo: it.tipo === "parcela" ? "parcela" : it.tipo === "revenda" ? "recebimento" : "quitacao",
              parcelaId: it.parcela?.id ?? null,
            };
          }
        }
        const comValor =
          candidatos.find((o) => o.parcelasAbertas.some((p) => Math.abs(Number(p.valor) - item.valor) < 0.01)) ??
          candidatos.find((o) => Math.abs(Number(o.investimento.valor_retornavel ?? 0) - item.valor) < 0.01) ??
          candidatos[0];
        const { modo, parcelaId } = modoPadrao(comValor, item.valor, parcelasUsadas);
        if (parcelaId) parcelasUsadas.add(parcelaId);
        return { acao: "receb_emprestimo", investimentoId: comValor.investimento.id, modo, parcelaId };
      }
    }
    return null;
  });
}

/** Grava uma linha "recebi de um empréstimo/revenda". */
export async function registrarRecebimentoDoExtrato(params: {
  usuarioId: string;
  contaId: string;
  item: LancamentoLido;
  operacao: OperacaoAberta;
  modo: ModoRecebimento;
  parcelaId: string | null;
}): Promise<{ error: unknown }> {
  const { usuarioId, contaId, item, operacao, modo } = params;
  const inv = operacao.investimento;
  const rotulo = `${inv.codigo ? `${inv.codigo} ` : ""}${inv.nome}`;

  if (modo === "parcela" && params.parcelaId) {
    const parcela = operacao.parcelasAbertas.find((p) => p.id === params.parcelaId);
    if (!parcela) return { error: { message: "Parcela já recebida." } };
    const { error } = await marcarParcelaPaga(
      parcela.id,
      true,
      { usuarioId, contaId, valor: item.valor, descricao: `${rotulo} — parcela ${parcela.numero} recebida` },
      null,
      item.data
    );
    if (error) return { error };
    // Marca como paga aqui também: uma 2ª linha do mesmo extrato não pega a mesma parcela.
    parcela.pago = true;
    operacao.parcelasAbertas = operacao.parcelasAbertas.filter((p) => p.id !== parcela.id);
    if (operacao.parcelasAbertas.length === 0 && (inv.tipo === "emprestimo" || !inv.status_revenda)) {
      const soma = operacao.todasParcelas.reduce((acc, p) => acc + Number(p.valor), 0);
      await marcarEmprestimoQuitadoPorParcelas(inv.id, soma);
    }
    if (inv.tipo === "revenda" && inv.preco_revenda) await reavaliarQuitacaoRevenda(inv.id);
    return { error: null };
  }

  if (modo === "quitar_parcelas") {
    const { error } = await registrarQuitacaoAntecipadaParcelado(inv.id, usuarioId, operacao.parcelasAbertas, item.valor, 0, item.data, contaId);
    if (!error) operacao.parcelasAbertas = [];
    return { error };
  }

  if (inv.tipo === "revenda") {
    return registrarRecebimentoRevenda({ investimento: inv, usuarioId, valor: item.valor, data: item.data, contaId });
  }

  const vencimentoAtual = inv.data_vencimento_final ?? item.data;
  if (modo === "juros") {
    const { error } = await registrarPagamentoJuros({
      investimentoId: inv.id,
      usuarioId,
      parcelaId: null,
      vencimentoAtual,
      valorJuros: item.valor,
      valorDiaria: 0,
      dataPagamento: item.data,
      contaId,
      descricaoLancamento: `${rotulo} — juros recebidos`,
    });
    return { error };
  }
  const { error } = await registrarQuitacaoEmprestimo({
    investimentoId: inv.id,
    usuarioId,
    vencimentoAtual,
    valorPago: item.valor,
    valorDiaria: 0,
    dataPagamento: item.data,
    contaId,
    descricaoLancamento: `${rotulo} — quitação recebida`,
  });
  return { error };
}

/** Primeiro nome "de pessoa" da descrição, pra pré-preencher o empréstimo. */
export function nomeSugeridoDaDescricao(descricao: string): string {
  const limpo = descricao
    .replace(/\b(pix|ted|doc|transfer[eê]ncia|enviad[oa]|recebid[oa]|pagamento|com|para|pra|de)\b/gi, " ")
    .replace(/\d[\d.\-/]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpo.slice(0, 60);
}
