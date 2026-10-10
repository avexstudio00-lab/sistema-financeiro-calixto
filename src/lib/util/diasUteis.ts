/**
 * Dias úteis (segunda a sexta) — usado no follow-up de orçamentos (item 4.6
 * da especificação de 09/out/2026: alerta após 3 dias úteis sem interação).
 * Feriados não entram na conta (não há calendário de feriados no app); no
 * máximo isso antecipa o alerta em um dia em semana de feriado.
 */
function ehDiaUtil(d: Date): boolean {
  const dia = d.getUTCDay();
  return dia !== 0 && dia !== 6;
}

/** Quantos dias úteis completos se passaram entre `inicio` e `fim`. */
export function diasUteisEntre(inicio: Date, fim: Date): number {
  if (fim <= inicio) return 0;
  let contagem = 0;
  const cursor = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate()));
  const limite = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), fim.getUTCDate()));
  while (cursor < limite) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (ehDiaUtil(cursor)) contagem++;
  }
  return contagem;
}

/** Data (meia-noite UTC) que fica `n` dias úteis antes de `referencia`. */
export function subtrairDiasUteis(referencia: Date, n: number): Date {
  const cursor = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), referencia.getUTCDate()));
  let restantes = n;
  while (restantes > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (ehDiaUtil(cursor)) restantes--;
  }
  return cursor;
}
