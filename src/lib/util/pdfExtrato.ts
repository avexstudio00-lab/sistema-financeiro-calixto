/**
 * Leitura de extrato em PDF (09/nov/2026) — pra bancos/carteiras que só
 * entregam PDF (ex.: Mercado Pago "Extrato"). Roda no aparelho da pessoa com
 * o pdf.js (pdfjs-dist), sem mandar o arquivo pra servidor nenhum.
 *
 * Como funciona:
 * 1) extrai o texto de cada página com a posição de cada pedaço e remonta
 *    as LINHAS (mesma altura na página), separando colunas por espaço grande;
 * 2) `interpretarLinhasPdf` (puro, testável) acha em cada linha a data, o
 *    valor (e o saldo, quando tem) e a descrição; o sinal vem do "-"/D/C, da
 *    diferença de saldo entre uma linha e outra ou de palavras como
 *    "enviado"/"recebido";
 * 3) devolve CSV "Data;Descrição;Valor" pro mesmo caminho do importador.
 *
 * O worker do pdf.js fica em /public/pdf.worker.min.mjs (mesma origem, por
 * causa da CSP worker-src 'self'). Ao atualizar o pdfjs-dist, copiar de novo
 * node_modules/pdfjs-dist/build/pdf.worker.min.mjs.
 */

export interface LinhaPdf {
  texto: string;
}

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  feb: 2, apr: 4, may: 5, aug: 8, sep: 9, oct: 10, dec: 12,
};

function norm(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Data no começo da linha: 03/11/2026, 03-11-26, 03/11, "03 nov", "03 de nov. 2026". */
export function dataNoInicio(texto: string, anoPadrao: number): { iso: string; resto: string } | null {
  const t = texto.trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/.exec(t);
  if (m) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    let ano = m[3] ? Number(m[3]) : anoPadrao;
    if (ano < 100) ano += 2000;
    return montar(dia, mes, ano, t.slice(m[0].length));
  }
  m = /^(\d{1,2})\s*(?:de\s+)?([a-zç]{3})[a-zç]*\.?(?:\s*(?:de\s+)?(\d{4}))?\b/i.exec(t);
  if (m && MESES[norm(m[2])]) {
    return montar(Number(m[1]), MESES[norm(m[2])], m[3] ? Number(m[3]) : anoPadrao, t.slice(m[0].length));
  }
  return null;
}

function montar(dia: number, mes: number, ano: number, resto: string) {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 1970 || ano > 2099) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1) return null;
  return { iso: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`, resto };
}

/** Valores em reais na linha (com sinal quando o extrato mostra). */
const RE_VALOR = /(-|−|–)?\s*(?:R\$\s*)?(-|−|–)?\s*(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})(?!\d)\s*([DC](?![a-z]))?(-)?/gi;

export function valoresNaLinha(texto: string): { valor: number; inicio: number; fim: number; comSinal: boolean }[] {
  const lista: { valor: number; inicio: number; fim: number; comSinal: boolean }[] = [];
  for (const m of texto.matchAll(RE_VALOR)) {
    const numero = Number(`${m[3].replace(/\./g, "")}.${m[4]}`);
    const negativo = !!(m[1] || m[2] || m[6]) || (m[5] ?? "").toUpperCase() === "D";
    const comSinal = !!(m[1] || m[2] || m[5] || m[6]);
    lista.push({ valor: negativo ? -numero : numero, inicio: m.index ?? 0, fim: (m.index ?? 0) + m[0].length, comSinal });
  }
  return lista;
}

const PALAVRAS_SAIDA = ["enviad", "pagamento", "pagto", "pgto", "compra", "debito", "saida", "tarifa", "saque", "transferencia enviada", "pix enviado", "boleto", "fatura", "aplicacao", "iof"];
const PALAVRAS_ENTRADA = ["recebid", "deposito", "credito", "rendimento", "estorno", "devolucao", "reembolso", "resgate", "salario", "entrada", "cashback"];
const LINHAS_IGNORADAS = ["saldo anterior", "saldo do dia", "saldo final", "saldo inicial", "saldo em", "saldo disponivel", "saldo total", "total de", "totais", "subtotal"];

export interface LancamentoPdf {
  data: string;
  descricao: string;
  valor: number; // com sinal
}

/**
 * Interpreta as linhas de texto de um extrato. Puro (sem pdf.js) pra dar
 * pra testar com o texto de qualquer banco.
 */
export function interpretarLinhasPdf(linhas: string[], anoPadrao: number): LancamentoPdf[] {
  const saida: LancamentoPdf[] = [];
  let saldoAnterior: number | null = null;
  let dataCorrente: string | null = null;
  for (const bruta of linhas) {
    const linha = bruta.replace(/\s+/g, " ").trim();
    if (!linha) continue;
    const k = norm(linha);
    const d = dataNoInicio(linha, anoPadrao);
    if (d) dataCorrente = d.iso;
    const valores = valoresNaLinha(d ? d.resto : linha);
    if (LINHAS_IGNORADAS.some((p) => k.includes(p))) {
      if (valores.length > 0) saldoAnterior = valores[valores.length - 1].valor;
      continue;
    }
    if (valores.length === 0) {
      // Linha só de texto logo depois de um lançamento (descrição quebrada em 2 linhas).
      const ultimo = saida[saida.length - 1];
      if (ultimo && !d && linha.length <= 60 && !/^(data|descri|valor|saldo|id |p[aá]gina)/i.test(linha) && ultimo.descricao.length < 120) {
        ultimo.descricao = `${ultimo.descricao} ${linha}`.trim();
      }
      continue;
    }
    if (!dataCorrente) continue;
    // Com 2+ valores, o último costuma ser o SALDO e o anterior o lançamento.
    const temSaldo = valores.length >= 2;
    const lanc = temSaldo ? valores[valores.length - 2] : valores[0];
    const saldo = temSaldo ? valores[valores.length - 1].valor : null;
    let valor = lanc.valor;
    if (!lanc.comSinal) {
      if (saldo != null && saldoAnterior != null && Math.abs(Math.abs(saldo - saldoAnterior) - Math.abs(valor)) < 0.02) {
        valor = saldo < saldoAnterior ? -Math.abs(valor) : Math.abs(valor);
      } else if (PALAVRAS_SAIDA.some((p) => k.includes(p)) && !PALAVRAS_ENTRADA.some((p) => k.includes(p))) {
        valor = -Math.abs(valor);
      }
    }
    if (saldo != null) saldoAnterior = saldo;
    if (Math.abs(valor) < 0.005) continue;
    const textoBase = d ? d.resto : linha;
    const descricao = (textoBase.slice(0, lanc.inicio) + " " + textoBase.slice(temSaldo ? valores[valores.length - 1].fim : lanc.fim))
      .replace(RE_VALOR, " ")
      .replace(/\|/g, " ")
      .replace(/\b\d{8,}\b/g, " ") // IDs de operação
      .replace(/\s+/g, " ")
      .trim();
    saida.push({ data: dataCorrente, descricao: descricao || "Lançamento do extrato", valor });
  }
  return saida;
}

export function lancamentosPdfParaCsv(lista: LancamentoPdf[]): string {
  const esc = (t: string) => `"${t.replace(/"/g, '""')}"`;
  const linhas = ["Data;Descrição;Valor"];
  for (const l of lista) {
    const [a, m, dd] = l.data.split("-");
    linhas.push([`${dd}/${m}/${a}`, esc(l.descricao), l.valor.toFixed(2).replace(".", ",")].join(";"));
  }
  return linhas.join("\n");
}

