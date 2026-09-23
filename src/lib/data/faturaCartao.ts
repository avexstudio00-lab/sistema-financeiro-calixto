import type { Transacao } from "./tipos";

/**
 * Cálculo de ciclo de fatura de cartão de crédito -- puro, sem acesso a
 * banco (recebe as transações já carregadas, mesmo padrão de
 * `ExtratoCompleto`/`dividas.ts`: nunca duplicamos lógica de saldo, só
 * agrupamos o que já existe). Nenhuma mudança aqui afeta `saldo_atual` da
 * conta -- é só uma forma diferente de agrupar/exibir as mesmas transações.
 *
 * Regra do ciclo (convenção comum de cartão no Brasil): a fatura que fecha
 * no dia `diaFechamento` do mês M contém toda transação com
 * `diaFechamento(mês M-1) < data <= diaFechamento(mês M)`. O vencimento é
 * um dia do mês (`diaVencimento`) -- se ele for maior ou igual ao dia de
 * fechamento, cai no mesmo mês do fechamento; se for menor, a fatura só
 * vence no mês seguinte (ex: fecha dia 28, vence dia 5 do mês que vem --
 * padrão comum de cartão).
 */

function ultimoDiaDoMes(ano: number, mesIndice0: number): number {
  return new Date(ano, mesIndice0 + 1, 0).getDate();
}

/** Ajusta o dia desejado pro último dia do mês quando ele não existir (ex:
 * dia 31 num mês de 30 dias) -- mesmo padrão já usado em `contasFixas.ts`. */
function dataDoDia(ano: number, mesIndice0: number, dia: number): Date {
  const diaEfetivo = Math.min(dia, ultimoDiaDoMes(ano, mesIndice0));
  return new Date(ano, mesIndice0, diaEfetivo);
}

