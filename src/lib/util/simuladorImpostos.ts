/**
 * Simulador de impostos (10/nov/2026) — ESTIMATIVA pra separar o dinheiro,
 * não substitui contador nem emite guia/nota.
 *
 * MEI: DAS fixo = 5% do salário mínimo (INSS) + R$ 1 de ICMS (comércio/
 * indústria) e/ou R$ 5 de ISS (serviços). Salário mínimo 2026: R$ 1.621.
 * Simples Nacional: alíquota efetiva = (RBT12 × alíquota − dedução) ÷ RBT12,
 * tabelas da LC 123/2006 (redação da LC 155/2016).
 */

export const SALARIO_MINIMO_PADRAO = 1621;
export const LIMITE_MEI_ANUAL = 81000;

export type AtividadeMei = "comercio" | "servicos" | "ambos";
export type AnexoSimples = "I" | "II" | "III" | "V";

const FAIXAS: Record<AnexoSimples, { ate: number; aliquota: number; deducao: number }[]> = {
  I: [
    { ate: 180000, aliquota: 4, deducao: 0 },
    { ate: 360000, aliquota: 7.3, deducao: 5940 },
    { ate: 720000, aliquota: 9.5, deducao: 13860 },
    { ate: 1800000, aliquota: 10.7, deducao: 22500 },
    { ate: 3600000, aliquota: 14.3, deducao: 87300 },
    { ate: 4800000, aliquota: 19, deducao: 378000 },
  ],
  II: [
    { ate: 180000, aliquota: 4.5, deducao: 0 },
    { ate: 360000, aliquota: 7.8, deducao: 5940 },
    { ate: 720000, aliquota: 10, deducao: 13860 },
    { ate: 1800000, aliquota: 11.2, deducao: 22500 },
    { ate: 3600000, aliquota: 14.7, deducao: 85500 },
    { ate: 4800000, aliquota: 30, deducao: 720000 },
  ],
  III: [
    { ate: 180000, aliquota: 6, deducao: 0 },
    { ate: 360000, aliquota: 11.2, deducao: 9360 },
    { ate: 720000, aliquota: 13.5, deducao: 17640 },
    { ate: 1800000, aliquota: 16, deducao: 35640 },
    { ate: 3600000, aliquota: 21, deducao: 125640 },
    { ate: 4800000, aliquota: 33, deducao: 648000 },
  ],
  V: [
    { ate: 180000, aliquota: 15.5, deducao: 0 },
    { ate: 360000, aliquota: 18, deducao: 4500 },
    { ate: 720000, aliquota: 19.5, deducao: 9900 },
    { ate: 1800000, aliquota: 20.5, deducao: 17100 },
    { ate: 3600000, aliquota: 23, deducao: 62100 },
    { ate: 4800000, aliquota: 30.5, deducao: 540000 },
  ],
};

export const ROTULO_ANEXO: Record<AnexoSimples, string> = {
  I: "Anexo I — comércio",
  II: "Anexo II — indústria",
  III: "Anexo III — serviços (maioria: salão, manutenção, academia...)",
  V: "Anexo V — serviços intelectuais (consultoria, TI, engenharia...)",
};

export function dasMei(atividade: AtividadeMei, salarioMinimo = SALARIO_MINIMO_PADRAO): number {
  const inss = salarioMinimo * 0.05;
  const extra = atividade === "comercio" ? 1 : atividade === "servicos" ? 5 : 6;
  return Number((inss + extra).toFixed(2));
}

/** Alíquota efetiva (%) do Simples para a receita dos últimos 12 meses. */
export function aliquotaEfetivaSimples(anexo: AnexoSimples, rbt12: number): number {
  const base = Math.max(rbt12, 0.01);
  const faixa = FAIXAS[anexo].find((f) => base <= f.ate) ?? FAIXAS[anexo][FAIXAS[anexo].length - 1];
  if (base <= 180000) return faixa.aliquota; // 1ª faixa: sem dedução
  return Math.max(0, ((base * faixa.aliquota) / 100 - faixa.deducao) / base) * 100;
}

export function impostoSimplesDoMes(anexo: AnexoSimples, rbt12: number, faturamentoMes: number) {
  const aliquota = aliquotaEfetivaSimples(anexo, rbt12 > 0 ? rbt12 : faturamentoMes * 12);
  return { aliquota, imposto: Number(((faturamentoMes * aliquota) / 100).toFixed(2)) };
}
