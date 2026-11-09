import { supabase } from "@/lib/supabase/client";
import { campoEmpresa } from "@/lib/empresa/empresaAtiva";
import { ajustarSaldoConta } from "./transacoes";
import { criarCategoriaPersonalizada, listarCategorias } from "./categorias";
import { normalizarTexto } from "@/lib/util/texto";
import type { Categoria } from "./tipos";
import type { LancamentoLido, TransacaoExistente } from "@/lib/util/csvImportacao";

/**
 * Camada de dados da importação de CSV (especificação de 05/out/2026).
 * Tudo roda com a sessão do próprio usuário (cliente anon + JWT), então o
 * RLS do Supabase continua sendo a barreira final: cada linha vai com o
 * `usuario_id` de quem está logado (ou da conta mestre, no "Negócio") e o
 * banco recusa qualquer coisa de outra pessoa.
 */

const TAMANHO_LOTE = 400;

/** Lançamentos já gravados naquela carteira, no período do arquivo (pra checar duplicidade). */
export async function buscarExistentesParaDuplicidade(
  usuarioId: string,
  contaId: string,
  inicio: string,
  fim: string
): Promise<TransacaoExistente[]> {
  const todas: TransacaoExistente[] = [];
  const pagina = 1000;
  for (let de = 0; de < 50000; de += pagina) {
    const { data, error } = await supabase
      .from("transacoes")
      .select("data, tipo, valor, descricao")
      .eq("usuario_id", usuarioId)
      .eq("conta_id", contaId)
      .gte("data", inicio)
      .lte("data", fim)
      .order("data", { ascending: true })
      .range(de, de + pagina - 1);
    if (error || !data) break;
    todas.push(...(data as TransacaoExistente[]));
    if (data.length < pagina) break;
  }
  return todas;
}

const chaveCategoria = (nome: string) => normalizarTexto(nome).replace(/[^a-z0-9 ]/g, "").trim();
const NOMES_OUTROS = new Set(["outros", "outro", "outras", "outras despesas", "outras receitas", "sem categoria", "diversos"]);

/**
 * Casa o texto da categoria do arquivo com as categorias existentes (sem
 * acento e sem caixa, respeitando o tipo). Não achou: cria (se a pessoa
 * marcou a opção) ou cai em "Outras despesas"/"Outras receitas".
 */
export async function resolverCategorias(
  usuarioId: string,
  itens: LancamentoLido[],
  criarNovas: boolean
): Promise<Map<number, string | null>> {
  const categorias: Categoria[] = await listarCategorias(usuarioId);
  const indice = new Map<string, string>();
  // As do próprio usuário têm prioridade sobre as padrão de mesmo nome.
  for (const c of [...categorias].sort((a, b) => Number(!!b.usuario_id) - Number(!!a.usuario_id))) {
    const k = `${c.tipo}|${chaveCategoria(c.nome)}`;
    if (!indice.has(k)) indice.set(k, c.id);
  }
  const outras = {
    receita: indice.get("receita|outras receitas") ?? null,
    despesa: indice.get("despesa|outras despesas") ?? null,
  };

  const resultado = new Map<number, string | null>();
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const nome = item.categoriaTexto?.replace(/^'/, "").trim() ?? "";
    const k = chaveCategoria(nome);
    if (!k || NOMES_OUTROS.has(k)) {
      resultado.set(i, outras[item.tipo]);
      continue;
    }
    const chave = `${item.tipo}|${k}`;
    let id = indice.get(chave) ?? null;
    if (!id && criarNovas) {
      const { data } = await criarCategoriaPersonalizada(usuarioId, nome.slice(0, 100), item.tipo);
      id = (data as { id: string } | null)?.id ?? null;
      if (id) indice.set(chave, id);
    }
    resultado.set(i, id ?? outras[item.tipo]);
  }
  return resultado;
}

export interface FalhaImportacao {
  linha: number;
  motivo: string;
}

/**
 * Grava os lançamentos em lotes (insert em massa) e, a cada lote gravado,
 * ajusta o saldo da carteira pelo líquido daquele lote — o mesmo
 * `ajustarSaldoConta` que o `criarTransacao` usa pra cada lançamento
 * (receita soma, despesa subtrai), só que uma vez por lote em vez de uma
 * vez por linha. Lote que falhar não ajusta saldo e volta como falha.
 */
