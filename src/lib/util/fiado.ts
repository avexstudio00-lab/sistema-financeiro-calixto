/**
 * Fiado flexível (seção 15.2, 15/out/2026): cada venda a prazo tem as
 * próprias condições — entrada, número de parcelas, periodicidade, 1º
 * vencimento e valores que podem ser diferentes entre si.
 *
 * Funções puras (sem banco), para a tela e o registro da venda usarem a
 * mesma conta e para serem testadas isoladamente.
 */

export type PeriodicidadeFiado = "mensal" | "quinzenal" | "semanal";

export interface ParcelaFiado {
  vencimento: string; // "YYYY-MM-DD"
  valor: number;
}

/** Condições preferidas de um cliente (coluna `clientes.padrao_fiado`). */
export interface PadraoFiado {
  parcelas: number;
  periodicidade: PeriodicidadeFiado;
  /** Dias entre a data da venda e o 1º vencimento. */
  dias_primeiro_vencimento: number;
  /** Entrada como % do total (0 = sem entrada). */
  entrada_percentual: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Soma meses mantendo o dia (31/jan + 1 mês = 28 ou 29/fev). Aritmética de
 * calendário, sem passar por UTC. */
export function somarMeses(dataIso: string, meses: number): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const total = mes - 1 + meses;
  const novoAno = ano + Math.floor(total / 12);
  const novoMes = ((total % 12) + 12) % 12;
  const ultimo = new Date(novoAno, novoMes + 1, 0).getDate();
  return `${novoAno}-${pad(novoMes + 1)}-${pad(Math.min(dia, ultimo))}`;
}

export function somarDias(dataIso: string, dias: number): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia + dias);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Diferença em dias corridos entre duas datas "YYYY-MM-DD" (b − a). */
export function diasEntreDatasIso(a: string, b: string): number {
  const [a1, a2, a3] = a.split("-").map(Number);
  const [b1, b2, b3] = b.split("-").map(Number);
  return Math.round((Date.UTC(b1, b2 - 1, b3) - Date.UTC(a1, a2 - 1, a3)) / 86400000);
}

/** Vencimento da parcela `indice` (0 = primeira). */
export function vencimentoDaParcela(primeiro: string, indice: number, periodicidade: PeriodicidadeFiado): string {
  if (periodicidade === "mensal") return somarMeses(primeiro, indice);
  return somarDias(primeiro, indice * (periodicidade === "quinzenal" ? 15 : 7));
}

export const arredondar2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Gera as parcelas com valores iguais; a última absorve os centavos, para a
 * soma bater exatamente com o valor a parcelar.
 */
export function gerarParcelasFiado(
  valorAParcelar: number,
  numeroParcelas: number,
  primeiroVencimento: string,
  periodicidade: PeriodicidadeFiado
): ParcelaFiado[] {
  const n = Math.max(1, Math.floor(numeroParcelas) || 1);
  const total = arredondar2(Math.max(0, valorAParcelar));
  const base = Math.floor((total / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => ({
    vencimento: vencimentoDaParcela(primeiroVencimento, i, periodicidade),
    valor: i === n - 1 ? arredondar2(total - base * (n - 1)) : base,
  }));
}

export function somaParcelas(parcelas: ParcelaFiado[]): number {
  return arredondar2(parcelas.reduce((acc, p) => acc + (Number.isFinite(p.valor) ? p.valor : 0), 0));
}

/**
 * Confere as condições antes de gravar. Devolve a mensagem de erro (para
 * mostrar na tela) ou null quando está tudo certo.
 */
export function validarCondicoesFiado(total: number, entrada: number, parcelas: ParcelaFiado[], dataVenda: string): string | null {
  const t = arredondar2(total);
  const e = arredondar2(entrada);
  if (e < 0) return "A entrada não pode ser negativa.";
  if (e >= t) return "A entrada cobre a venda toda — desmarque o fiado e registre como venda à vista.";
  if (parcelas.length === 0) return "Informe pelo menos uma parcela.";
  for (const [i, p] of parcelas.entries()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento)) return `Parcela ${i + 1}: data de vencimento inválida.`;
    if (!(p.valor > 0)) return `Parcela ${i + 1}: o valor precisa ser maior que zero.`;
    if (p.vencimento < dataVenda) return `Parcela ${i + 1}: o vencimento não pode ser antes da data da venda.`;
  }
  const falta = arredondar2(t - e - somaParcelas(parcelas));
  if (Math.abs(falta) >= 0.01) {
    return falta > 0
      ? `As parcelas somam menos que o valor a receber — faltam ${falta.toFixed(2).replace(".", ",")}.`
      : `As parcelas somam mais que o valor a receber — sobram ${Math.abs(falta).toFixed(2).replace(".", ",")}.`;
  }
  return null;
}

/** Lê com segurança o padrão salvo no cliente (jsonb pode vir de qualquer jeito). */
export function lerPadraoFiado(bruto: unknown): PadraoFiado | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const parcelas = Number(b.parcelas);
  const dias = Number(b.dias_primeiro_vencimento);
  const entrada = Number(b.entrada_percentual ?? 0);
  const periodicidade = b.periodicidade;
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 120) return null;
  if (!Number.isFinite(dias) || dias < 0 || dias > 3650) return null;
  if (periodicidade !== "mensal" && periodicidade !== "quinzenal" && periodicidade !== "semanal") return null;
  return {
    parcelas,
    periodicidade,
    dias_primeiro_vencimento: Math.round(dias),
    entrada_percentual: Number.isFinite(entrada) && entrada >= 0 && entrada < 100 ? entrada : 0,
  };
}
