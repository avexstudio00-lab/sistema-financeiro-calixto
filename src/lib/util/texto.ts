/** Remove acentos, caixa e espaços extras — pra comparar descrições. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Distância de Levenshtein clássica (quantas edições de 1 caractere
 * transformam `a` em `b`). Usada no aviso de lançamento duplicado (6.7). */
export function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + custo);
    }
    anterior = atual;
  }
  return anterior[b.length];
}

/** Similaridade de 0 a 1 entre dois textos (1 = iguais), já normalizados. */
export function similaridade(a: string, b: string): number {
  const x = normalizarTexto(a);
  const y = normalizarTexto(b);
  const maior = Math.max(x.length, y.length);
  if (maior === 0) return 1;
  return 1 - distanciaLevenshtein(x, y) / maior;
}

/** Monta um link do WhatsApp (wa.me) a partir de um telefone brasileiro
 * digitado de qualquer jeito. Devolve null se não tiver dígitos suficientes. */
export function linkWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const comPais = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${comPais}?text=${encodeURIComponent(mensagem)}`;
}

/** Data de hoje no fuso local, em ISO (YYYY-MM-DD). */
export function hojeIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Soma `dias` a uma data ISO (fuso local, sem horário). */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Diferença em dias entre duas datas ISO (b - a). */
export function diasEntre(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86400000);
}