export async function importarLancamentos(params: {
  usuarioId: string;
  contaId: string;
  tipoNegocio: "pessoal" | "negocio";
  itens: LancamentoLido[];
  categorias: Map<number, string | null>;
}): Promise<{ inseridos: number; falhas: FalhaImportacao[] }> {
  const empresa = params.tipoNegocio === "negocio" ? campoEmpresa() : {};
  let inseridos = 0;
  const falhas: FalhaImportacao[] = [];

  for (let ini = 0; ini < params.itens.length; ini += TAMANHO_LOTE) {
    const lote = params.itens.slice(ini, ini + TAMANHO_LOTE);
    const linhas = lote.map((item, k) => ({
      usuario_id: params.usuarioId,
      conta_id: params.contaId,
      categoria_id: params.categorias.get(ini + k) ?? null,
      tipo: item.tipo,
      valor: item.valor,
      descricao: item.descricao,
      data: item.data,
      data_vencimento: item.vencimento,
      forma_pagamento: item.formaPagamento,
      tipo_negocio: params.tipoNegocio,
      ...empresa,
    }));
    const { error } = await supabase.from("transacoes").insert(linhas);
    if (error) {
      console.error("Erro ao importar lote:", error.message);
      lote.forEach((item) => falhas.push({ linha: item.linha, motivo: "Não foi possível gravar no banco" }));
      continue;
    }
    inseridos += lote.length;
    const delta = lote.reduce((acc, item) => acc + (item.tipo === "receita" ? item.valor : -item.valor), 0);
    if (delta !== 0) await ajustarSaldoConta(params.contaId, Math.round(delta * 100) / 100);
  }
  return { inseridos, falhas };
}

// ---------------------------------------------------------------------------
// Leitura inteligente do extrato (09/nov/2026)
// ---------------------------------------------------------------------------

/** O que o app sugere pra cada lançamento do extrato (editável na conferência). */
export interface SugestaoExtrato {
  categoriaId: string | null;
  /** De onde veio a categoria: histórico do usuário, regra, arquivo, dívida ou nada. */
  origemCategoria: "historico" | "regra" | "arquivo" | "divida" | "padrao" | "manual";
  dividaId: string | null;
  dividaNome: string | null;
  /** Pagamento de fatura no extrato do banco: vira transferência pra esta carteira de cartão. */
  transferirPara: string | null;
  /** Já lançado por conta fixa / pagamento de dívida (motivo pra mostrar). */
  jaLancado: string | null;
}

export interface ContextoExtrato {
  categorias: Categoria[];
  /** chave da descrição + tipo → categoria mais usada pelo próprio usuário. */
  historico: Map<string, string>;
  dividas: { id: string; nome: string; chave: string; parcelas: { numero: number; valor: number }[] }[];
  recorrentes: { data: string; tipo: string; valor: number; origem: string }[];
}

function diasEntreIso(a: string, b: string): number {
  return Math.abs((new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime()) / 86400000);
}

