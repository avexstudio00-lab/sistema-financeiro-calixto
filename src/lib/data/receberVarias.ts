import { supabase } from "@/lib/supabase/client";
import type { ParcelaInvestimento } from "./tipos";
import type { OperacaoAberta } from "./importarLigacoes";
import {
  marcarEmprestimoQuitadoPorParcelas,
  marcarParcelaPaga,
  registrarPagamentoJuros,
  registrarQuitacaoEmprestimo,
} from "./investimentos";
import { lancarMovimentoInvestimento, estornarMovimento } from "./movimentosInvestimento";
import { reavaliarQuitacaoRevenda, registrarRecebimentoRevenda } from "./revenda";

/**
 * "Receber várias de uma vez" (10/nov/2026): a pessoa manda UM Pix que
 * paga parcelas de vários empréstimos/revendas (ex.: 3 contratos, R$ 100 +
 * R$ 200 + R$ 200 = R$ 500). Usado na tela de Investimentos (lançando à
 * mão) e na importação de extrato (dividir uma linha).
 *
 * Regra de pré-seleção pedida pelo usuário: primeiro o que VENCE NO DIA do
 * pagamento; se a soma bater, são esses. Senão procura a combinação exata
 * mais perto da data; se nada bater exato, vai preenchendo pelo vencimento
 * mais perto do dia (o último pode ficar pago em parte).
 */

export type TipoItemAberto = "parcela" | "avista" | "revenda";

export interface ItemAberto {
  chave: string;
  tipo: TipoItemAberto;
  operacao: OperacaoAberta;
  parcela: ParcelaInvestimento | null;
  /** Ex.: "E3 · Ingrid — parcela 2/5" */
  rotulo: string;
  vencimento: string | null;
  /** Quanto falta receber deste item. */
  restante: number;
}

/** Alocação de um pedaço do valor recebido num item. */
export interface AlocacaoRecebimento {
  investimentoId: string;
  parcelaId: string | null;
  tipo: TipoItemAberto;
  valor: number;
  /** Empréstimo à vista: quitação ou só os juros. */
  modoAvista?: "quitacao" | "juros";
}

export function itensAbertos(operacoes: OperacaoAberta[]): ItemAberto[] {
  const itens: ItemAberto[] = [];
  for (const op of operacoes) {
    const inv = op.investimento;
    const nome = `${inv.codigo ? `${inv.codigo} · ` : ""}${inv.nome}`;
    if (inv.forma_pagamento === "parcelado" && op.parcelasAbertas.length > 0) {
      const total = op.todasParcelas.length || op.parcelasAbertas.length;
      for (const p of op.parcelasAbertas) {
        const restante = Number((Number(p.valor) - Number(p.valor_recebido ?? 0)).toFixed(2));
        if (restante <= 0.004) continue;
        itens.push({
          chave: `p:${p.id}`,
          tipo: "parcela",
          operacao: op,
          parcela: p,
          rotulo: `${nome} — parcela ${p.numero}/${total}`,
          vencimento: p.data_vencimento,
          restante,
        });
      }
    } else if (inv.tipo === "emprestimo") {
      itens.push({
        chave: `a:${inv.id}`,
        tipo: "avista",
        operacao: op,
        parcela: null,
        rotulo: `${nome} — à vista`,
        vencimento: inv.data_vencimento_final,
        restante: Number(inv.valor_retornavel ?? inv.valor_investido),
      });
    } else if (inv.tipo === "revenda") {
      itens.push({
        chave: `r:${inv.id}`,
        tipo: "revenda",
        operacao: op,
        parcela: null,
        rotulo: `${nome} — revenda`,
        vencimento: inv.data_vencimento_final,
        restante: Number(inv.preco_revenda ?? inv.valor_investido),
      });
    }
  }
  return itens;
}

const dia = (iso: string) => new Date(iso + "T00:00:00").getTime() / 86400000;
const centavos = (v: number) => Math.round(v * 100);

