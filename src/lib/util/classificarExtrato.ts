import { normalizarTexto } from "./texto";
import type { FormaPagamento, LancamentoLido } from "./csvImportacao";

/**
 * Leitura "inteligente" do extrato (09/nov/2026). Puro, sem banco: olha a
 * descrição de cada lançamento e diz o que ele é (PIX, cartão, boleto,
 * pagamento de fatura, salário, tarifa, investimento...), sugere a forma de
 * pagamento, o nome da categoria padrão e acha "parcela 3/10" de compra
 * parcelada. A camada de dados (importar.ts) completa com o histórico do
 * próprio usuário e com as dívidas cadastradas.
 */

export type Natureza =
  | "pix"
  | "ted"
  | "boleto"
  | "debito"
  | "credito"
  | "pagamento_fatura"
  | "pagamento_recebido_cartao"
  | "salario"
  | "tarifa"
  | "rendimento"
  | "aplicacao"
  | "resgate"
  | "saque"
  | "estorno"
  | "outro";

export const ROTULO_NATUREZA: Record<Natureza, string> = {
  pix: "PIX",
  ted: "TED/DOC",
  boleto: "Boleto",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  pagamento_fatura: "Pagamento de fatura",
  pagamento_recebido_cartao: "Pagamento da fatura",
  salario: "Salário",
  tarifa: "Tarifa do banco",
  rendimento: "Rendimento",
  aplicacao: "Aplicação",
  resgate: "Resgate",
  saque: "Saque",
  estorno: "Estorno",
  outro: "Outro",
};

export interface Classificacao {
  natureza: Natureza;
  formaPagamento: FormaPagamento | null;
  /** Nome de uma categoria PADRÃO do app (ou null = decidir pelo histórico/"Outras"). */
  categoriaSugerida: string | null;
  parcela: { atual: number; total: number } | null;
  /** Descrição sem "parc 3/10", datas e números soltos — usada pra casar com histórico/dívidas. */
  chave: string;
}

const tem = (k: string, ...termos: string[]) => termos.some((t) => k.includes(t));

/** Regras de categoria por palavra-chave (só nomes de categorias padrão). */
const REGRAS_CATEGORIA: { categoria: string; tipo: "despesa" | "receita"; termos: string[] }[] = [
  { categoria: "Mercado", tipo: "despesa", termos: ["supermerc", "mercado", "mercadinho", "mercearia", "minimercado", "atacad", "assai", "carrefour", "pao de acucar", "extra hiper", "hortifruti", "sacolao", "atacarejo", "dia brasil", "big bompreco"] },
  { categoria: "Alimentação", tipo: "despesa", termos: ["ifood", "restaur", "lanchon", "padaria", "pizzar", "burger", "mcdonald", "bk ", "habibs", "subway", "rappi", "aiqfome", "acai", "cafeteria", "churrasc", "bar e ", "lanches"] },
  { categoria: "Transporte", tipo: "despesa", termos: ["uber", "99app", "99 pop", "99pop", "cabify", "posto", "combust", "shell", "ipiranga", "petrobras", " br mania", "estacion", "pedagio", "sem parar", "conectcar", "veloe", "metro", "bilhete unico", "sptrans", "recarga transp", "onibus", "auto pecas"] },
  { categoria: "Saúde", tipo: "despesa", termos: ["farmac", "drogar", "droga ", "raia", "pacheco", "pague menos", "panvel", "hospital", "clinica", "laborat", "odonto", "unimed", "amil", "hapvida", "sulamerica saude", "medic"] },
  { categoria: "Moradia", tipo: "despesa", termos: ["aluguel", "condomin", "enel", "light ", "cemig", "copel", "celesc", "sabesp", "copasa", "cedae", "sanepar", "comgas", "energia", "agua e esgoto", "iptu", "claro net", "vivo fibra", "vivo fixo", "internet"] },
  { categoria: "Lazer", tipo: "despesa", termos: ["netflix", "spotify", "disney", "hbo", "max.com", "prime video", "amazon prime", "deezer", "youtube premium", "globoplay", "cinema", "ingresso", "sympla", "steam", "playstation", "xbox", "nintendo", "parque"] },
  { categoria: "Impostos", tipo: "despesa", termos: ["das simples", "pgmei", "receita federal", "darf", "ipva", "licenciamento", "detran", "gps inss", "simples nacional"] },
  { categoria: "Salário", tipo: "receita", termos: ["salario", "pagto salario", "folha pag", "proventos", "remuneracao", "credito de salario", "pro labore", "pro-labore"] },
];

