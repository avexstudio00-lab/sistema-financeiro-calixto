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
