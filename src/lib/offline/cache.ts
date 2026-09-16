/**
 * Cache local simples para o modo offline (ver checklist/roadmap — "Parte 1":
 * ver dados offline com atualização automática ao reconectar).
 *
 * Guarda a última resposta boa que veio do servidor, com a hora em que foi
 * salva, para o app poder mostrar "o que já vimos" em vez de tela em branco
 * quando o usuário está sem internet. Importante:
 * - É só para VISUALIZAÇÃO. Nunca é usado para calcular saldo ou qualquer
 *   outro número que dependa do estado real do banco de dados.
 * - Nunca substitui um dado ao vivo quando a internet está funcionando — só
 *   entra em cena quando a busca ao servidor não pôde acontecer.
 * - Fica salvo em localStorage, ou seja, só no aparelho da própria pessoa;
 *   nada aqui é enviado para lugar nenhum.
 */

export interface EntradaCache<T> {
  dados: T;
  /** ISO 8601 — momento em que `dados` foi buscado com sucesso do servidor. */
  salvoEm: string;
}

const PREFIXO = "meucontrole:offline:";

export function salvarCache<T>(chave: string, dados: T): void {
  if (typeof window === "undefined") return;
  try {
    const entrada: EntradaCache<T> = { dados, salvoEm: new Date().toISOString() };
    window.localStorage.setItem(PREFIXO + chave, JSON.stringify(entrada));
  } catch {
    // Armazenamento cheio, modo privado/anônimo, etc. Não é crítico: o app
    // continua funcionando normalmente, só sem o cache offline dessa tela.
  }
}

export function lerCache<T>(chave: string): EntradaCache<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const bruto = window.localStorage.getItem(PREFIXO + chave);
    if (!bruto) return null;
    return JSON.parse(bruto) as EntradaCache<T>;
  } catch {
    return null;
  }
}