function paraIso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export interface CicloFatura {
  /** Chave estável do ciclo (ano-mês do fechamento), usada só pra agrupar
   * -- ex: "2026-10". */
  chave: string;
  /** Primeiro dia do ciclo (o dia seguinte ao fechamento anterior), ISO. */
  inicio: string;
  /** Dia em que esta fatura fecha, ISO. */
  fechamento: string;
  /** Dia em que esta fatura vence, ISO -- pode cair no mês do fechamento
   * ou no seguinte, dependendo de `diaVencimento` vs `diaFechamento`. */
  vencimento: string;
  /** true = ciclo ainda não fechou (fatura "em aberto"), calculado
   * comparando `fechamento` com a data de referência passada. */
  aberta: boolean;
  /** Rótulo amigável pra exibição, ex: "Fatura de outubro". */
  rotulo: string;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Calcula o ciclo de fatura (fechamento/vencimento/rótulo) cujo fechamento
 * cai no mês `ano`/`mesIndice0` dado. `hoje` é usado só pra decidir se o
 * ciclo já fechou (`aberta`). */
function montarCiclo(
  ano: number,
  mesIndice0: number,
  diaFechamento: number,
  diaVencimento: number,
  hoje: Date
): CicloFatura {
  const fechamento = dataDoDia(ano, mesIndice0, diaFechamento);

  const mesAnterior = new Date(ano, mesIndice0 - 1, 1);
  const fechamentoAnterior = dataDoDia(mesAnterior.getFullYear(), mesAnterior.getMonth(), diaFechamento);
  const inicio = new Date(fechamentoAnterior);
  inicio.setDate(inicio.getDate() + 1);

  // Vencimento: mesmo mês do fechamento se o dia de vencimento vier depois
  // (ou no mesmo dia) do fechamento; senão, rola pro mês seguinte.
  const vencimentoMesmoMes = diaVencimento >= diaFechamento;
  const vencimentoBase = vencimentoMesmoMes
    ? new Date(ano, mesIndice0, 1)
    : new Date(ano, mesIndice0 + 1, 1);
  const vencimento = dataDoDia(vencimentoBase.getFullYear(), vencimentoBase.getMonth(), diaVencimento);

  return {
    chave: `${ano}-${String(mesIndice0 + 1).padStart(2, "0")}`,
    inicio: paraIso(inicio),
    fechamento: paraIso(fechamento),
    vencimento: paraIso(vencimento),
    aberta: fechamento.getTime() >= new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime(),
    rotulo: `Fatura de ${MESES[mesIndice0]}`,
  };
}

/** Devolve o ciclo (fechado ou em aberto) que contém a data informada. */
export function cicloContendo(
  dataIso: string,
  diaFechamento: number,
  diaVencimento: number,
  hoje: Date = new Date()
): CicloFatura {
  const data = new Date(dataIso + "T00:00:00");
  const fechamentoDoProprioMes = dataDoDia(data.getFullYear(), data.getMonth(), diaFechamento);

  // Se a data já passou do fechamento deste mês, ela pertence ao ciclo que
  // fecha no mês seguinte.
  const pertenceAoMesSeguinte = data.getTime() > fechamentoDoProprioMes.getTime();
  const alvo = pertenceAoMesSeguinte ? new Date(data.getFullYear(), data.getMonth() + 1, 1) : data;

  return montarCiclo(alvo.getFullYear(), alvo.getMonth(), diaFechamento, diaVencimento, hoje);
}

/** Ciclo "atual" (o que contém hoje) -- a fatura em aberto que vai fechar
 * em breve. */
export function cicloAtual(diaFechamento: number, diaVencimento: number, hoje: Date = new Date()): CicloFatura {
  return cicloContendo(paraIso(hoje), diaFechamento, diaVencimento, hoje);
}

export interface GrupoFatura {
  ciclo: CicloFatura;
  transacoes: Transacao[];
  total: number;
}

/** Agrupa as transações de UMA conta de cartão de crédito por ciclo de
 * fatura, mais recente primeiro. `transacoes` já deve vir filtrada pra
 * `conta_id` da carteira em questão -- esta função não filtra por conta. */
export function agruparPorFatura(
  transacoes: Transacao[],
  diaFechamento: number,
  diaVencimento: number,
  hoje: Date = new Date()
): GrupoFatura[] {
  const porChave = new Map<string, GrupoFatura>();

  for (const t of transacoes) {
    const ciclo = cicloContendo(t.data, diaFechamento, diaVencimento, hoje);
    const grupo = porChave.get(ciclo.chave);
    if (grupo) {
      grupo.transacoes.push(t);
      grupo.total += t.tipo === "despesa" ? Number(t.valor) : -Number(t.valor);
    } else {
      porChave.set(ciclo.chave, {
        ciclo,
        transacoes: [t],
        total: t.tipo === "despesa" ? Number(t.valor) : -Number(t.valor),
      });
    }
  }

  return Array.from(porChave.values()).sort((a, b) => (a.ciclo.chave < b.ciclo.chave ? 1 : -1));
}

/** Soma o total da fatura EM ABERTO de todos os cartões de crédito
 * informados de uma vez -- usado no widget de patrimônio líquido do painel
 * (a fatura ainda não fechada/paga conta como um passivo, junto com as
 * dívidas pessoais). Reaproveita `agruparPorFatura`/`CicloFatura.aberta`,
 * a mesma lógica já usada na tela de UM cartão (`/dashboard/cartao/[id]`),
 * só que somada pra todos de uma vez. `transacoes` pode vir com lançamentos
 * de mais de uma conta -- esta função filtra por `conta_id` internamente.
 * Cartões sem `dia_fechamento`/`dia_vencimento` configurados são ignorados
 * (não dá pra calcular o ciclo sem isso). Uma fatura com saldo credor (mais
 * estorno/pagamento do que compra) não soma nada -- só falta real de
 * pagamento é um passivo. */
export function calcularFaturaAbertaTotal(
  contasCartao: { id: string; dia_fechamento: number | null; dia_vencimento: number | null }[],
  transacoes: Transacao[],
  hoje: Date = new Date()
): number {
  let total = 0;
  for (const conta of contasCartao) {
    if (!conta.dia_fechamento || !conta.dia_vencimento) continue;
    const transacoesDaConta = transacoes.filter((t) => t.conta_id === conta.id);
    const grupos = agruparPorFatura(transacoesDaConta, conta.dia_fechamento, conta.dia_vencimento, hoje);
    const faturaAberta = grupos.find((g) => g.ciclo.aberta);
    if (faturaAberta) total += Math.max(0, faturaAberta.total);
  }
  return total;
}