/** Distância (em dias) do vencimento até o dia do pagamento; sem data vai pro fim. */
function distancia(item: { vencimento: string | null }, data: string): number {
  return item.vencimento ? Math.abs(dia(item.vencimento) - dia(data)) : 9999;
}

/** Combinação de itens que soma EXATAMENTE `alvo` (em centavos), ou null. */
function combinacaoExata<T extends { restante: number }>(itens: T[], alvo: number): T[] | null {
  const lista = itens.slice(0, 22);
  let passos = 0;
  const escolhidos: T[] = [];
  function buscar(i: number, resto: number): boolean {
    if (resto === 0) return true;
    if (i >= lista.length || resto < 0 || ++passos > 300000) return false;
    escolhidos.push(lista[i]);
    if (buscar(i + 1, resto - centavos(lista[i].restante))) return true;
    escolhidos.pop();
    return buscar(i + 1, resto);
  }
  return buscar(0, alvo) && escolhidos.length > 0 ? escolhidos.slice() : null;
}

/**
 * Sugere quanto vai em cada item. Devolve chave → valor e se a soma bateu
 * exatamente (`exata`).
 */
export function preSelecionar<T extends { chave: string; restante: number; vencimento: string | null }>(itens: T[], valor: number, data: string): { valores: Map<string, number>; exata: boolean } {
  const valores = new Map<string, number>();
  const alvo = centavos(valor);
  if (alvo <= 0 || itens.length === 0) return { valores, exata: false };
  const porDistancia = [...itens].sort((a, b) => distancia(a, data) - distancia(b, data) || (a.vencimento ?? "").localeCompare(b.vencimento ?? ""));

  // 1) O que vence no dia (ou na mesma data de vencimento mais próxima).
  const maisPerto = distancia(porDistancia[0], data);
  const doDia = porDistancia.filter((i) => distancia(i, data) === maisPerto);
  const exatoDoDia = combinacaoExata(doDia, alvo);
  // 2) Combinação exata entre todos, priorizando os de data mais perto.
  const exato = exatoDoDia ?? combinacaoExata(porDistancia, alvo);
  if (exato) {
    exato.forEach((i) => valores.set(i.chave, i.restante));
    return { valores, exata: true };
  }
  // 3) Vai preenchendo pelo vencimento mais perto do dia; o último fica em parte.
  let resto = alvo;
  for (const item of porDistancia) {
    if (resto <= 0) break;
    const parte = Math.min(centavos(item.restante), resto);
    valores.set(item.chave, parte / 100);
    resto -= parte;
  }
  return { valores, exata: resto === 0 };
}

/** Grava todas as alocações de um recebimento (cada uma vira uma entrada na carteira). */
export async function registrarRecebimentoVarias(params: {
  usuarioId: string;
  contaId: string;
  data: string;
  operacoes: OperacaoAberta[];
  alocacoes: AlocacaoRecebimento[];
}): Promise<{ ok: number; falhas: string[] }> {
  let ok = 0;
  const falhas: string[] = [];
  for (const a of params.alocacoes) {
    if (!(a.valor > 0)) continue;
    const op = params.operacoes.find((o) => o.investimento.id === a.investimentoId);
    if (!op) {
      falhas.push("Operação não encontrada (já quitada?)");
      continue;
    }
    const inv = op.investimento;
    const rotulo = `${inv.codigo ? `${inv.codigo} ` : ""}${inv.nome}`;
    try {
      // eslint-disable-next-line no-await-in-loop -- sequencial: saldo e parcelas
      const erro = await registrarUma(params, a, op, rotulo);
      if (erro) falhas.push(`${rotulo}: ${erro}`);
      else ok += 1;
    } catch {
      falhas.push(`${rotulo}: não foi possível registrar`);
    }
  }
  return { ok, falhas };
}

