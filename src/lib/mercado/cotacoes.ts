import type { SupabaseClient } from "@supabase/supabase-js";
import type { TituloTesouro } from "@/lib/data/tipos";

/**
 * Tempo que uma cotação em cache é considerada "fresca" antes de tentar
 * buscar de novo na fonte externa -- CDI/câmbio/Tesouro só mudam 1x por dia
 * útil, mas 6h dá uma margem confortável sem repetir o download à toa.
 * Mesmo padrão "preguiçoso" já usado no projeto (contas fixas, trial,
 * alerta de orçamento) -- nunca cron, só reconfere quando alguém de fato
 * carrega uma tela que precisa do dado.
 */
const PRAZO_CACHE_MS = 6 * 60 * 60 * 1000;

interface LinhaCotacao {
  chave: string;
  valor: number | null;
  dados_json: unknown;
  atualizado_em: string;
}

async function lerCache(admin: SupabaseClient, chave: string): Promise<LinhaCotacao | null> {
  const { data } = await admin.from("cotacoes_mercado").select("*").eq("chave", chave).maybeSingle();
  return (data as LinhaCotacao) ?? null;
}

async function gravarCache(admin: SupabaseClient, chave: string, valor: number | null, dadosJson: unknown) {
  await admin
    .from("cotacoes_mercado")
    .upsert({ chave, valor, dados_json: dadosJson, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
}

function cacheFresco(linha: LinhaCotacao | null): boolean {
  if (!linha) return false;
  return Date.now() - new Date(linha.atualizado_em).getTime() < PRAZO_CACHE_MS;
}

async function buscarComTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    // Sem User-Agent, algumas dessas APIs públicas (a AwesomeAPI de câmbio,
    // por trás de proteção anti-bot) rejeitam silenciosamente requisições
    // vindas de servidor -- funciona liso no navegador (tem UA de verdade),
    // mas falha sempre a partir da função serverless da Vercel. Um UA de
    // navegador comum contorna isso sem custo nenhum pras outras fontes
    // (Banco Central e Tesouro Transparente já funcionavam sem isso).
    return await fetch(url, {
      signal: controlador.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SistemaFinanceiroCalixto/1.0)" },
    });
  } finally {
    clearTimeout(timer);
  }
}

export interface ResultadoCdi {
  valor: number | null;
  atualizadoEm: string | null;
}

/**
 * Taxa CDI atual, já anualizada (base 252) -- fonte: Banco Central, série
 * SGS 4389 ("Taxa de juros - CDI anualizada base 252"), API pública, sem
 * chave, sem custo. Cacheada em `cotacoes_mercado` (chave "cdi"). Nunca
 * lança erro: se a busca externa falhar, cai pro último valor em cache
 * (mesmo desatualizado); sem nenhum cache ainda, devolve `valor: null` --
 * quem chama (calcularValorAtualEstimado) trata isso caindo pro cálculo
 * legado com a taxa digitada na criação do investimento.
 */
export async function obterCotacaoCdi(admin: SupabaseClient): Promise<ResultadoCdi> {
  const cache = await lerCache(admin, "cdi");
  if (cacheFresco(cache)) {
    return { valor: cache!.valor, atualizadoEm: cache!.atualizado_em };
  }
  try {
    const resposta = await buscarComTimeout(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json"
    );
    if (!resposta.ok) throw new Error(`Banco Central respondeu ${resposta.status}`);
    const json = (await resposta.json()) as { data: string; valor: string }[];
    const valor = Number(json[0]?.valor);
    if (!Number.isFinite(valor)) throw new Error("Valor de CDI inválido na resposta do Banco Central.");
    await gravarCache(admin, "cdi", valor, null);
    return { valor, atualizadoEm: new Date().toISOString() };
  } catch (erro) {
    console.error("Erro ao buscar CDI atual no Banco Central:", erro);
    return { valor: cache?.valor ?? null, atualizadoEm: cache?.atualizado_em ?? null };
  }
}

