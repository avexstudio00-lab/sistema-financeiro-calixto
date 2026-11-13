import { supabase } from "@/lib/supabase/client";
import { campoEmpresa, filtrarPorEmpresa } from "@/lib/empresa/empresaAtiva";
import type { Produto } from "./tipos";
import { COLS_PRODUTO } from "./colunas";
import { comCustoProdutos } from "./custos";

/** Coluna que ainda não existe no banco (SQL pendente): cai pro "*". */
export const faltaColuna = (e: { message?: string; code?: string } | null) =>
  !!e && (e.code === "42703" || /does not exist|could not find/i.test(e.message ?? ""));

export async function listarProdutos(usuarioId: string): Promise<Produto[]> {
  const consulta = (cols: string) =>
    filtrarPorEmpresa(supabase.from("produtos").select(cols).eq("usuario_id", usuarioId).order("nome", { ascending: true }));
  let { data, error } = await consulta(COLS_PRODUTO);
  if (faltaColuna(error)) ({ data, error } = await consulta("*"));
  if (error || !data) return [];
  // Custo só chega pra dono/sócio (blindagem do funcionário, 14/nov/2026).
  return (await comCustoProdutos(data as unknown as Produto[])) as Produto[];
}

/** Produtos de um fornecedor (ficha do fornecedor). */
export async function listarProdutosDoFornecedor(fornecedorId: string): Promise<Produto[]> {
  const consulta = (cols: string) => supabase.from("produtos").select(cols).eq("fornecedor_id", fornecedorId).order("nome");
  let { data, error } = await consulta(COLS_PRODUTO);
  if (faltaColuna(error)) ({ data, error } = await consulta("*"));
  if (error || !data) return [];
  return (await comCustoProdutos(data as unknown as Produto[])) as Produto[];
}

export interface NovoProduto {
  usuario_id: string;
  nome: string;
  custo: number;
  preco_venda: number;
  quantidade_estoque: number;
  estoque_minimo: number;
  fornecedor_id?: string | null;
  preco_repasse?: number | null;
}

/** Banco ainda sem a coluna preco_repasse (SQL de 13/nov não rodado): tira
 * o campo e tenta de novo, pra não travar o cadastro. */
function semRepasse<T extends object>(dados: T): T {
  const copia = { ...dados };
  delete (copia as Record<string, unknown>).preco_repasse;
  return copia;
}
const faltaColunaRepasse = (e: { message?: string } | null) => !!e && /preco_repasse/.test(e.message ?? "");

export async function criarProduto(produto: NovoProduto) {
  // Devolve as colunas liberadas (sem custo) e junta o custo que acabou de
  // ser gravado, sem precisar ler de volta.
  const inserir = (dados: object, cols: string) => supabase.from("produtos").insert({ ...campoEmpresa(), ...dados }).select(cols).single();
  let r = await inserir(produto, COLS_PRODUTO);
  if (faltaColunaRepasse(r.error)) r = await inserir(semRepasse(produto), COLS_PRODUTO.replace(", preco_repasse", ""));
  if (r.data) return { ...r, data: { ...(r.data as unknown as Produto), custo: produto.custo } as Produto };
  return { ...r, data: null };
}

export async function atualizarProduto(id: string, dados: Omit<NovoProduto, "usuario_id">) {
  const r = await supabase.from("produtos").update(dados).eq("id", id);
  if (faltaColunaRepasse(r.error)) return supabase.from("produtos").update(semRepasse(dados)).eq("id", id);
  return r;
}

export async function deletarProduto(id: string) {
  return supabase.from("produtos").delete().eq("id", id);
}

/** Ajusta o estoque em `delta` (negativo pra baixa, positivo pra repor),
 * nunca deixando a quantidade ficar negativa no banco. */
export async function ajustarEstoque(id: string, quantidadeAtual: number, delta: number) {
  const novaQuantidade = Math.max(0, quantidadeAtual + delta);
  await supabase.from("produtos").update({ quantidade_estoque: novaQuantidade }).eq("id", id);
  return novaQuantidade;
}

/** Margem de lucro sobre o preço de venda, em % (ex: custo 10, venda 15 → 33,3%). */
export function calcularMargem(produto: Pick<Produto, "custo" | "preco_venda">): number {
  const preco = Number(produto.preco_venda);
  if (!preco) return 0;
  return ((preco - Number(produto.custo)) / preco) * 100;
}

export function estoqueBaixo(produto: Pick<Produto, "quantidade_estoque" | "estoque_minimo">): boolean {
  return Number(produto.quantidade_estoque) <= Number(produto.estoque_minimo);
}
