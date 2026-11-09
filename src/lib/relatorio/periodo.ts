import type { Plano } from "@/lib/planos";

/**
 * Períodos do "Meu relatório" (09/nov/2026). Código puro — usado tanto na
 * tela quanto no cron de push ("Seu relatório está pronto").
 *
 * Frequência por plano (pedido do usuário):
 * - Grátis e Mensal: sem relatório push;
 * - Completo (R$ 20): relatório MENSAL;
 * - Avançado em diante (R$ 40+): relatório QUINZENAL (dia 16 sai o da 1ª
 *   quinzena; dia 1 sai o do mês inteiro que fechou).
 */
export type FrequenciaRelatorio = "mensal" | "quinzenal";

export function frequenciaRelatorio(plano: Plano | string | null | undefined): FrequenciaRelatorio | null {
  if (!plano || plano === "gratis" || plano === "mensal") return null;
  if (plano === "clt") return "mensal";
  return "quinzenal";
}

export interface PeriodoRelatorio {
  /** Identificador estável: "2026-10" (mês) ou "2026-10-q1"/"2026-10-q2". */
  chave: string;
  inicio: string;
  fim: string;
  rotulo: string;
  anterior: { inicio: string; fim: string; rotulo: string };
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function iso(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function ultimoDia(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

/** `mes` de 1 a 12. */
export function periodoMes(ano: number, mes: number): PeriodoRelatorio {
  const a = mesAnterior(ano, mes);
  return {
    chave: `${ano}-${String(mes).padStart(2, "0")}`,
    inicio: iso(ano, mes, 1),
    fim: iso(ano, mes, ultimoDia(ano, mes)),
    rotulo: `${MESES[mes - 1]} de ${ano}`,
    anterior: { inicio: iso(a.ano, a.mes, 1), fim: iso(a.ano, a.mes, ultimoDia(a.ano, a.mes)), rotulo: MESES[a.mes - 1] },
  };
}

export function periodoQuinzena(ano: number, mes: number, q: 1 | 2): PeriodoRelatorio {
  const chave = `${ano}-${String(mes).padStart(2, "0")}-q${q}`;
  if (q === 1) {
    const a = mesAnterior(ano, mes);
    return {
      chave,
      inicio: iso(ano, mes, 1),
      fim: iso(ano, mes, 15),
      rotulo: `1ª quinzena de ${MESES[mes - 1]}`,
      anterior: { inicio: iso(a.ano, a.mes, 16), fim: iso(a.ano, a.mes, ultimoDia(a.ano, a.mes)), rotulo: `2ª quinzena de ${MESES[a.mes - 1]}` },
    };
  }
  return {
    chave,
    inicio: iso(ano, mes, 16),
    fim: iso(ano, mes, ultimoDia(ano, mes)),
    rotulo: `2ª quinzena de ${MESES[mes - 1]}`,
    anterior: { inicio: iso(ano, mes, 1), fim: iso(ano, mes, 15), rotulo: `1ª quinzena de ${MESES[mes - 1]}` },
  };
}

/** Lê a chave da URL ("2026-10" ou "2026-10-q1"). */
export function periodoDaChave(chave: string | null | undefined): PeriodoRelatorio | null {
  const m = /^(\d{4})-(\d{2})(?:-q([12]))?$/.exec(chave ?? "");
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return m[3] ? periodoQuinzena(ano, mes, Number(m[3]) as 1 | 2) : periodoMes(ano, mes);
}

/** Últimos períodos FECHADOS disponíveis pra escolher na tela (mais recente primeiro). */
export function periodosDisponiveis(hoje: Date, frequencia: FrequenciaRelatorio | null, quantidade = 6): PeriodoRelatorio[] {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const lista: PeriodoRelatorio[] = [];
  if (frequencia === "quinzenal" && hoje.getDate() >= 16) lista.push(periodoQuinzena(ano, mes, 1));
  let cursor = mesAnterior(ano, mes);
  while (lista.length < quantidade) {
    lista.push(periodoMes(cursor.ano, cursor.mes));
    if (frequencia === "quinzenal" && lista.length < quantidade) {
      lista.push(periodoQuinzena(cursor.ano, cursor.mes, 2));
      if (lista.length < quantidade) lista.push(periodoQuinzena(cursor.ano, cursor.mes, 1));
    }
    cursor = mesAnterior(cursor.ano, cursor.mes);
  }
  return lista;
}

/** Período que o push de HOJE deve anunciar (fuso de Brasília), ou null. */
export function periodoDoPushDeHoje(hojeBr: { ano: number; mes: number; dia: number }, frequencia: FrequenciaRelatorio | null): PeriodoRelatorio | null {
  if (!frequencia) return null;
  if (hojeBr.dia === 1) {
    const a = mesAnterior(hojeBr.ano, hojeBr.mes);
    return periodoMes(a.ano, a.mes);
  }
  if (hojeBr.dia === 16 && frequencia === "quinzenal") return periodoQuinzena(hojeBr.ano, hojeBr.mes, 1);
  return null;
}