async function registrarUma(
  params: { usuarioId: string; contaId: string; data: string },
  a: AlocacaoRecebimento,
  op: OperacaoAberta,
  rotulo: string
): Promise<string | null> {
  const inv = op.investimento;
  const { usuarioId, contaId, data } = params;

  if (a.tipo === "parcela" && a.parcelaId) {
    const parcela = op.parcelasAbertas.find((p) => p.id === a.parcelaId);
    if (!parcela) return "parcela já recebida";
    const jaRecebido = Number(parcela.valor_recebido ?? 0);
    const restante = Number((Number(parcela.valor) - jaRecebido).toFixed(2));
    if (a.valor >= restante - 0.004) {
      // Fecha a parcela (a entrada na carteira é o valor recebido agora).
      const { error } = await marcarParcelaPaga(
        parcela.id,
        true,
        { usuarioId, contaId, valor: Number(a.valor.toFixed(2)), descricao: `${rotulo} — parcela ${parcela.numero} recebida` },
        null,
        data
      );
      if (error) return "não foi possível marcar a parcela";
      parcela.pago = true;
      op.parcelasAbertas = op.parcelasAbertas.filter((p) => p.id !== parcela.id);
      if (op.parcelasAbertas.length === 0 && (inv.tipo === "emprestimo" || !inv.status_revenda)) {
        const soma = op.todasParcelas.reduce((acc, p) => acc + Number(p.valor), 0);
        await marcarEmprestimoQuitadoPorParcelas(inv.id, soma);
      }
      if (inv.tipo === "revenda" && inv.preco_revenda) await reavaliarQuitacaoRevenda(inv.id);
      return null;
    }
    // Pagou só uma parte: a parcela continua aberta, com saldo.
    const transacaoId = await lancarMovimentoInvestimento({
      usuarioId,
      contaId,
      sentido: "resgate",
      valor: Number(a.valor.toFixed(2)),
      data,
      descricao: `${rotulo} — parte da parcela ${parcela.numero}`,
    });
    if (!transacaoId) return "não foi possível lançar na carteira";
    const { error: erroEvento } = await supabase.from("investimento_pagamentos").insert({
      investimento_id: inv.id,
      usuario_id: usuarioId,
      parcela_id: parcela.id,
      tipo: "parcial",
      data_pagamento: data,
      dias_atraso: 0,
      valor_juros: null,
      valor_diaria: null,
      valor_pago: Number(a.valor.toFixed(2)),
      vencimento_referencia: parcela.data_vencimento,
      proximo_vencimento: null,
      conta_id: contaId,
      transacao_id: transacaoId,
    });
    if (erroEvento) {
      await estornarMovimento(transacaoId);
      return "não foi possível registrar o pagamento parcial";
    }
    const novo = Number((jaRecebido + a.valor).toFixed(2));
    await supabase.from("investimento_parcelas").update({ valor_recebido: novo }).eq("id", parcela.id);
    parcela.valor_recebido = novo;
    return null;
  }

  if (a.tipo === "revenda") {
    const { error } = await registrarRecebimentoRevenda({ investimento: inv, usuarioId, valor: a.valor, data, contaId });
    return error ? "não foi possível registrar o recebimento" : null;
  }

  // Empréstimo à vista.
  const vencimentoAtual = inv.data_vencimento_final ?? data;
  if (a.modoAvista === "juros") {
    const { error } = await registrarPagamentoJuros({
      investimentoId: inv.id,
      usuarioId,
      parcelaId: null,
      vencimentoAtual,
      valorJuros: a.valor,
      valorDiaria: 0,
      dataPagamento: data,
      contaId,
      descricaoLancamento: `${rotulo} — juros recebidos`,
    });
    return error ? "não foi possível registrar os juros" : null;
  }
  const { error } = await registrarQuitacaoEmprestimo({
    investimentoId: inv.id,
    usuarioId,
    vencimentoAtual,
    valorPago: a.valor,
    valorDiaria: 0,
    dataPagamento: data,
    contaId,
    descricaoLancamento: `${rotulo} — quitação recebida`,
  });
  return error ? "não foi possível registrar a quitação" : null;
}