function deslocar(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Carrega o que a leitura inteligente precisa: categorias, o HISTÓRICO do
 * usuário (como ele já classificou descrições parecidas — o app "aprende"
 * com cada importação), as dívidas em aberto com parcelas (só pessoal) e o
 * que já foi lançado sozinho por conta fixa/dívida perto dessas datas.
 */
export async function carregarContextoExtrato(params: {
  usuarioId: string;
  tipoNegocio: "pessoal" | "negocio";
  inicio: string;
  fim: string;
  chaveDe: (descricao: string) => string;
}): Promise<ContextoExtrato> {
  const [categorias, historicoRes, dividasRes, parcelasRes, recorrentesRes] = await Promise.all([
    listarCategorias(params.usuarioId),
    supabase
      .from("transacoes")
      .select("descricao, tipo, categoria_id")
      .eq("usuario_id", params.usuarioId)
      .not("categoria_id", "is", null)
      .is("transferencia_id", null)
      .order("data", { ascending: false })
      .limit(3000),
    params.tipoNegocio === "pessoal"
      ? supabase.from("dividas").select("id, nome, quitada").eq("usuario_id", params.usuarioId).eq("quitada", false)
      : Promise.resolve({ data: [] }),
    params.tipoNegocio === "pessoal"
      ? supabase.from("divida_parcelas").select("divida_id, numero, valor").eq("usuario_id", params.usuarioId)
      : Promise.resolve({ data: [] }),
    supabase
      .from("transacoes")
      .select("data, tipo, valor, conta_fixa_id, divida_id")
      .eq("usuario_id", params.usuarioId)
      .gte("data", deslocar(params.inicio, -4))
      .lte("data", deslocar(params.fim, 4))
      .or("conta_fixa_id.not.is.null,divida_id.not.is.null")
      .limit(2000),
  ]);

  // Histórico: conta quantas vezes cada (chave, tipo) caiu em cada categoria.
  const contagem = new Map<string, Map<string, number>>();
  for (const t of (historicoRes.data as { descricao: string | null; tipo: string; categoria_id: string }[] | null) ?? []) {
    const chave = params.chaveDe(t.descricao ?? "");
    if (!chave) continue;
    const k = `${t.tipo}|${chave}`;
    const m = contagem.get(k) ?? new Map<string, number>();
    m.set(t.categoria_id, (m.get(t.categoria_id) ?? 0) + 1);
    contagem.set(k, m);
  }
  const historico = new Map<string, string>();
  for (const [k, m] of contagem) {
    const melhor = Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0];
    if (melhor) historico.set(k, melhor[0]);
  }

  const parcelas = (parcelasRes.data as { divida_id: string; numero: number; valor: number }[] | null) ?? [];
  const dividas = ((dividasRes.data as { id: string; nome: string }[] | null) ?? []).map((d) => ({
    id: d.id,
    nome: d.nome,
    chave: params.chaveDe(d.nome),
    parcelas: parcelas.filter((p) => p.divida_id === d.id).map((p) => ({ numero: Number(p.numero), valor: Number(p.valor) })),
  }));

  const recorrentes = ((recorrentesRes.data as { data: string; tipo: string; valor: number; conta_fixa_id: string | null; divida_id: string | null }[] | null) ?? []).map(
    (t) => ({ data: t.data, tipo: t.tipo, valor: Number(t.valor), origem: t.conta_fixa_id ? "conta fixa" : "pagamento de dívida" })
  );

  return { categorias, historico, dividas, recorrentes };
}

