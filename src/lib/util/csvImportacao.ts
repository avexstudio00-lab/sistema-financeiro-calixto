import { normalizarTexto } from "./texto";

/**
 * Leitura e interpretação de CSV para a importação de lançamentos
 * (especificação de 05/out/2026). Tudo aqui é TypeScript puro, sem
 * biblioteca externa e sem acesso ao banco — roda no navegador, em cima do
 * texto lido pelo FileReader, e pode ser testado isoladamente.
 *
 * Cobre:
 *  - o formato nativo do app (exportarTransacoesCSV: "Data;Tipo;Categoria;
 *    Descrição;Forma de pagamento;Valor (R$)");
 *  - extratos de bancos brasileiros (Nubank, Itaú, Inter, Bradesco, Santander,
 *    BB, Caixa, C6, Mercado Pago): delimitador detectado (; , tab), linhas de
 *    cabeçalho "de enfeite" antes da tabela, datas em vários formatos, valor
 *    com sinal, entre parênteses, com D/C, ou em colunas Débito/Crédito.
 */

export const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;
export const MAXIMO_LINHAS = 5000;
export const MAX_DESCRICAO = 255;
export const MAX_CATEGORIA = 100;

export type CampoCanonico =
  | "ignorar"
  | "data"
  | "tipo"
  | "descricao"
  | "valor"
  | "credito"
  | "debito"
  | "categoria"
  | "forma_pagamento"
  | "vencimento";

export const ROTULO_CAMPO: Record<CampoCanonico, string> = {
  ignorar: "Ignorar coluna",
  data: "Data",
  tipo: "Tipo (receita/despesa)",
  descricao: "Descrição",
  valor: "Valor (com sinal)",
  credito: "Valor de entrada (crédito)",
  debito: "Valor de saída (débito)",
  categoria: "Categoria",
  forma_pagamento: "Forma de pagamento",
  vencimento: "Vencimento",
};

export type FormaPagamento = "pix" | "debito" | "credito" | "dinheiro" | "boleto";

export interface ArquivoLido {
  /** Texto já decodificado (UTF-8 ou Windows-1252/ISO-8859-1), sem BOM. */
  texto: string;
  codificacao: "utf-8" | "windows-1252";
}

export class ErroArquivo extends Error {}

// ---------------------------------------------------------------------------
// 1) Barreira do arquivo: extensão, tamanho, binário, conteúdo suspeito.
// ---------------------------------------------------------------------------

const ASSINATURAS_BINARIAS: { nome: string; bytes: number[] }[] = [
  { nome: "executável do Windows", bytes: [0x4d, 0x5a] }, // MZ
  { nome: "arquivo compactado/planilha do Excel", bytes: [0x50, 0x4b, 0x03, 0x04] }, // ZIP / xlsx / xlsm
  { nome: "planilha antiga do Office", bytes: [0xd0, 0xcf, 0x11, 0xe0] }, // OLE (xls/doc)
  { nome: "PDF", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { nome: "executável", bytes: [0x7f, 0x45, 0x4c, 0x46] }, // ELF
  { nome: "arquivo compactado", bytes: [0x1f, 0x8b] }, // gzip
  { nome: "arquivo compactado", bytes: [0x52, 0x61, 0x72, 0x21] }, // RAR
  { nome: "arquivo compactado", bytes: [0x37, 0x7a, 0xbc, 0xaf] }, // 7z
];

// Windows/Chrome costuma informar CSV como "application/vnd.ms-excel"; o
// macOS às vezes manda vazio ou text/plain. Por isso a lista abaixo — o que
// vale de verdade é a checagem do CONTEÚDO logo depois.
const TIPOS_ACEITOS = new Set(["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel", "text/comma-separated-values", ""]);

/** Checagens rápidas antes de ler: extensão, tipo e tamanho. */
export function validarArquivoAntesDeLer(arquivo: { name: string; size: number; type: string }) {
  const nome = arquivo.name.toLowerCase();
  if (!nome.endsWith(".csv")) {
    if (/\.(xlsm|xltm|xlsx|xls|xlsb)$/.test(nome)) {
      throw new ErroArquivo("Planilhas do Excel não são aceitas. No Excel, use Arquivo → Salvar como → CSV e envie o .csv.");
    }
    throw new ErroArquivo("Envie um arquivo .csv (texto separado por ponto e vírgula, vírgula ou tabulação).");
  }
  if (!TIPOS_ACEITOS.has(arquivo.type)) {
    throw new ErroArquivo("O tipo do arquivo não parece ser CSV. Exporte de novo como .csv e tente outra vez.");
  }
  if (arquivo.size === 0) throw new ErroArquivo("O arquivo está vazio.");
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    throw new ErroArquivo("O arquivo passa de 5 MB. Divida o extrato em períodos menores (por exemplo, um arquivo por mês) e importe em partes.");
  }
}

