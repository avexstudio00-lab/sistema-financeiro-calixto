/**
 * Leitor de OFX (09/nov/2026) — o formato de "extrato para programas de
 * finanças" que quase todo banco brasileiro exporta (Itaú, Bradesco, BB,
 * Caixa, Santander, Nubank, Inter, C6...). Puro, sem lib externa.
 *
 * Funciona com OFX 1.x (SGML, tags sem fechamento) e 2.x (XML). Devolve as
 * transações e se o arquivo é de CONTA (banco) ou de CARTÃO DE CRÉDITO.
 *
 * O resultado é convertido em texto CSV ("Data;Descrição;Valor") e entra no
 * mesmo caminho do importador de CSV (mapeamento, conferência, duplicadas) —
 * assim as duas portas de entrada usam a mesma validação.
 */

export interface TransacaoOfx {
  data: string; // ISO AAAA-MM-DD
  valor: number; // com sinal: negativo = saída
  descricao: string;
  tipoOfx: string; // DEBIT, CREDIT, PAYMENT, XFER...
  fitid: string | null;
}

export interface ExtratoOfx {
  ehCartao: boolean;
  transacoes: TransacaoOfx[];
}

export function pareceOfx(texto: string): boolean {
  const inicio = texto.slice(0, 2000).toUpperCase();
  return inicio.includes("OFXHEADER") || inicio.includes("<OFX>") || /<STMTTRN>/i.test(texto.slice(0, 20000));
}

function valorDaTag(bloco: string, tag: string): string | null {
  // <TAG>valor  (SGML, até a próxima tag ou fim de linha) ou <TAG>valor</TAG>
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(bloco);
  return m ? m[1].trim() : null;
}

function dataOfx(bruto: string | null): string | null {
  // "20261105120000" (às vezes com fuso entre colchetes depois) → 2026-11-05
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(bruto ?? "");
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (ano < 1970 || ano > 2099 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function valorOfx(bruto: string | null): number | null {
  if (!bruto) return null;
  let t = bruto.replace(/\s/g, "");
  // Alguns bancos mandam "1.234,56"; o padrão OFX é "1234.56".
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function limpar(texto: string): string {
  return texto
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function lerOfx(texto: string): ExtratoOfx {
  const ehCartao = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>|<CCACCTFROM>/i.test(texto);
  const transacoes: TransacaoOfx[] = [];
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  for (const bruto of blocos) {
    const bloco = bruto.split(/<\/STMTTRN>/i)[0];
    const data = dataOfx(valorDaTag(bloco, "DTPOSTED") ?? valorDaTag(bloco, "DTUSER"));
    const valor = valorOfx(valorDaTag(bloco, "TRNAMT"));
    if (!data || valor == null || valor === 0) continue;
    const memo = valorDaTag(bloco, "MEMO") ?? "";
    const nome = valorDaTag(bloco, "NAME") ?? "";
    // Junta NAME + MEMO sem repetir (cada banco usa um dos dois, ou os dois).
    const partes = [nome, memo].map(limpar).filter(Boolean);
    const descricao = partes.length === 2 && partes[1].toLowerCase().includes(partes[0].toLowerCase()) ? partes[1] : partes.join(" - ");
    transacoes.push({
      data,
      valor,
      descricao: descricao || "Lançamento do extrato",
      tipoOfx: (valorDaTag(bloco, "TRNTYPE") ?? "").toUpperCase(),
      fitid: valorDaTag(bloco, "FITID"),
    });
  }
  return { ehCartao, transacoes };
}

/** Converte em CSV ("Data;Descrição;Valor"), valor com vírgula decimal. */
export function ofxParaCsv(extrato: ExtratoOfx): string {
  const esc = (t: string) => `"${t.replace(/"/g, '""')}"`;
  const linhas = ["Data;Descrição;Valor"];
  for (const t of extrato.transacoes) {
    const [a, m, d] = t.data.split("-");
    linhas.push([`${d}/${m}/${a}`, esc(t.descricao), t.valor.toFixed(2).replace(".", ",")].join(";"));
  }
  return linhas.join("\n");
}
