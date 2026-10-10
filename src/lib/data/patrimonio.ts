import { supabase } from "@/lib/supabase/client";
import { calcularValorAtualEstimado } from "./investimentos";
import type { Conta, CotacoesMercado, Investimento } from "./tipos";

/**
 * Patrimônio separado por "dono do dinheiro" (itens 6.9, 6.10, 12.9 e 12.10
 * da especificação de 09/out/2026).
 *
 * As carteiras são da pessoa, mas a empresa movimenta as mesmas carteiras
 * com lançamentos marcados como "negócio". A fração de cada carteira que é
 * da empresa = entradas do negócio − saídas do negócio naquela carteira.
 * O resto do saldo é pessoal. Assim dá pra separar sem pedir nada novo ao
 * usuário: só usa o que ele já marcou em cada lançamento.
 */

type LinhaMov = { conta_id: string | null; tipo: "receita" | "despesa"; valor: number };

/** Lê todas as linhas (paginado — o Supabase devolve no máximo 1000 por vez). */
async function lerMovimentosNegocio(usuarioId: string): Promise<LinhaMov[]> {
  const todas: LinhaMov[] = [];
  const pagina = 1000;
  for (let inicio = 0; inicio < 500000; inicio += pagina) {
    const { data, error } = await supabase
      .from("transacoes")
      .select("conta_id, tipo, valor")
      .eq("usuario_id", usuarioId)
      .eq("tipo_negocio", "negocio")
      .range(inicio, inicio + pagina - 1);
    if (error || !data) break;
    todas.push(...(data as LinhaMov[]));
    if (data.length < pagina) break;
  }
  return todas;
}

export interface DivisaoConta {
  conta: Conta;
  saldoTotal: number;
  parteEmpresa: number;
  partePessoal: number;
  /** true quando a carteira tem lançamentos do negócio (uso misto). */
  mista: boolean;
}

export interface DivisaoCarteiras {
  porConta: DivisaoConta[];
  /** Caixa do negócio lançado sem carteira (ex.: dinheiro em espécie). */
  negocioSemConta: number;
  totalEmpresa: number;
  totalPessoal: number;
}

export async function dividirCarteirasPessoalEmpresa(usuarioId: string, contas: Conta[]): Promise<DivisaoCarteiras> {
  const movs = await lerMovimentosNegocio(usuarioId);
  const liquidoPorConta = new Map<string, number>();
  let negocioSemConta = 0;
  for (const m of movs) {
    const delta = m.tipo === "receita" ? Number(m.valor) : -Number(m.valor);
    if (!m.conta_id) negocioSemConta += delta;
    else liquidoPorConta.set(m.conta_id, (liquidoPorConta.get(m.conta_id) ?? 0) + delta);
  }
  const porConta = contas
    .filter((c) => c.tipo !== "cartao_credito")
    .map((conta) => {
      const saldoTotal = Number(conta.saldo_atual);
      const parteEmpresa = Number((liquidoPorConta.get(conta.id) ?? 0).toFixed(2));
      return {
        conta,
        saldoTotal,
        parteEmpresa,
        partePessoal: Number((saldoTotal - parteEmpresa).toFixed(2)),
        mista: liquidoPorConta.has(conta.id),
      };
    });
  const totalEmpresa = porConta.reduce((a, c) => a + c.parteEmpresa, 0);
  const totalPessoal = porConta.reduce((a, c) => a + c.partePessoal, 0);
  return { porConta, negocioSemConta: Number(negocioSemConta.toFixed(2)), totalEmpresa, totalPessoal };
}

export interface PatrimonioEmpresa {
  caixa: number;
  estoque: number;
  aReceber: number;
  aPagar: number;
  investimentos: number;
  liquido: number;
}

/** PL da empresa: caixa (todos os lançamentos do negócio) + estoque a custo +
 * a receber + aplicações com o caixa da empresa − a pagar. */
export async function calcularPatrimonioEmpresa(
  contaMestreId: string,
  investimentos: Investimento[],
  cotacoes?: CotacoesMercado
): Promise<PatrimonioEmpresa> {
  const [movsTodos, { data: cartoes }, { data: produtos }, { data: receber }, { data: pagar }] = await Promise.all([
    lerMovimentosNegocio(contaMestreId),
    supabase.from("contas").select("id").eq("usuario_id", contaMestreId).eq("tipo", "cartao_credito"),
    supabase.from("produtos").select("custo, quantidade_estoque, ativo").eq("usuario_id", contaMestreId),
    supabase.from("contas_receber").select("valor").eq("usuario_id", contaMestreId).eq("status", "pendente"),
    supabase.from("contas_pagar").select("valor").eq("usuario_id", contaMestreId).eq("status", "pendente"),
  ]);
  // Gasto da empresa no CARTÃO não sai do caixa da empresa agora: ele vira
  // fatura (passivo) do lado pessoal, que já desconta a fatura em aberto.
  // Contar aqui também tiraria o mesmo valor duas vezes do consolidado.
  const idsCartao = new Set(((cartoes as { id: string }[]) ?? []).map((c) => c.id));
  const movs = movsTodos.filter((m) => !m.conta_id || !idsCartao.has(m.conta_id));
  const caixa = movs.reduce((a, m) => a + (m.tipo === "receita" ? Number(m.valor) : -Number(m.valor)), 0);
  const estoque = ((produtos as { custo: number; quantidade_estoque: number; ativo: boolean }[]) ?? [])
    .filter((p) => p.ativo)
    .reduce((a, p) => a + Number(p.custo) * Number(p.quantidade_estoque), 0);
  const aReceber = ((receber as { valor: number }[]) ?? []).reduce((a, c) => a + Number(c.valor), 0);
  const aPagar = ((pagar as { valor: number }[]) ?? []).reduce((a, c) => a + Number(c.valor), 0);
  const inv = investimentos
    .filter((i) => i.tipo_ambiente === "NEGOCIO" && !i.quitado)
    .reduce((a, i) => a + calcularValorAtualEstimado(i, undefined, cotacoes), 0);
  const r = (v: number) => Number(v.toFixed(2));
  return {
    caixa: r(caixa),
    estoque: r(estoque),
    aReceber: r(aReceber),
    aPagar: r(aPagar),
    investimentos: r(inv),
    liquido: r(caixa + estoque + aReceber + inv - aPagar),
  };
}

/** Investimentos que contam no patrimônio pessoal (exclui os da empresa). */
export function investimentosPessoais(lista: Investimento[]): Investimento[] {
  return lista.filter((i) => (i.tipo_ambiente ?? "PESSOAL") === "PESSOAL");
}
