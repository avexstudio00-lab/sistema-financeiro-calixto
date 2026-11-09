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
 * Onde roda (10/nov/2026): primeiro no aparelho (pdfExtratoCliente.ts). Se o
 * navegador não der conta (iPhone com Safari mais antigo não abre a build do
 * pdf.js), o arquivo vai pra /api/importar/pdf, que lê o MESMO texto no
 * servidor e devolve só as linhas — nada é gravado. A montagem das linhas
 * (`extrairComPdfjs`) é a mesma nos dois lados.
 *
 * O worker do pdf.js fica em /public/pdf.worker.min.mjs (mesma origem, por
 * causa da CSP worker-src 'self'). Usa a build LEGACY (com polyfills): a
 * build normal do pdf.js 6 usa recursos novos de JS (Map.getOrInsert,
 * Math.sumPrecise...) que o Safari do iPhone ainda não tem — e aí o PDF
 * "não abria" (achado do usuário em 09/nov/2026). Ao atualizar o pdfjs-dist,
 * copiar de novo node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs.
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

/** Onde a linha estava no PDF (página e altura) — usado pra juntar descrição quebrada. */
export interface PosicaoLinha {
  pagina: number;
  y: number;
}

const CABECALHO = /^(data|descri|valor|saldo|id |p[aá]gina|detalhe dos movimentos|\d+\s*\/\s*\d+$)/i;

/**
 * Descrição quebrada em várias linhas: muitos extratos (ex.: Mercado Pago)
 * centralizam a linha da data/valor e escrevem o nome ACIMA e ABAIXO dela:
 *
 *     Pix recebido ALINE MARIA DA
 *     05-10-2026  CONCEICAO SOARES DA   R$ 240,00   R$ 257,31
 *     SILVA
 *
 * Com a posição de cada linha, cada pedaço de texto solto vai pro lançamento
 * mais PRÓXIMO na página (empate fica com o de cima). Sem posição, cai na
 * regra antiga: texto solto continua o lançamento anterior.
 */
function agruparTextoSolto(linhas: string[], posicoes: PosicaoLinha[] | undefined, ehLancamento: boolean[]): Map<number, { antes: string[]; depois: string[] }> {
  const anexos = new Map<number, { antes: string[]; depois: string[] }>();
  if (!posicoes || posicoes.length !== linhas.length) return anexos;
  // Altura típica de uma linha (mediana dos espaços entre linhas seguidas).
  const gaps: number[] = [];
  for (let i = 1; i < linhas.length; i++) {
    if (posicoes[i].pagina === posicoes[i - 1].pagina) {
      const g = Math.abs(posicoes[i - 1].y - posicoes[i].y);
      if (g > 0.5) gaps.push(g);
    }
  }
  gaps.sort((a, b) => a - b);
  // O menor espaçamento comum (1º quartil) é o de "linha quebrada"; o espaço
  // entre um lançamento e outro costuma ser bem maior.
  const alturaLinha = gaps.length ? gaps[Math.floor(gaps.length / 4)] : 12;
  const alcance = Math.max(alturaLinha * 2.2, 10);
  const lancamentosDaPagina = (pg: number) => linhas.map((_, j) => j).filter((j) => ehLancamento[j] && posicoes[j].pagina === pg);
  for (let i = 0; i < linhas.length; i++) {
    if (ehLancamento[i]) continue;
    const texto = linhas[i].replace(/\s+/g, " ").trim();
    if (!texto || texto.length > 80 || CABECALHO.test(texto) || valoresNaLinha(texto).length > 0) continue;
    let melhor = -1;
    let melhorDist = Infinity;
    for (let j = 0; j < linhas.length; j++) {
      if (!ehLancamento[j] || posicoes[j].pagina !== posicoes[i].pagina) continue;
      const dist = Math.abs(posicoes[j].y - posicoes[i].y);
      // empate: o lançamento de cima (j < i) ganha
      if (dist < melhorDist - 0.01 || (Math.abs(dist - melhorDist) <= 0.01 && j < i)) {
        melhor = j;
        melhorDist = dist;
      }
    }
    let antes = i < melhor;
    if (melhor < 0 || melhorDist > alcance) {
      // Lançamento cortado pela virada de página: texto no RODAPÉ (nenhum
      // lançamento abaixo dele na página) vai pro 1º da página seguinte;
      // texto no TOPO (nenhum acima) vai pro último da página anterior.
      const pg = posicoes[i].pagina;
      const daPagina = lancamentosDaPagina(pg);
      const abaixo = daPagina.some((j) => j > i);
      const acima = daPagina.some((j) => j < i);
      if (!abaixo) {
        const prox = lancamentosDaPagina(pg + 1)[0];
        if (prox == null || lancamentosDaPagina(pg + 1).length === 0) continue;
        melhor = prox;
        antes = true;
      } else if (!acima && pg > 1) {
        const ant = lancamentosDaPagina(pg - 1);
        if (ant.length === 0) continue;
        melhor = ant[ant.length - 1];
        antes = false;
      } else continue;
    }
    const a = anexos.get(melhor) ?? { antes: [], depois: [] };
    if (antes) a.antes.push(texto);
    else a.depois.push(texto);
    anexos.set(melhor, a);
  }
  return anexos;
}