export interface ResultadoCambio {
  usd: number | null;
  eur: number | null;
  atualizadoEm: string | null;
}

/**
 * Câmbio USD/EUR -> BRL (PTAX) de hoje -- fonte: Banco Central, séries SGS
 * 1 (dólar) e 21619 (euro), mesma família de API já usada em
 * `obterCotacaoCdi` (pública, sem chave, sem custo). Trocado da AwesomeAPI
 * pro Banco Central em 22/set/2026: a AwesomeAPI vinha respondendo 429
 * (rate limit) quando chamada a partir da função serverless da Vercel,
 * mesmo funcionando liso direto do navegador -- provavelmente por vir de
 * um IP compartilhado de nuvem. O Banco Central, usado sem esse problema
 * pro CDI, é mais consistente com o resto do projeto. Mesmo padrão de
 * cache e mesma resiliência (nunca lança erro) que `obterCotacaoCdi`.
 */
export async function obterCotacaoCambio(admin: SupabaseClient): Promise<ResultadoCambio> {
  const cache = await lerCache(admin, "cambio");
  if (cacheFresco(cache)) {
    const dados = (cache!.dados_json as { usd: number; eur: number } | null) ?? null;
    return { usd: dados?.usd ?? null, eur: dados?.eur ?? null, atualizadoEm: cache!.atualizado_em };
  }
  try {
    const [respostaUsd, respostaEur] = await Promise.all([
      buscarComTimeout("https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/1?formato=json"),
      buscarComTimeout("https://api.bcb.gov.br/dados/serie/bcdata.sgs.21619/dados/ultimos/1?formato=json"),
    ]);
    if (!respostaUsd.ok) throw new Error(`Banco Central (dólar) respondeu ${respostaUsd.status}`);
    if (!respostaEur.ok) throw new Error(`Banco Central (euro) respondeu ${respostaEur.status}`);
    const [jsonUsd, jsonEur] = (await Promise.all([respostaUsd.json(), respostaEur.json()])) as {
      data: string;
      valor: string;
    }[][];
    const usd = Number(jsonUsd[0]?.valor);
    const eur = Number(jsonEur[0]?.valor);
    if (!Number.isFinite(usd) || !Number.isFinite(eur)) {
      throw new Error("Câmbio inválido na resposta do Banco Central.");
    }
    await gravarCache(admin, "cambio", null, { usd, eur });
    return { usd, eur, atualizadoEm: new Date().toISOString() };
  } catch (erro) {
    console.error("Erro ao buscar câmbio USD/EUR atual:", erro);
    const dados = (cache?.dados_json as { usd: number; eur: number } | null) ?? null;
    return { usd: dados?.usd ?? null, eur: dados?.eur ?? null, atualizadoEm: cache?.atualizado_em ?? null };
  }
}

function dataBrParaIso(dataBr: string): string {
  const [dia, mes, ano] = dataBr.split("/");
  return `${ano}-${mes}-${dia}`;
}

function numeroBr(texto: string): number {
  return Number((texto ?? "").trim().replace(",", "."));
}

export interface ResultadoTitulosTesouro {
  titulos: TituloTesouro[];
  atualizadoEm: string | null;
}

/**
 * Lista dos títulos do Tesouro Direto ainda em oferta, com preço/taxa de
 * venda mais recentes -- fonte: o CSV público e oficial do Tesouro
 * Transparente (`PrecoTaxaTesouroDireto.csv`), que traz o histórico
 * completo desde ~2002 pra todos os títulos (centenas de milhares de
 * linhas). Por isso a gente baixa, filtra só a linha mais recente de cada
 * (Tipo Titulo, Data Vencimento) e joga fora o resto ANTES de cachear --
 * só a lista compacta de hoje fica salva em `cotacoes_mercado` (chave
 * "tesouro_titulos"). Esse download é pesado o bastante (arquivo de
 * dezenas de MB) pra só valer a pena 1x por dia -- daí o cache importar de
 * verdade aqui, mais que no CDI/câmbio.
 */
