/**
 * Leitor mínimo de planilha .xlsx (09/nov/2026) — vários bancos e carteiras
 * digitais (Mercado Pago, PicPay, PagBank...) exportam o extrato em Excel.
 * Sem biblioteca externa: um .xlsx é um ZIP com XMLs dentro. Aqui:
 * 1) acha os arquivos no ZIP (diretório central);
 * 2) descompacta só o que precisa com o DecompressionStream do navegador;
 * 3) lê a PRIMEIRA aba (textos compartilhados + células) e devolve CSV
 *    ("a;b;c"), que segue o mesmo caminho do importador de CSV.
 * Só lê dados — fórmulas/macros nunca são executadas (.xlsm continua bloqueado).
 */

interface EntradaZip {
  nome: string;
  metodo: number;
  tamanhoCompactado: number;
  offsetLocal: number;
}

function u16(b: Uint8Array, i: number) {
  return b[i] | (b[i + 1] << 8);
}
function u32(b: Uint8Array, i: number) {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
}

function lerDiretorio(b: Uint8Array): EntradaZip[] {
  // Fim do diretório central (assinatura 0x06054b50), procurado do fim pro começo.
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) {
    if (u32(b, i) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new Error("ZIP inválido");
  const total = u16(b, fim + 10);
  let p = u32(b, fim + 16);
  const entradas: EntradaZip[] = [];
  const dec = new TextDecoder();
  for (let k = 0; k < total && p + 46 <= b.length; k++) {
    if (u32(b, p) !== 0x02014b50) break;
    const metodo = u16(b, p + 10);
    const tamanhoCompactado = u32(b, p + 20);
    const nomeLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const comLen = u16(b, p + 32);
    const offsetLocal = u32(b, p + 42);
    const nome = dec.decode(b.subarray(p + 46, p + 46 + nomeLen));
    entradas.push({ nome, metodo, tamanhoCompactado, offsetLocal });
    p += 46 + nomeLen + extraLen + comLen;
  }
  return entradas;
}

async function extrair(b: Uint8Array, e: EntradaZip): Promise<string> {
  const p = e.offsetLocal;
  if (u32(b, p) !== 0x04034b50) throw new Error("ZIP inválido");
  const inicio = p + 30 + u16(b, p + 26) + u16(b, p + 28);
  const dados = b.slice(inicio, inicio + e.tamanhoCompactado);
  if (e.metodo === 0) return new TextDecoder().decode(dados);
  if (e.metodo !== 8) throw new Error("Compressão não suportada");
  const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(fluxo).text();
}

function decodificarXml(t: string): string {
  return t
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function textosCompartilhados(xml: string): string[] {
  const lista: string[] = [];
  for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    const partes = Array.from(si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((m) => decodificarXml(m[1]));
    lista.push(partes.join(""));
  }
  return lista;
}

/** Índices de estilo (cellXfs) que são formato de DATA. */
function estilosDeData(xml: string | null): Set<number> {
  const datas = new Set<number>();
  if (!xml) return datas;
  const formatosData = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
  for (const m of xml.matchAll(/<numFmt\s+[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const codigo = decodificarXml(m[2]).toLowerCase().replace(/"[^"]*"|\[[^\]]*\]/g, "");
    if (/[dy]/.test(codigo) || /m{1,4}\W*y|d\W*m/.test(codigo)) formatosData.add(Number(m[1]));
  }
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  Array.from(cellXfs.matchAll(/<xf\b([^>]*)\/?>/g)).forEach((m, i) => {
    const id = /numFmtId="(\d+)"/.exec(m[1]);
    if (id && formatosData.has(Number(id[1]))) datas.add(i);
  });
  return datas;
}

function serialParaData(n: number): string {
  // Excel: dias desde 30/12/1899.
  const d = new Date(Math.round((n - 25569) * 86400000));
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function colunaDe(ref: string): number {
  const letras = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function pareceXlsx(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Converte a primeira aba do .xlsx em texto CSV (separador ";"). */
export async function xlsxParaCsv(bytes: Uint8Array): Promise<string> {
  const entradas = lerDiretorio(bytes);
  const achar = (nome: string) => entradas.find((e) => e.nome === nome);
  if (entradas.some((e) => /vbaProject\.bin$/i.test(e.nome))) throw new Error("MACRO");
  const abas = entradas.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.nome)).sort((a, b) => a.nome.localeCompare(b.nome, undefined, { numeric: true }));
  if (abas.length === 0) throw new Error("Planilha sem abas");
  const ss = achar("xl/sharedStrings.xml");
  const st = achar("xl/styles.xml");
  const [xmlAba, xmlSS, xmlST] = await Promise.all([
    extrair(bytes, abas[0]),
    ss ? extrair(bytes, ss) : Promise.resolve(""),
    st ? extrair(bytes, st) : Promise.resolve(null),
  ]);
  const compartilhados = xmlSS ? textosCompartilhados(xmlSS) : [];
  const datas = estilosDeData(xmlST);

  const linhas: string[][] = [];
  for (const mLinha of xmlAba.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const celulas: string[] = [];
    for (const mc of mLinha[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = mc[1];
      const conteudo = mc[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const tipo = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const estilo = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? "-1");
      const v = /<v>([\s\S]*?)<\/v>/.exec(conteudo)?.[1];
      let texto = "";
      if (tipo === "s" && v != null) texto = compartilhados[Number(v)] ?? "";
      else if (tipo === "inlineStr") texto = Array.from(conteudo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((m) => decodificarXml(m[1])).join("");
      else if (v != null) {
        texto = decodificarXml(v);
        if (tipo === "n" && datas.has(estilo) && /^\d+(\.\d+)?$/.test(texto)) texto = serialParaData(Number(texto));
      }
      const col = ref ? colunaDe(ref) : celulas.length;
      while (celulas.length < col) celulas.push("");
      celulas[col] = texto;
    }
    if (celulas.some((c) => c.trim() !== "")) linhas.push(celulas);
  }
  const esc = (t: string) => (/[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
  return linhas.map((l) => l.map((c) => esc(c.trim())).join(";")).join("\n");
}
