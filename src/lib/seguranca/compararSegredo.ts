import { createHash, timingSafeEqual } from "crypto";

/**
 * Item 10 da apuração de segurança (10/out/2026): compara um segredo
 * recebido (header de webhook, CRON_SECRET) com o esperado em TEMPO
 * CONSTANTE. Uma comparação comum (`===`) termina no primeiro caractere
 * diferente, e o tempo de resposta vaza quantos caracteres já batem —
 * permitindo, em tese, descobrir o token aos poucos.
 *
 * Os dois lados passam primeiro por SHA-256: assim os buffers têm sempre o
 * mesmo tamanho (exigência do `timingSafeEqual`) e nem o comprimento do
 * segredo real vaza pelo tempo.
 *
 * Sem segredo configurado (env vazia) ou sem valor recebido → sempre false.
 */
export function segredoConfere(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!esperado || !recebido) return false;
  const a = createHash("sha256").update(recebido, "utf8").digest();
  const b = createHash("sha256").update(esperado, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Extrai o valor de um header `Authorization: Bearer <valor>`. */
export function valorBearer(cabecalho: string | null): string | null {
  if (!cabecalho) return null;
  const m = /^Bearer\s+(.+)$/i.exec(cabecalho.trim());
  return m ? m[1].trim() : null;
}