export async function obterTitulosTesouro(admin: SupabaseClient): Promise<ResultadoTitulosTesouro> {
  const cache = await lerCache(admin, "tesouro_titulos");
  if (cacheFresco(cache)) {
    return { titulos: (cache!.dados_json as TituloTesouro[] | null) ?? [], atualizadoEm: cache!.atualizado_em };
  }
  try {
    const resposta = await buscarComTimeout(
      "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv",
      30000
    );
    if (!resposta.ok) throw new Error(`Tesouro Transparente respondeu ${resposta.status}`);
    const texto = await resposta.text();
    const linhas = texto.split("\n");
    const cabecalho = (linhas[0] ?? "").split(";").map((c) => c.trim());
    const idx = {
      tipo: cabecalho.indexOf("Tipo Titulo"),
      vencimento: cabecalho.indexOf("Data Vencimento"),
      base: cabecalho.indexOf("Data Base"),
      taxaVenda: cabecalho.indexOf("Taxa Venda Manha"),
      puVenda: cabecalho.indexOf("PU Venda Manha"),
    };
    if (Object.values(idx).some((i) => i === -1)) {
      throw new Error("Formato do CSV do Tesouro Transparente mudou (coluna esperada não encontrada).");
    }

    const maisRecentePorChave = new Map<string, TituloTesouro>();
    for (let i = 1; i < linhas.length; i++) {
      const linha = linhas[i]?.trim();
      if (!linha) continue;
      const campos = linha.split(";");
      const tipoTitulo = campos[idx.tipo]?.trim();
      const vencimentoBr = campos[idx.vencimento]?.trim();
      const baseBr = campos[idx.base]?.trim();
      if (!tipoTitulo || !vencimentoBr || !baseBr) continue;

      const vencimentoIso = dataBrParaIso(vencimentoBr);
      const baseIso = dataBrParaIso(baseBr);
      const chave = `${tipoTitulo}|${vencimentoIso}`;
      const existente = maisRecentePorChave.get(chave);
      if (existente && existente.dataBase >= baseIso) continue;

      const puVenda = numeroBr(campos[idx.puVenda]);
      if (!Number.isFinite(puVenda)) continue;
      const taxaVenda = numeroBr(campos[idx.taxaVenda]);

      maisRecentePorChave.set(chave, {
        chave,
        nomeExibicao: `${tipoTitulo} ${vencimentoIso.slice(0, 4)}`,
        tipoTitulo,
        dataVencimento: vencimentoIso,
        taxaVenda: Number.isFinite(taxaVenda) ? taxaVenda : 0,
        puVenda,
        dataBase: baseIso,
      });
    }

    // Só mantém títulos ainda não vencidos e cuja cotação mais recente seja
    // de fato recente (últimos 10 dias) -- descarta títulos já retirados de
    // oferta há tempo, que continuam aparecendo no histórico do arquivo.
    const hojeIso = new Date().toISOString().slice(0, 10);
    const dezDiasAtrasIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const titulos = Array.from(maisRecentePorChave.values())
      .filter((t) => t.dataVencimento > hojeIso && t.dataBase >= dezDiasAtrasIso)
      .sort((a, b) =>
        a.tipoTitulo === b.tipoTitulo
          ? a.dataVencimento.localeCompare(b.dataVencimento)
          : a.tipoTitulo.localeCompare(b.tipoTitulo)
      );

    if (titulos.length === 0) {
      throw new Error("Nenhum título válido encontrado no CSV do Tesouro Transparente.");
    }

    await gravarCache(admin, "tesouro_titulos", null, titulos);
    return { titulos, atualizadoEm: new Date().toISOString() };
  } catch (erro) {
    console.error("Erro ao buscar títulos do Tesouro Direto:", erro);
    return { titulos: (cache?.dados_json as TituloTesouro[] | null) ?? [], atualizadoEm: cache?.atualizado_em ?? null };
  }
}