/** Monta a sugestão de cada lançamento (categoria, dívida, transferência de fatura, já lançado). */
export function sugerirExtrato(params: {
  itens: LancamentoLido[];
  classificacoes: { natureza: string; categoriaSugerida: string | null; parcela: { atual: number; total: number } | null; chave: string }[];
  contexto: ContextoExtrato;
  cartaoDestinoId: string | null;
  parecidas: (a: string, b: string) => boolean;
}): SugestaoExtrato[] {
  const { categorias, historico, dividas, recorrentes } = params.contexto;
  const porNome = new Map<string, string>();
  for (const c of [...categorias].sort((a, b) => Number(!!b.usuario_id) - Number(!!a.usuario_id))) {
    const k = `${c.tipo}|${chaveCategoria(c.nome)}`;
    if (!porNome.has(k)) porNome.set(k, c.id);
  }
  const idPorNome = (nome: string, tipo: string) => porNome.get(`${tipo}|${chaveCategoria(nome)}`) ?? null;
  const outras = { receita: idPorNome("Outras receitas", "receita"), despesa: idPorNome("Outras despesas", "despesa") };
  const idDivida = idPorNome("Dívida", "despesa");

  return params.itens.map((item, i) => {
    const c = params.classificacoes[i];
    const sug: SugestaoExtrato = {
      categoriaId: null,
      origemCategoria: "padrao",
      dividaId: null,
      dividaNome: null,
      transferirPara: null,
      jaLancado: null,
    };

    // 1) Já lançado sozinho (conta fixa / parcela de dívida) — mesmo valor e
    //    tipo até 3 dias de diferença: provável duplicada.
    const rec = recorrentes.find((r) => r.tipo === item.tipo && Math.abs(r.valor - item.valor) < 0.01 && diasEntreIso(r.data, item.data) <= 3);
    if (rec) sug.jaLancado = `Já lançado por ${rec.origem}`;

    // 2) Pagamento de fatura no extrato da conta → transferência pro cartão.
    if (c.natureza === "pagamento_fatura" && params.cartaoDestinoId) sug.transferirPara = params.cartaoDestinoId;

    // 3) Parcela de dívida que a pessoa já está pagando (inclusive no cartão).
    if (item.tipo === "despesa" && dividas.length > 0) {
      const porNomeDiv = dividas.find((d) => d.chave && c.chave && params.parecidas(d.chave, c.chave));
      const porParcela = c.parcela
        ? dividas.find((d) => d.parcelas.some((p) => p.numero === c.parcela!.atual && Math.abs(p.valor - item.valor) <= Math.max(0.05, p.valor * 0.02)))
        : undefined;
      const div = porNomeDiv ?? porParcela;
      if (div && (porNomeDiv ? true : !!c.parcela)) {
        sug.dividaId = div.id;
        sug.dividaNome = div.nome;
        if (idDivida) {
          sug.categoriaId = idDivida;
          sug.origemCategoria = "divida";
        }
      }
    }

    if (!sug.categoriaId && item.categoriaTexto) {
      const id = idPorNome(item.categoriaTexto.replace(/^'/, ""), item.tipo);
      if (id) {
        sug.categoriaId = id;
        sug.origemCategoria = "arquivo";
      }
    }
    if (!sug.categoriaId && c.chave) {
      const id = historico.get(`${item.tipo}|${c.chave}`);
      if (id) {
        sug.categoriaId = id;
        sug.origemCategoria = "historico";
      }
    }
    if (!sug.categoriaId && c.categoriaSugerida) {
      const id = idPorNome(c.categoriaSugerida, item.tipo);
      if (id) {
        sug.categoriaId = id;
        sug.origemCategoria = "regra";
      }
    }
    if (!sug.categoriaId) sug.categoriaId = outras[item.tipo];
    return sug;
  });
}

/**
 * Grava a importação inteligente: os lançamentos normais em lote (com a
 * categoria e a dívida escolhidas na conferência) e os pagamentos de fatura
 * como TRANSFERÊNCIA pra carteira do cartão (assim o gasto não conta duas
 * vezes: as compras já estão no cartão).
 */
export async function importarExtratoInteligente(params: {
  usuarioId: string;
  contaId: string;
  tipoNegocio: "pessoal" | "negocio";
  itens: LancamentoLido[];
  sugestoes: SugestaoExtrato[];
}): Promise<{ inseridos: number; falhas: FalhaImportacao[] }> {
  const normais: number[] = [];
  const transferencias: number[] = [];
  params.itens.forEach((_, i) => (params.sugestoes[i]?.transferirPara ? transferencias : normais).push(i));

  const categorias = new Map<number, string | null>();
  normais.forEach((idx, k) => categorias.set(k, params.sugestoes[idx]?.categoriaId ?? null));
  const empresa = params.tipoNegocio === "negocio" ? campoEmpresa() : {};
  let inseridos = 0;
  const falhas: FalhaImportacao[] = [];

  for (let ini = 0; ini < normais.length; ini += TAMANHO_LOTE) {
    const indices = normais.slice(ini, ini + TAMANHO_LOTE);
    const linhas = indices.map((idx) => {
      const item = params.itens[idx];
      const s = params.sugestoes[idx];
      return {
        usuario_id: params.usuarioId,
        conta_id: params.contaId,
        categoria_id: s?.categoriaId ?? null,
        tipo: item.tipo,
        valor: item.valor,
        descricao: item.descricao,
        data: item.data,
        data_vencimento: item.vencimento,
        forma_pagamento: item.formaPagamento,
        tipo_negocio: params.tipoNegocio,
        ...(s?.dividaId && params.tipoNegocio === "pessoal" ? { divida_id: s.dividaId } : {}),
        ...empresa,
      };
    });
    const { error } = await supabase.from("transacoes").insert(linhas);
    if (error) {
      console.error("Erro ao importar lote:", error.message);
      indices.forEach((idx) => falhas.push({ linha: params.itens[idx].linha, motivo: "Não foi possível gravar no banco" }));
      continue;
    }
    inseridos += indices.length;
    const delta = indices.reduce((acc, idx) => acc + (params.itens[idx].tipo === "receita" ? params.itens[idx].valor : -params.itens[idx].valor), 0);
    if (delta !== 0) await ajustarSaldoConta(params.contaId, Math.round(delta * 100) / 100);
  }

  if (transferencias.length > 0) {
    const { criarTransferencia } = await import("./transacoes");
    for (const idx of transferencias) {
      const item = params.itens[idx];
      // eslint-disable-next-line no-await-in-loop -- sequencial (saldo das duas carteiras)
      const { error } = await criarTransferencia({
        usuarioId: params.usuarioId,
        contaOrigemId: params.contaId,
        contaDestinoId: params.sugestoes[idx].transferirPara as string,
        valor: item.valor,
        data: item.data,
        descricao: item.descricao.slice(0, 120),
      });
      if (error) falhas.push({ linha: item.linha, motivo: "Não foi possível lançar o pagamento da fatura" });
      else inseridos += 1;
    }
  }
  return { inseridos, falhas };
}