export function parecePdf(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** Lê o PDF no navegador e devolve as linhas de texto (e se parece fatura de cartão). */
export async function lerLinhasPdf(bytes: Uint8Array, senha?: string): Promise<{ linhas: string[]; ehCartao: boolean }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  let doc;
  // Só texto: sem fontes, sem formulários XFA (o pdf.js 6 não usa eval).
  const tarefa = pdfjs.getDocument({ data: bytes, password: senha, disableFontFace: true, useSystemFonts: false, enableXfa: false });
  try {
    doc = await tarefa.promise;
  } catch (e) {
    if ((e as { name?: string })?.name === "PasswordException") throw new Error(senha ? "SENHA_ERRADA" : "SENHA");
    throw new Error("PDF_INVALIDO");
  }
  const linhas: string[] = [];
  const paginas = Math.min(doc.numPages, 60);
  for (let p = 1; p <= paginas; p++) {
    // eslint-disable-next-line no-await-in-loop -- página por página
    const pagina = await doc.getPage(p);
    // eslint-disable-next-line no-await-in-loop
    const conteudo = await pagina.getTextContent();
    const itens = (conteudo.items as { str?: string; transform?: number[]; width?: number }[])
      .filter((i) => i.str && i.str.trim() && i.transform)
      .map((i) => ({ str: i.str as string, x: (i.transform as number[])[4], y: (i.transform as number[])[5], w: i.width ?? 0 }));
    // Agrupa por altura (linha), de cima pra baixo.
    itens.sort((a, b) => b.y - a.y || a.x - b.x);
    const grupos: { y: number; itens: typeof itens }[] = [];
    for (const it of itens) {
      const g = grupos.find((gr) => Math.abs(gr.y - it.y) < 3);
      if (g) g.itens.push(it);
      else grupos.push({ y: it.y, itens: [it] });
    }
    grupos.sort((a, b) => b.y - a.y);
    for (const g of grupos) {
      g.itens.sort((a, b) => a.x - b.x);
      let texto = "";
      let fimAnterior: number | null = null;
      for (const it of g.itens) {
        const espaco = fimAnterior == null ? "" : it.x - fimAnterior > 12 ? " | " : it.x - fimAnterior > 1.5 ? " " : "";
        texto += espaco + it.str;
        fimAnterior = it.x + it.w;
      }
      linhas.push(texto);
    }
  }
  await tarefa.destroy();
  // Fatura de cartão: cabeçalho fala de fatura + limite/vencimento e não
  // tem "saldo anterior" de conta corrente. Nas faturas o gasto vem POSITIVO
  // (o importador sugere "inverter sinal"; dá pra desmarcar no mapeamento).
  const cabecalho = norm(linhas.slice(0, 15).join(" "));
  const ehCartao =
    cabecalho.includes("fatura") &&
    (cabecalho.includes("limite") || cabecalho.includes("vencimento") || cabecalho.includes("total da fatura") || cabecalho.includes("cartao")) &&
    !norm(linhas.slice(0, 60).join(" ")).includes("saldo anterior");
  return { linhas, ehCartao };
}

/** Ano mais provável do extrato (pra datas sem ano, tipo "03/11"). */
export function anoDoExtrato(linhas: string[]): number {
  const anos = new Map<number, number>();
  for (const l of linhas.slice(0, 80)) for (const m of l.matchAll(/\b(20\d{2})\b/g)) anos.set(Number(m[1]), (anos.get(Number(m[1])) ?? 0) + 1);
  const melhor = Array.from(anos.entries()).sort((a, b) => b[1] - a[1])[0];
  return melhor ? melhor[0] : new Date().getFullYear();
}