/** Valor que vem logo depois de "saldo inicial/anterior" (não o "saldo final" da mesma linha). */
function saldoDeAbertura(texto: string): number | null {
  const k = norm(texto);
  const m = /saldo (inicial|anterior)/.exec(k);
  if (!m) return null;
  const depois = valoresNaLinha(texto.slice(m.index));
  return depois.length ? depois[0].valor : null;
}

/**
 * Interpreta as linhas de texto de um extrato. Puro (sem pdf.js) pra dar
 * pra testar com o texto de qualquer banco. `posicoes` (opcional) melhora
 * a descrição quando ela vem quebrada em várias linhas.
 */
export function interpretarLinhasPdf(linhas: string[], anoPadrao: number, posicoes?: PosicaoLinha[]): LancamentoPdf[] {
  const limpas = linhas.map((b) => b.replace(/\s+/g, " ").trim());
  // Quais linhas são lançamentos (data no começo + valor), pra saber onde
  // pendurar os pedaços de descrição soltos.
  // Alguns bancos só escrevem a data no 1º lançamento do dia: depois da
  // primeira data, linha com valor também conta como lançamento.
  let temData = false;
  const ehLancamento = limpas.map((l) => {
    const d = dataNoInicio(l, anoPadrao);
    if (d) temData = true;
    if (!temData || LINHAS_IGNORADAS.some((p) => norm(l).includes(p))) return false;
    return valoresNaLinha(d ? d.resto : l).length > 0;
  });
  const anexos = agruparTextoSolto(limpas, posicoes, ehLancamento);
  const usaPosicoes = anexos.size > 0;

  const saida: LancamentoPdf[] = [];
  let saldoAnterior: number | null = null;
  let dataCorrente: string | null = null;
  for (let idx = 0; idx < limpas.length; idx++) {
    const linha = limpas[idx];
    if (!linha) continue;
    const k = norm(linha);
    const d = dataNoInicio(linha, anoPadrao);
    if (d) dataCorrente = d.iso;
    const valores = valoresNaLinha(d ? d.resto : linha);
    if (LINHAS_IGNORADAS.some((p) => k.includes(p))) {
      const abertura = saldoDeAbertura(linha);
      if (abertura != null) saldoAnterior = abertura;
      else if (valores.length > 0 && saldoAnterior == null) saldoAnterior = valores[valores.length - 1].valor;
      continue;
    }
    if (valores.length === 0) {
      if (usaPosicoes) continue; // já foi pendurada no lançamento mais próximo
      // Linha só de texto logo depois de um lançamento (descrição quebrada em 2 linhas).
      const ultimo = saida[saida.length - 1];
      if (ultimo && !d && linha.length <= 60 && !CABECALHO.test(linha) && ultimo.descricao.length < 120) {
        ultimo.descricao = ultimo.descricao === "Lançamento do extrato" ? linha : `${ultimo.descricao} ${linha}`.trim();
      }
      continue;
    }
    // Valor antes da primeira data = resumo do topo ("Entradas: R$ ...").
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
    const meio = (textoBase.slice(0, lanc.inicio) + " " + textoBase.slice(temSaldo ? valores[valores.length - 1].fim : lanc.fim));
    const extra = anexos.get(idx);
    const descricao = [...(extra?.antes ?? []), meio, ...(extra?.depois ?? [])]
      .join(" ")
      .replace(RE_VALOR, " ")
      .replace(/\|/g, " ")
      .replace(/\b\d{8,}\b/g, " ") // IDs de operação
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    saida.push({ data: dataCorrente as string, descricao: descricao || "Lançamento do extrato", valor });
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

export interface LinhasDoPdf {
  linhas: string[];
  posicoes: PosicaoLinha[];
  ehCartao: boolean;
}

/** O pedaço do pdf.js que usamos (mesma API no navegador e no servidor). */
export interface PdfjsMinimo {
  getDocument(params: Record<string, unknown>): {
    promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }> }>;
    destroy(): Promise<void>;
  };
}