/** Confere os bytes (não é binário disfarçado) e decodifica o texto. */
export function decodificarArquivo(bytes: Uint8Array): ArquivoLido {
  for (const a of ASSINATURAS_BINARIAS) {
    if (a.bytes.every((b, i) => bytes[i] === b)) {
      throw new ErroArquivo(`Este arquivo é um ${a.nome}, não um CSV de texto. Por segurança, ele foi bloqueado.`);
    }
  }
  // Bytes de controle (fora tab/CR/LF) indicam binário.
  const amostra = bytes.subarray(0, Math.min(bytes.length, 64 * 1024));
  let controles = 0;
  for (let i = 0; i < amostra.length; i++) {
    const b = amostra[i];
    if (b === 0) throw new ErroArquivo("O arquivo contém dados binários e não é um CSV de texto. Por segurança, ele foi bloqueado.");
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) controles++;
  }
  if (controles > 8) throw new ErroArquivo("O arquivo contém caracteres de controle e não parece ser texto. Por segurança, ele foi bloqueado.");

  let texto: string;
  let codificacao: ArquivoLido["codificacao"] = "utf-8";
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Excel em pt-BR e vários bancos salvam em Windows-1252 (ISO-8859-1).
    texto = new TextDecoder("windows-1252").decode(bytes);
    codificacao = "windows-1252";
  }
  texto = texto.replace(/^\uFEFF/, "");

  if (/<\s*script\b|<\s*iframe\b|<\s*object\b|javascript\s*:|<\?php|<\s*html\b/i.test(texto)) {
    throw new ErroArquivo("O arquivo contém código (HTML/script) e não parece um extrato. Por segurança, ele foi bloqueado.");
  }
  return { texto, codificacao };
}

// ---------------------------------------------------------------------------
// 2) CSV → linhas/células (com aspas, delimitador detectado).
// ---------------------------------------------------------------------------

export type Delimitador = ";" | "," | "\t";

function contarForaDeAspas(linha: string, d: string): number {
  let dentro = false;
  let n = 0;
  for (const c of linha) {
    if (c === '"') dentro = !dentro;
    else if (c === d && !dentro) n++;
  }
  return n;
}

/** Olha as 5 primeiras linhas com conteúdo e escolhe o separador mais consistente. */
export function detectarDelimitador(texto: string): Delimitador {
  const linhas = texto.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "").slice(0, 5);
  let melhor: Delimitador = ";";
  let melhorNota = -1;
  for (const d of [";", ",", "\t"] as Delimitador[]) {
    const contagens = linhas.map((l) => contarForaDeAspas(l, d));
    const maximo = Math.max(0, ...contagens);
    if (maximo === 0) continue;
    // Linhas com a contagem mais frequente (consistência) pesam mais que o total.
    const frequencia = new Map<number, number>();
    contagens.forEach((c) => frequencia.set(c, (frequencia.get(c) ?? 0) + 1));
    let moda = 0;
    let vezes = 0;
    frequencia.forEach((v, k) => {
      if (k > 0 && (v > vezes || (v === vezes && k > moda))) {
        moda = k;
        vezes = v;
      }
    });
    const nota = vezes * 100 + moda;
    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = d;
    }
  }
  return melhor;
}

/** Parser CSV (RFC 4180): aspas, aspas dobradas e quebra de linha dentro de aspas. */
export function separarCsv(texto: string, d: Delimitador, limiteLinhas = Infinity): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentro = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentro) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else dentro = false;
      } else campo += c;
      continue;
    }
    if (c === '"' && campo.trim() === "") {
      campo = "";
      dentro = true;
    } else if (c === d) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      if (linha.some((x) => x.trim() !== "")) linhas.push(linha);
      linha = [];
      campo = "";
      if (linhas.length > limiteLinhas) break;
    } else campo += c;
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    if (linha.some((x) => x.trim() !== "")) linhas.push(linha);
  }
  return linhas.map((l) => l.map((x) => x.trim()));
}

