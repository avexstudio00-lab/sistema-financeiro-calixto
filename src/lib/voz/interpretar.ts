/**
 * Leitor de frases do comando de voz (23/nov/2026). Sem IA, de propósito
 * (decisão do usuário: de graça). Entende frases curtas e diretas:
 *
 *   "gastei 35 no mercado"
 *   "paguei 120 de luz ontem"
 *   "recebi 200 do João"
 *   "vendi 2 corrente grumet 2mm por 80 pra Rosa"
 *   "gastei 50 na empresa com embalagem"
 *
 * Funciona igual no navegador (microfone do app) e no servidor (Siri).
 * Nunca grava nada: só devolve o que entendeu, e a tela mostra pra pessoa
 * conferir antes de salvar. Quando recebe o catálogo (categorias, carteiras,
 * produtos, clientes), já tenta achar cada um pelo nome.
 */

export type TipoAnotacao = "gasto" | "receita" | "venda";

export interface CatalogoVoz {
  categorias?: { id: string; nome: string; tipo: "receita" | "despesa" }[];
  contas?: { id: string; nome: string }[];
  produtos?: { id: string; nome: string; preco_venda?: number | null; ativo?: boolean }[];
  clientes?: { id: string; nome: string }[];
}

export interface Interpretacao {
  tipo: TipoAnotacao;
  /** Venda e "na empresa" vão pro lado da empresa. */
  mundo: "pessoal" | "negocio";
  /** Total em reais (na venda, o total da venda). */
  valor: number | null;
  /** Venda: "por 40 cada" → valor por unidade. */
  valorUnitario: number | null;
  quantidade: number;
  descricao: string;
  data: string;
  categoriaId: string | null;
  contaId: string | null;
  produtoId: string | null;
  /** Nome do produto como foi falado (quando não achou no cadastro). */
  produtoFalado: string | null;
  clienteId: string | null;
  clienteFalado: string | null;
  /** O que não deu pra entender ("valor", "produto"...). */
  faltando: string[];
}

/** Minúsculas e sem acento — pra comparar nomes. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600,
  setecentos: 700, oitocentos: 800, novecentos: 900, mil: 1000,
};

/** "trinta e cinco" → "35", "dois mil e quinhentos" → "2500" (o ditado do
 * celular quase sempre já escreve em número, isso é só reforço). */
function numerosPorExtenso(entrada: string): string {
  let t = entrada;
  // "um"/"uma" sozinhos quase sempre são artigo ("um lanche") — só viram
  // número em "um mil".
  t = t.replace(/\b(um|uma) mil\b/g, "1000");
  return t.replace(/\b(?:(?:dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil)(?:\s+e\s+|\s+|\b))+/g, (trecho) => {
    const palavras = trecho.trim().split(/\s+/).filter((p) => p !== "e");
    let total = 0;
    let atual = 0;
    for (const p of palavras) {
      const n = NUMEROS[p];
      if (n == null) continue;
      if (n === 1000) {
        total += (atual || 1) * 1000;
        atual = 0;
      } else {
        atual += n;
      }
    }
    const valor = total + atual;
    return valor > 0 ? `${valor} ` : trecho;
  });
}