/**
 * Abre o PDF com o pdf.js recebido e remonta as linhas (mesma altura na
 * página), separando colunas por " | ". Usado no aparelho e no servidor.
 * Erros: "SENHA" / "SENHA_ERRADA" (PDF com senha) ou o erro original.
 */
export async function extrairComPdfjs(pdfjs: PdfjsMinimo, bytes: Uint8Array, senha?: string): Promise<LinhasDoPdf> {
  // Cópia: o pdf.js transfere o buffer pro worker (o original fica vazio) —
  // sem isso não daria pra tentar de novo nem mandar pro servidor.
  const tarefa = pdfjs.getDocument({ data: bytes.slice(), password: senha, disableFontFace: true, useSystemFonts: false, enableXfa: false, verbosity: 0 });
  let doc;
  try {
    doc = await tarefa.promise;
  } catch (e) {
    if ((e as { name?: string })?.name === "PasswordException") throw new Error(senha ? "SENHA_ERRADA" : "SENHA");
    throw e;
  }
  const linhas: string[] = [];
  const posicoes: PosicaoLinha[] = [];
  try {
    const paginas = Math.min(doc.numPages, 60);
    for (let p = 1; p <= paginas; p++) {
      const pagina = await doc.getPage(p);
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
        posicoes.push({ pagina: p, y: Math.round(g.y * 10) / 10 });
      }
    }
  } finally {
    await tarefa.destroy();
  }
  return { linhas, posicoes, ehCartao: pareceFaturaDeCartao(linhas) };
}

/**
 * Fatura de cartão: cabeçalho fala de fatura + limite/vencimento e não tem
 * "saldo anterior" de conta corrente. Nas faturas o gasto vem POSITIVO (o
 * importador sugere "inverter sinal"; dá pra desmarcar no mapeamento).
 */
export function pareceFaturaDeCartao(linhas: string[]): boolean {
  const cabecalho = norm(linhas.slice(0, 15).join(" "));
  return (
    cabecalho.includes("fatura") &&
    (cabecalho.includes("limite") || cabecalho.includes("vencimento") || cabecalho.includes("total da fatura") || cabecalho.includes("cartao")) &&
    !norm(linhas.slice(0, 60).join(" ")).includes("saldo anterior")
  );
}

/** Ano mais provável do extrato (pra datas sem ano, tipo "03/11"). */
export function anoDoExtrato(linhas: string[]): number {
  const anos = new Map<number, number>();
  for (const l of linhas.slice(0, 80)) for (const m of l.matchAll(/\b(20\d{2})\b/g)) anos.set(Number(m[1]), (anos.get(Number(m[1])) ?? 0) + 1);
  const melhor = Array.from(anos.entries()).sort((a, b) => b[1] - a[1])[0];
  return melhor ? melhor[0] : new Date().getFullYear();
}