// ---------------------------------------------------------------------------
// 3) Datas e valores.
// ---------------------------------------------------------------------------

function dataValida(ano: number, mes: number, dia: number): boolean {
  if (ano < 1970 || ano > 2099 || mes < 1 || mes > 12 || dia < 1) return false;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return dia <= ultimo;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** "05/10/2026", "05/10/26", "2026-10-05", "05-10-2026" (aceita hora depois) → "2026-10-05". */
export function interpretarData(bruto: string): string | null {
  const s = bruto.trim().split(/[ T]/)[0];
  let ano: number, mes: number, dia: number;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    ano = +m[1];
    mes = +m[2];
    dia = +m[3];
  } else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) {
    dia = +m[1];
    mes = +m[2];
    ano = +m[3];
  } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/))) {
    dia = +m[1];
    mes = +m[2];
    ano = 2000 + +m[3];
  } else return null;
  if (!dataValida(ano, mes, dia)) return null;
  return `${ano}-${p2(mes)}-${p2(dia)}`;
}

export interface ValorLido {
  /** Valor com sinal (negativo = saída). */
  valor: number;
  /** Veio marcado explicitamente como débito/crédito (D/C)? */
  marcado?: "receita" | "despesa";
}

/** "1.250,50", "-150,00", "(150,00)", "R$ 1,250.50", "150,00 D", "150.00-" → número. */
export function interpretarValor(bruto: string): ValorLido | null {
  let s = bruto.replace(/\u00a0/g, " ").trim();
  if (!s) return null;
  let negativo = false;
  let marcado: ValorLido["marcado"];
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  const sufixo = s.match(/\s*([DC])$/i);
  if (sufixo) {
    marcado = sufixo[1].toUpperCase() === "D" ? "despesa" : "receita";
    s = s.slice(0, sufixo.index).trim();
  }
  s = s.replace(/R\$/gi, "").replace(/\s+/g, "");
  if (s.endsWith("-")) {
    negativo = !negativo;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negativo = !negativo;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const ultimaVirgula = s.lastIndexOf(",");
  const ultimoPonto = s.lastIndexOf(".");
  let normal: string;
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    // O que vier por último é o decimal.
    normal = ultimaVirgula > ultimoPonto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (ultimaVirgula >= 0) {
    const casas = s.length - ultimaVirgula - 1;
    const varias = s.indexOf(",") !== ultimaVirgula;
    normal = !varias && casas !== 3 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (ultimoPonto >= 0) {
    const casas = s.length - ultimoPonto - 1;
    const varios = s.indexOf(".") !== ultimoPonto;
    normal = !varios && casas !== 3 ? s : s.replace(/\./g, "");
  } else normal = s;

  const n = Number(normal);
  if (!Number.isFinite(n)) return null;
  const valor = Math.round(n * 100) / 100;
  return { valor: negativo ? -valor : valor, marcado };
}

// ---------------------------------------------------------------------------
// 4) Cabeçalho e mapeamento automático de colunas.
// ---------------------------------------------------------------------------

function chave(t: string): string {
  return normalizarTexto(t).replace(/[^a-z0-9/ ]/g, "").trim();
}

const SINONIMOS: { campo: CampoCanonico; exatos: string[]; contem?: string[] }[] = [
  { campo: "ignorar", exatos: ["saldo", "saldo r", "saldo rs", "balance", "identificador", "id", "documento", "n documento", "agorigem", "ag/origem", "agencia", "conta"], contem: ["saldo"] },
  { campo: "vencimento", exatos: ["vencimento", "data de vencimento", "data vencimento"] },
  { campo: "data", exatos: ["data", "date", "dt", "data lancamento", "data do lancamento", "data movimento", "data mov", "data da transacao", "data transacao", "data de lancamento"], contem: ["data"] },
  { campo: "forma_pagamento", exatos: ["forma de pagamento", "forma pagamento", "meio de pagamento", "pagamento"] },
  { campo: "categoria", exatos: ["categoria", "category", "categorias"] },
  { campo: "tipo", exatos: ["tipo", "natureza", "d/c", "dc", "tipo lancamento", "tipo de lancamento", "tipo de transacao", "type"] },
  { campo: "credito", exatos: ["credito", "creditos", "entrada", "entradas", "valor credito", "credito r", "credito rs"] },
  { campo: "debito", exatos: ["debito", "debitos", "saida", "saidas", "valor debito", "debito r", "debito rs"] },
  { campo: "valor", exatos: ["valor", "valor r", "valor rs", "amount", "quantia", "montante", "valor lancamento", "valor do lancamento"], contem: ["valor"] },
  { campo: "descricao", exatos: ["descricao", "historico", "lancamento", "title", "titulo", "detalhes", "detalhe", "estabelecimento", "memo", "description", "descricao/historico", "complemento"], contem: ["descricao", "historico"] },
];

function campoPorCabecalho(texto: string): CampoCanonico | null {
  const k = chave(texto);
  if (!k) return null;
  for (const s of SINONIMOS) if (s.exatos.includes(k)) return s.campo;
  for (const s of SINONIMOS) if (s.contem?.some((c) => k.includes(c))) return s.campo;
  return null;
}

export interface Estrutura {
  delimitador: Delimitador;
  /** Índice (nas linhas parseadas) da linha de cabeçalho; -1 = sem cabeçalho. */
  linhaCabecalho: number;
  cabecalhos: string[];
  /** Linhas de dados (depois do cabeçalho). */
  linhas: string[][];
  /** Número da linha no arquivo original de cada linha de dados (1 = primeira). */
  numeroOriginal: number[];
  mapeamento: CampoCanonico[];
  formatoNativo: boolean;
  /** Fatura de cartão no padrão Nubank (valor positivo = gasto). */
  sugereInverterSinal: boolean;
}

const CABECALHO_NATIVO = ["data", "tipo", "categoria", "descricao", "forma de pagamento", "valor r"];

/** Lê o texto, acha o cabeçalho (pulando "linhas de enfeite" do banco) e sugere o mapeamento. */
export function analisarEstrutura(texto: string): Estrutura {
  const delimitador = detectarDelimitador(texto);
  // Conta linhas antes de interpretar tudo: acima do teto, para aqui.
  const totalLinhas = texto.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "").length;
  if (totalLinhas > MAXIMO_LINHAS + 25) {
    throw new ErroArquivo(
      `O arquivo tem ${totalLinhas.toLocaleString("pt-BR")} linhas — o limite é ${MAXIMO_LINHAS.toLocaleString("pt-BR")} por importação. Divida em períodos menores (um arquivo por mês, por exemplo).`
    );
  }
  const todas = separarCsv(texto, delimitador);
  if (todas.length === 0) throw new ErroArquivo("Não encontrei nenhuma linha com dados no arquivo.");

  // Cabeçalho = linha (entre as 25 primeiras) que mais casa com nomes conhecidos.
  let linhaCabecalho = -1;
  let melhor = 0;
  for (let i = 0; i < Math.min(25, todas.length); i++) {
    const campos = todas[i].map(campoPorCabecalho).filter((c): c is CampoCanonico => !!c && c !== "ignorar");
    const nota = new Set(campos).size;
    const temDataEValor = campos.includes("data") && (campos.includes("valor") || campos.includes("credito") || campos.includes("debito"));
    if (temDataEValor && nota > melhor) {
      melhor = nota;
      linhaCabecalho = i;
    }
  }

  let cabecalhos: string[];
  let corpo: string[][];
  let inicio: number;
  if (linhaCabecalho >= 0) {
    cabecalhos = todas[linhaCabecalho];
    inicio = linhaCabecalho + 1;
  } else {
    // Sem cabeçalho reconhecível: começa na primeira linha que tem data.
    inicio = todas.findIndex((l) => l.some((c) => interpretarData(c)));
    if (inicio < 0) {
      throw new ErroArquivo("ESTRUTURA");
    }
    const largura = Math.max(...todas.slice(inicio, inicio + 20).map((l) => l.length));
    cabecalhos = Array.from({ length: largura }, (_, i) => `Coluna ${i + 1}`);
  }
  corpo = todas.slice(inicio);
  if (corpo.length > MAXIMO_LINHAS) {
    throw new ErroArquivo(
      `O arquivo tem ${corpo.length.toLocaleString("pt-BR")} lançamentos — o limite é ${MAXIMO_LINHAS.toLocaleString("pt-BR")} por importação. Divida em períodos menores.`
    );
  }
  // Rodapés comuns ("Saldo final", "Total") ficam de fora naturalmente na validação.
  const largura = Math.max(cabecalhos.length, ...corpo.slice(0, 50).map((l) => l.length));
  while (cabecalhos.length < largura) cabecalhos.push(`Coluna ${cabecalhos.length + 1}`);

  const mapeamento = linhaCabecalho >= 0 ? mapearPorCabecalho(cabecalhos) : mapearPorConteudo(corpo, largura);
  // Um campo canônico só pode aparecer uma vez (fora "ignorar" e
  // "descricao": várias colunas de texto, como Histórico + Descrição do
  // Inter, são juntadas numa descrição só).
  const vistos = new Set<CampoCanonico>();
  for (let i = 0; i < mapeamento.length; i++) {
    const c = mapeamento[i];
    if (c === "ignorar" || c === "descricao") continue;
    if (vistos.has(c)) mapeamento[i] = "ignorar";
    else vistos.add(c);
  }
  if (!mapeamento.includes("data") || !(mapeamento.includes("valor") || mapeamento.includes("credito") || mapeamento.includes("debito"))) {
    // Completa pelo conteúdo o que o cabeçalho não resolveu.
    const porConteudo = mapearPorConteudo(corpo, largura);
    for (const campo of ["data", "valor", "descricao"] as CampoCanonico[]) {
      if (!mapeamento.includes(campo)) {
        const i = porConteudo.indexOf(campo);
        if (i >= 0 && mapeamento[i] === "ignorar") mapeamento[i] = campo;
      }
    }
  }

  const chaves = cabecalhos.map(chave);
  const formatoNativo = CABECALHO_NATIVO.every((c, i) => chaves[i] === c);
  // Nubank (fatura do cartão): "date,title,amount" — gasto vem POSITIVO.
  const sugereInverterSinal = chaves.length === 3 && chaves[0] === "date" && chaves[1] === "title" && chaves[2] === "amount";

  return {
    delimitador,
    linhaCabecalho,
    cabecalhos,
    linhas: corpo,
    numeroOriginal: corpo.map((_, i) => inicio + i + 1),
    mapeamento,
    formatoNativo,
    sugereInverterSinal,
  };
}

function mapearPorCabecalho(cabecalhos: string[]): CampoCanonico[] {
  return cabecalhos.map((h) => campoPorCabecalho(h) ?? "ignorar");
}

function mapearPorConteudo(corpo: string[][], largura: number): CampoCanonico[] {
  const amostra = corpo.slice(0, 30);
  const mapa: CampoCanonico[] = Array(largura).fill("ignorar");
  const fracao = (i: number, teste: (s: string) => boolean) => {
    const cel = amostra.map((l) => l[i] ?? "").filter((s) => s !== "");
    return cel.length ? cel.filter(teste).length / cel.length : 0;
  };
  const colData = Array.from({ length: largura }, (_, i) => i).find((i) => fracao(i, (s) => !!interpretarData(s)) > 0.8);
  if (colData != null) mapa[colData] = "data";
  const numericas = Array.from({ length: largura }, (_, i) => i).filter((i) => i !== colData && fracao(i, (s) => !!interpretarValor(s)) > 0.8);
  // A primeira coluna numérica costuma ser o valor; a última, o saldo.
  if (numericas.length > 0) mapa[numericas[0]] = "valor";
  let melhorTexto = -1;
  let maiorMedia = 0;
  for (let i = 0; i < largura; i++) {
    if (mapa[i] !== "ignorar" || numericas.includes(i)) continue;
    const media = amostra.reduce((a, l) => a + (l[i]?.length ?? 0), 0) / Math.max(amostra.length, 1);
    if (media > maiorMedia) {
      maiorMedia = media;
      melhorTexto = i;
    }
  }
  if (melhorTexto >= 0) mapa[melhorTexto] = "descricao";
  return mapa;
}

// ---------------------------------------------------------------------------
// 5) Linhas → lançamentos validados.
// ---------------------------------------------------------------------------

/** Anula "fórmulas" (=, +, -, @, tab, CR no início) antepondo uma aspa simples. */
export function neutralizarFormula(texto: string): string {
  return /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
}

/** Tira caracteres de controle e espaços repetidos de um texto vindo do arquivo. */
export function limparTexto(texto: string, max: number): string {
  const limpo = texto
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return neutralizarFormula(limpo).slice(0, max);
}

function tipoPorTexto(texto: string): "receita" | "despesa" | null {
  const k = chave(texto);
  if (!k) return null;
  if (["receita", "credito", "c", "entrada", "recebimento", "deposito", "income", "credit"].includes(k)) return "receita";
  if (["despesa", "debito", "d", "saida", "pagamento", "gasto", "expense", "debit"].includes(k)) return "despesa";
  return null;
}

export function formaPorTexto(texto: string): FormaPagamento | null {
  const k = chave(texto);
  if (!k) return null;
  if (k.includes("pix")) return "pix";
  if (k.includes("debito")) return "debito";
  if (k.includes("credito")) return "credito";
  if (k.includes("dinheiro") || k.includes("especie")) return "dinheiro";
  if (k.includes("boleto")) return "boleto";
  return null;
}

export interface LancamentoLido {
  /** Número da linha no arquivo original. */
  linha: number;
  data: string;
  tipo: "receita" | "despesa";
  valor: number;
  descricao: string;
  categoriaTexto: string | null;
  formaPagamento: FormaPagamento | null;
  vencimento: string | null;
}

export interface LinhaRejeitada {
  linha: number;
  motivo: string;
  conteudo: string;
}

export interface ResultadoInterpretacao {
  validos: LancamentoLido[];
  rejeitados: LinhaRejeitada[];
  totalReceitas: number;
  totalDespesas: number;
}

export function interpretarLinhas(
  estrutura: Pick<Estrutura, "linhas" | "numeroOriginal" | "delimitador">,
  mapeamento: CampoCanonico[],
  opcoes: { inverterSinal?: boolean } = {}
): ResultadoInterpretacao {
  const idx = (c: CampoCanonico) => mapeamento.indexOf(c);
  const iData = idx("data");
  const iValor = idx("valor");
  const iCred = idx("credito");
  const iDeb = idx("debito");
  const iTipo = idx("tipo");
  const iDescs = mapeamento.map((c, i) => (c === "descricao" ? i : -1)).filter((i) => i >= 0);
  const iCat = idx("categoria");
  const iForma = idx("forma_pagamento");
  const iVenc = idx("vencimento");

  const validos: LancamentoLido[] = [];
  const rejeitados: LinhaRejeitada[] = [];
  let totalReceitas = 0;
  let totalDespesas = 0;

  estrutura.linhas.forEach((cel, n) => {
    const linha = estrutura.numeroOriginal[n] ?? n + 1;
    const conteudo = cel.join(estrutura.delimitador).slice(0, 300);
    const rejeitar = (motivo: string) => rejeitados.push({ linha, motivo, conteudo });

    if (iData < 0) return rejeitar("Nenhuma coluna marcada como Data");
    const data = interpretarData(cel[iData] ?? "");
    if (!data) return rejeitar((cel[iData] ?? "").trim() ? "Data inválida" : "Data vazia");

    let valorAssinado: number | null = null;
    let marcado: ValorLido["marcado"];
    if (iValor >= 0 && (cel[iValor] ?? "").trim() !== "") {
      const v = interpretarValor(cel[iValor]);
      if (!v) return rejeitar("Valor inválido");
      valorAssinado = v.valor;
      marcado = v.marcado;
    } else if (iCred >= 0 || iDeb >= 0) {
      const c = iCred >= 0 && (cel[iCred] ?? "").trim() ? interpretarValor(cel[iCred]) : null;
      const d = iDeb >= 0 && (cel[iDeb] ?? "").trim() ? interpretarValor(cel[iDeb]) : null;
      if ((iCred >= 0 && (cel[iCred] ?? "").trim() && !c) || (iDeb >= 0 && (cel[iDeb] ?? "").trim() && !d)) return rejeitar("Valor inválido");
      if (!c && !d) return rejeitar("Valor vazio");
      const credito = Math.abs(c?.valor ?? 0);
      const debito = Math.abs(d?.valor ?? 0);
      if (credito && debito) return rejeitar("Linha com débito e crédito ao mesmo tempo");
      valorAssinado = credito ? credito : -debito;
    } else if (iValor < 0 && iCred < 0 && iDeb < 0) {
      return rejeitar("Nenhuma coluna marcada como Valor");
    }
    if (valorAssinado == null) return rejeitar("Valor vazio");
    if (valorAssinado === 0) return rejeitar("Valor zerado");
    if (opcoes.inverterSinal) valorAssinado = -valorAssinado;

    // Tipo: coluna explícita > marcação D/C > sinal do valor.
    let tipo: "receita" | "despesa" = valorAssinado < 0 ? "despesa" : "receita";
    if (marcado) tipo = marcado;
    if (iTipo >= 0 && (cel[iTipo] ?? "").trim()) {
      const t = tipoPorTexto(cel[iTipo]);
      if (!t) return rejeitar("Tipo não reconhecido (use Receita ou Despesa)");
      tipo = t;
    }
    const valor = Math.abs(valorAssinado);

    const descricaoBruta = iDescs
      .map((i) => (cel[i] ?? "").trim())
      .filter((t, k, todos) => t && todos.indexOf(t) === k)
      .join(" — ");
    const descricao = limparTexto(descricaoBruta, MAX_DESCRICAO) || "Lançamento importado";
    const categoriaTexto = iCat >= 0 ? limparTexto(cel[iCat] ?? "", MAX_CATEGORIA) || null : null;
    const formaPagamento = iForma >= 0 ? formaPorTexto(cel[iForma] ?? "") : null;
    let vencimento: string | null = null;
    if (iVenc >= 0 && (cel[iVenc] ?? "").trim()) {
      vencimento = interpretarData(cel[iVenc]);
      if (!vencimento) return rejeitar("Data de vencimento inválida");
    }

    validos.push({ linha, data, tipo, valor, descricao, categoriaTexto, formaPagamento, vencimento });
    if (tipo === "receita") totalReceitas += valor;
    else totalDespesas += valor;
  });

  return {
    validos,
    rejeitados,
    totalReceitas: Math.round(totalReceitas * 100) / 100,
    totalDespesas: Math.round(totalDespesas * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// 6) Duplicidade (mesma regra pra arquivo × banco).
// ---------------------------------------------------------------------------

function soLetrasENumeros(t: string): string {
  return normalizarTexto(t).replace(/[^a-z0-9]/g, "");
}

/** Mesma descrição? Levenshtein normalizado > 80% ou uma contém a outra (sem pontuação/espaços). */
export function descricoesParecidas(a: string, b: string): boolean {
  const x = soLetrasENumeros(a.replace(/^'/, ""));
  const y = soLetrasENumeros(b.replace(/^'/, ""));
  if (!x && !y) return true;
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const maior = Math.max(x.length, y.length);
  // Levenshtein limitado (textos longos): compara até 120 caracteres.
  const a2 = x.slice(0, 120);
  const b2 = y.slice(0, 120);
  let anterior = Array.from({ length: b2.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a2.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b2.length; j++) {
      atual[j] = Math.min(atual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + (a2[i - 1] === b2[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return 1 - anterior[b2.length] / Math.min(maior, 120) > 0.8;
}

export interface TransacaoExistente {
  data: string;
  tipo: "receita" | "despesa";
  valor: number;
  descricao: string | null;
}

/** Índices (em `lidos`) que já existem no banco pela regra de duplicidade. */
export function marcarDuplicadas(lidos: LancamentoLido[], existentes: TransacaoExistente[]): Set<number> {
  const porChave = new Map<string, TransacaoExistente[]>();
  for (const e of existentes) {
    const k = `${e.data}|${e.tipo}|${Math.round(Number(e.valor) * 100)}`;
    const lista = porChave.get(k) ?? [];
    lista.push(e);
    porChave.set(k, lista);
  }
  const duplicadas = new Set<number>();
  lidos.forEach((l, i) => {
    const candidatos = porChave.get(`${l.data}|${l.tipo}|${Math.round(l.valor * 100)}`);
    if (candidatos?.some((c) => descricoesParecidas(c.descricao ?? "", l.descricao))) duplicadas.add(i);
  });
  return duplicadas;
}

// ---------------------------------------------------------------------------
// 7) CSVs gerados (modelo e relatório de falhas).
// ---------------------------------------------------------------------------

function campoCsv(campo: string): string {
  const seguro = neutralizarFormula(campo);
  return /[;"\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function gerarCsv(linhas: string[][]): string {
  return "\uFEFF" + linhas.map((l) => l.map(campoCsv).join(";")).join("\r\n");
}

export const MODELO_CSV: string[][] = [
  ["Data", "Tipo", "Categoria", "Descrição", "Forma de pagamento", "Valor (R$)"],
  ["01/10/2026", "Receita", "Salário", "Salário de outubro", "Pix", "3.500,00"],
  ["02/10/2026", "Despesa", "Mercado", "Compras do mês", "Débito", "450,90"],
  ["03/10/2026", "Despesa", "Transporte", "Combustível", "Crédito", "150,00"],
];