/** "1.200,50" / "1200.50" / "35,5" → número. */
function lerNumero(bruto: string): number | null {
  let s = bruto.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const RE_DINHEIRO = /(?:r\$\s*)?(\d[\d.,]*)(?:\s*(?:reais|real|conto|contos|pila))?(?:\s+e\s+(\d{1,2})\s*centavos?)?/;

/** Primeiro valor em dinheiro da frase (prioriza o que tem R$/reais). */
function acharValor(t: string): { valor: number; inicio: number; fim: number } | null {
  const comMarca = /(?:r\$\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(?:reais|real|conto|contos|pila))(?:\s+e\s+(\d{1,2})\s*centavos?)?/.exec(t);
  const m = comMarca ?? RE_DINHEIRO.exec(t);
  if (!m) return null;
  const bruto = comMarca ? m[1] ?? m[2] : m[1];
  let valor = lerNumero(bruto);
  if (valor == null) return null;
  const centavos = comMarca ? m[3] : m[2];
  if (centavos) valor += Number(centavos) / 100;
  return { valor: Number(valor.toFixed(2)), inicio: m.index, fim: m.index + m[0].length };
}

function hojeLocal(deslocamentoDias = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Palavras que o ditado põe mas não são nome de nada. */
const VAZIAS = new Set(["de", "da", "do", "das", "dos", "no", "na", "nos", "nas", "em", "com", "o", "a", "os", "as", "um", "uma", "pra", "para", "pro", "por", "e", "que", "hoje", "ontem", "anteontem", "reais", "real", "r$", "meu", "minha", "controle"]);

function palavrasUteis(t: string): string[] {
  return normalizar(t)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 0 && !VAZIAS.has(p));
}

/** Nota de 0 a 1: quanto do nome cadastrado aparece no trecho falado. */
function parecido(trecho: string, nome: string): number {
  const falado = new Set(palavrasUteis(trecho));
  const doNome = palavrasUteis(nome);
  if (doNome.length === 0 || falado.size === 0) return 0;
  let acertos = 0;
  for (const p of doNome) {
    // "groumet" x "grumet": aceita quando começa igual (4 letras) — o ditado erra a grafia.
    if (falado.has(p) || [...falado].some((f) => f.length >= 4 && p.length >= 4 && (f.startsWith(p.slice(0, 4)) || p.startsWith(f.slice(0, 4))))) acertos++;
  }
  return acertos / doNome.length;
}

function melhor<T extends { nome: string }>(trecho: string, lista: T[] | undefined, minimo = 0.5): T | null {
  if (!lista?.length || !trecho.trim()) return null;
  let escolhido: T | null = null;
  let nota = 0;
  for (const item of lista) {
    const n = parecido(trecho, item.nome);
    // Empate: nome mais longo é mais específico ("corrente grumet 2mm" > "corrente").
    if (n > nota || (n === nota && n > 0 && escolhido && item.nome.length > escolhido.nome.length)) {
      nota = n;
      escolhido = item;
    }
  }
  return nota >= minimo ? escolhido : null;
}

/** Categoria por palavra-chave, quando o nome da categoria não foi dito. */
const PALAVRAS_CATEGORIA: [RegExp, string[]][] = [
  [/\b(mercado|supermercado|feira|atacadao|acougue|hortifruti)\b/, ["mercado", "alimentacao"]],
  [/\b(lanche|almoco|janta|jantar|restaurante|padaria|ifood|pizza|hamburguer|cafe|marmita|comida)\b/, ["alimentacao", "mercado"]],
  [/\b(uber|99|gasolina|combustivel|onibus|metro|estacionamento|pedagio|posto|taxi|passagem)\b/, ["transporte"]],
  [/\b(farmacia|remedio|medico|consulta|exame|dentista|hospital)\b/, ["saude"]],
  [/\b(aluguel|condominio|luz|energia|agua|internet|gas)\b/, ["moradia"]],
  [/\b(cinema|bar|show|festa|viagem|netflix|spotify|streaming|jogo)\b/, ["lazer"]],
  [/\b(imposto|das|taxa)\b/, ["impostos"]],
  [/\b(salario|pagamento)\b/, ["salario"]],
];

function acharCategoria(t: string, tipo: "receita" | "despesa", catalogo: CatalogoVoz): string | null {
  const doTipo = (catalogo.categorias ?? []).filter((c) => c.tipo === tipo);
  const direto = melhor(t, doTipo, 1);
  if (direto) return direto.id;
  for (const [re, nomes] of PALAVRAS_CATEGORIA) {
    if (!re.test(t)) continue;
    for (const nome of nomes) {
      const c = doTipo.find((x) => normalizar(x.nome).includes(nome));
      if (c) return c.id;
    }
  }
  return null;
}

/** A frase é comparada sem acento; aqui devolve as palavras com a grafia
 * original ("farmacia" → "farmácia", "joao" → "João"). */
function restaurarAcentos(trecho: string, original: string): string {
  const mapa = new Map<string, string>();
  for (const w of original.split(/[^\p{L}\p{N}]+/u)) if (w) mapa.set(normalizar(w), w);
  return trecho
    .split(" ")
    .map((w) => {
      const o = mapa.get(w);
      // Mantém maiúscula só em nome próprio (veio com maiúscula no original).
      return o ? (o[0] === o[0].toUpperCase() && o.length > 1 && /\p{Lu}/u.test(o[0]) ? o : o.toLowerCase()) : w;
    })
    .join(" ");
}

/** "no mercado" → "Mercado"; o que sobra da frase vira a descrição. */
function capitalizar(t: string): string {
  const limpo = t.replace(/\s+/g, " ").trim();
  return limpo ? limpo.charAt(0).toUpperCase() + limpo.slice(1) : "";
}

export function interpretarFrase(frase: string, catalogo: CatalogoVoz = {}): Interpretacao {
  const original = frase.trim();
  let t = numerosPorExtenso(normalizar(original).replace(/[!?;]/g, " "))
    // "1000 e 200" (de "mil e duzentos") → 1200
    .replace(/\b(\d+)000\s+e\s+(\d{1,3})\b/g, (_, mil: string, resto: string) => String(Number(mil) * 1000 + Number(resto)));
  // "anota pra mim", "meu controle" e afins não fazem parte do lançamento.
  t = t.replace(/\b(meu controle|anota(r)?( ai)?( pra mim| para mim)?|registra(r)?|lanca(r)?|coloca(r)?)\b/g, " ").replace(/\s+/g, " ").trim();

  const faltando: string[] = [];
  let data = hojeLocal();
  if (/\banteontem\b/.test(t)) data = hojeLocal(-2);
  else if (/\bontem\b/.test(t)) data = hojeLocal(-1);

  let tipo: TipoAnotacao = "gasto";
  if (/\b(vendi|venda|vendemos|vendeu)\b/.test(t)) tipo = "venda";
  else if (/\b(recebi|ganhei|entrou|entrada|recebimento|me pagou|me pagaram|caiu)\b/.test(t)) tipo = "receita";

  const negocio = tipo === "venda" || /\b(empresa|negocio|loja)\b/.test(t);
  const conta = melhor(t, catalogo.contas, 1);

  if (tipo === "venda") {
    // "vendi 2 corrente grumet 2mm por 80 pra rosa" / "vendi uma corrente a 40 cada"
    const depoisVerbo = t.replace(/^.*?\b(vendi|venda de|venda|vendemos|vendeu)\b\s*/, "");
    let quantidade = 1;
    let resto = depoisVerbo;
    const q = /^(\d{1,3})\s+(?!reais|real|r\$)/.exec(resto);
    if (q) {
      quantidade = Number(q[1]);
      resto = resto.slice(q[0].length);
    }
    // Cliente: "pra rosa", "para o joao", "pro kaique"
    let clienteFalado: string | null = null;
    const c = /\b(?:pra|para|pro|pra o|pra a|para o|para a|ao|a)\s+(?:o |a |dona |seu )?([a-z][a-z ]{1,40}?)(?=\s+(?:por|no|na|em|a|de|com|ontem|hoje|anteontem|pix|dinheiro|cartao|fiado|\d)|$)/.exec(resto);
    if (c && !/^\d/.test(c[1])) {
      clienteFalado = c[1].trim();
      resto = (resto.slice(0, c.index) + " " + resto.slice(c.index + c[0].length)).trim();
    }
    // Valor: "por 80" (total) ou "a 40 cada" / "40 cada" (unitário)
    let valor: number | null = null;
    let valorUnitario: number | null = null;
    const cada = /(?:a|por)?\s*(?:r\$\s*)?(\d[\d.,]*)\s*(?:reais\s*)?(?:cada|a unidade|cada um|cada uma)/.exec(resto);
    if (cada) {
      valorUnitario = lerNumero(cada[1]);
      resto = resto.replace(cada[0], " ");
    } else {
      const por = /\b(?:por|de)\s+(?:r\$\s*)?(\d[\d.,]*)(?:\s*(?:reais|real))?/.exec(resto) ?? /(?:r\$\s*)(\d[\d.,]*)|(\d[\d.,]*)\s*(?:reais|real)/.exec(resto);
      if (por) {
        valor = lerNumero(por[1] ?? por[2]);
        resto = resto.replace(por[0], " ");
      }
    }
    if (valorUnitario != null) valor = Number((valorUnitario * quantidade).toFixed(2));
    else if (valor != null) valorUnitario = Number((valor / quantidade).toFixed(2));

    const produtoFalado = resto.replace(/\b(no|na|em|com)\s+(pix|dinheiro|cartao|credito|debito)\b/g, " ").replace(/\b(hoje|ontem|anteontem)\b/g, " ").replace(/\s+/g, " ").trim();
    const ativos = (catalogo.produtos ?? []).filter((p) => p.ativo !== false);
    const produto = melhor(produtoFalado, ativos, 0.5);
    const cliente = clienteFalado ? melhor(clienteFalado, catalogo.clientes, 0.5) : null;
    // Sem valor falado: usa o preço do cadastro.
    if (valor == null && produto?.preco_venda) {
      valorUnitario = Number(produto.preco_venda);
      valor = Number((valorUnitario * quantidade).toFixed(2));
    }
    if (valor == null) faltando.push("valor");
    if (!produto) faltando.push("produto");

    return {
      tipo,
      mundo: "negocio",
      valor,
      valorUnitario,
      quantidade,
      descricao: capitalizar(produto?.nome ?? restaurarAcentos(produtoFalado, original)) || "Venda",
      data,
      categoriaId: null,
      contaId: conta?.id ?? null,
      produtoId: produto?.id ?? null,
      produtoFalado: produtoFalado || null,
      clienteId: cliente?.id ?? null,
      clienteFalado: cliente?.nome ?? (clienteFalado ? capitalizar(restaurarAcentos(clienteFalado, original)) : null),
      faltando,
    };
  }

  // Gasto / receita
  const achado = acharValor(t);
  if (!achado) faltando.push("valor");
  let resto = achado ? `${t.slice(0, achado.inicio)} ${t.slice(achado.fim)}` : t;
  resto = resto
    .replace(/\b(gastei|paguei|comprei|gasto|despesa|recebi|ganhei|entrou|entrada|recebimento|me pagou|me pagaram|caiu|foi|com|de|hoje|ontem|anteontem)\b/g, " ")
    .replace(/\b(na|da|pra|para|pela)\s+(empresa|loja|negocio)\b/g, " ")
    .replace(/\b(empresa|negocio)\b/g, " ");
  if (conta) {
    for (const p of palavrasUteis(conta.nome)) resto = resto.replace(new RegExp(`\\b(?:no|na|do|da)?\\s*${p}\\b`, "g"), " ");
  }
  let clienteFalado: string | null = null;
  if (tipo === "receita") {
    const de = /\b(?:do|da)\s+([a-z][a-z ]{1,40})$/.exec(normalizar(original).replace(/\b(hoje|ontem|anteontem)\b/g, "").trim());
    if (de) clienteFalado = capitalizar(de[1].trim());
  }
  const clienteReceita = clienteFalado ? melhor(clienteFalado, catalogo.clientes, 0.5) : null;
  const semPreposicao = resto.replace(/\s+/g, " ").trim().replace(/^(?:(?:no|na|nos|nas|em|o|a|de|do|da|um|uma)\s+)+/, "").replace(/\s+(no|na|em)$/, "");
  const descricao =
    tipo === "receita" && clienteFalado && (!semPreposicao || normalizar(semPreposicao) === normalizar(clienteFalado))
      ? `Recebido de ${clienteReceita?.nome ?? restaurarAcentos(normalizar(clienteFalado), original)}`
      : capitalizar(restaurarAcentos(semPreposicao, original)) || (tipo === "receita" ? "Recebimento" : "Gasto");
  const tipoCategoria = tipo === "receita" ? "receita" : "despesa";

  return {
    tipo,
    mundo: negocio ? "negocio" : "pessoal",
    valor: achado?.valor ?? null,
    valorUnitario: null,
    quantidade: 1,
    descricao: descricao.slice(0, 120),
    data,
    categoriaId: acharCategoria(t, tipoCategoria, catalogo),
    contaId: conta?.id ?? null,
    produtoId: null,
    produtoFalado: null,
    clienteId: clienteReceita?.id ?? null,
    clienteFalado: clienteReceita?.nome ?? (clienteFalado ? restaurarAcentos(normalizar(clienteFalado), original) : null),
    faltando,
  };
}

/** Frase curta do que foi entendido — a Siri fala isso de volta. */
export function resumoFalado(i: Interpretacao): string {
  const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const quando = i.data === hojeLocal() ? "" : i.data === hojeLocal(-1) ? " de ontem" : ` do dia ${i.data.slice(8, 10)}/${i.data.slice(5, 7)}`;
  if (i.tipo === "venda") {
    const item = `${i.quantidade > 1 ? `${i.quantidade} ` : ""}${i.descricao}`;
    return `Venda${quando}: ${item}${i.valor != null ? ` por ${reais(i.valor)}` : ""}${i.clienteFalado ? ` pra ${i.clienteFalado}` : ""}.`;
  }
  const lado = i.mundo === "negocio" ? " da empresa" : "";
  const rotulo = i.tipo === "receita" ? "Recebimento" : "Gasto";
  return `${rotulo}${lado}${quando}: ${i.valor != null ? reais(i.valor) : "valor não entendido"}${i.descricao ? `, ${i.descricao}` : ""}.`;
}