/** "PARC 03/10", "PARCELA 3 DE 10", "3/10" no fim (só em fatura de cartão). */
export function detectarParcela(descricao: string, ehCartao: boolean): { atual: number; total: number } | null {
  const k = normalizarTexto(descricao);
  const explicito = /parc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/.exec(k);
  const noFim = ehCartao ? /(?:^|\s)(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(k) : null;
  const m = explicito ?? noFim;
  if (!m) return null;
  const atual = Number(m[1]);
  const total = Number(m[2]);
  if (!(total >= 2 && total <= 72 && atual >= 1 && atual <= total)) return null;
  return { atual, total };
}

/** Descrição "limpa" pra comparar (sem parcela, datas, números e termos de banco). */
export function chaveDescricao(descricao: string): string {
  return normalizarTexto(descricao)
    .replace(/parc(?:ela)?\.?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}/g, " ")
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\b(pix|transf|transferencia|enviado|enviada|recebido|recebida|pagamento|pagto|pgto|pag|cred|deb|boleto|compra|cartao|debito|credito|elo|visa|master|mastercard|no estabelecimento|de|da|do|para|em|com|ltda|me|eireli|sa|s\/a)\b/g, " ")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 4)
    .join(" ");
}

export function classificarLancamento(l: LancamentoLido, ehCartao: boolean): Classificacao {
  const k = normalizarTexto(l.descricao);
  const parcela = detectarParcela(l.descricao, ehCartao);
  const chave = chaveDescricao(l.descricao);
  let natureza: Natureza = "outro";
  let forma: FormaPagamento | null = l.formaPagamento;
  let categoria: string | null = null;

  if (ehCartao) {
    if (l.tipo === "receita") {
      natureza = tem(k, "estorno", "devolucao", "cancelamento", "reembolso", "credito de")
        ? "estorno"
        : tem(k, "pagamento", "pgto", "pagto", "recebido")
          ? "pagamento_recebido_cartao"
          : "estorno";
    } else {
      natureza = tem(k, "iof", "anuidade", "juros", "encargo", "multa") ? "tarifa" : "credito";
    }
    forma = "credito";
  } else if (tem(k, "fatura", "pag cartao", "pagto cartao", "pgto cartao", "pagamento cartao", "cartao de credito", "nubank fatura", "pag fat")) {
    natureza = l.tipo === "despesa" ? "pagamento_fatura" : "estorno";
  } else if (tem(k, "rend pago", "rendimento", "rend.", "juros poup", "remuneracao basica", "dividendo", "jcp ")) {
    natureza = "rendimento";
    categoria = "Resgates e rendimentos";
  } else if (tem(k, "dinheiro retirado", "retirado do cofrinho", "retirada da caixinha", "resgate caixinha")) {
    // Mercado Pago/PicPay: tirou da "caixinha"/reserva de volta pra conta.
    natureza = "resgate";
    categoria = "Resgates e rendimentos";
  } else if (tem(k, "aplicacao", "aplic ", "aplic.", "invest", "cdb", "lci", "lca", "tesouro", "poupanca", "caixinha", "cofrinho", "porquinho", "guardar dinheiro", "reserva")) {
    natureza = l.tipo === "despesa" ? "aplicacao" : "resgate";
    categoria = l.tipo === "despesa" ? "Investimentos" : "Resgates e rendimentos";
  } else if (tem(k, "resgate")) {
    natureza = "resgate";
    categoria = "Resgates e rendimentos";
  } else if (tem(k, "tarifa", "tar ", "cesta", "pacote servic", "manutencao conta", "iof", "anuidade", "juros cheque", "encargo")) {
    natureza = "tarifa";
    categoria = "Outras despesas";
  } else if (tem(k, "saque", "saq ", "banco24", "atm")) {
    natureza = "saque";
    forma = "dinheiro";
  } else if (tem(k, "estorno", "devolucao", "devolvido", "reembolso", "cashback")) {
    natureza = "estorno";
  } else if (tem(k, "pix")) {
    natureza = "pix";
    forma = "pix";
  } else if (tem(k, "boleto", "pag titulo", "pagamento de titulo", "pagto titulo", "cobranca", "convenio", "pag conta", "pagamento de conta")) {
    natureza = "boleto";
    forma = "boleto";
  } else if (tem(k, "ted", " doc ", "transf", "transferencia")) {
    natureza = "ted";
  } else if (tem(k, "compra", "debito", "cartao", "visa electron", "maestro", "elo debito")) {
    natureza = "debito";
    forma = "debito";
  }

  if (!categoria) {
    for (const r of REGRAS_CATEGORIA) {
      if (r.tipo === l.tipo && tem(k, ...r.termos)) {
        categoria = r.categoria;
        break;
      }
    }
  }
  if (categoria === "Salário" && (natureza === "outro" || natureza === "ted" || natureza === "pix")) natureza = "salario";

  return { natureza, formaPagamento: forma, categoriaSugerida: categoria, parcela, chave };
}

/** Natureza que, por padrão, NÃO deve entrar (evita contar duas vezes). */
export function desmarcadoPorPadrao(n: Natureza): boolean {
  return n === "pagamento_recebido_cartao";
}
