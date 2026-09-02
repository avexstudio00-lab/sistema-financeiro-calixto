import { supabase } from "@/lib/supabase/client";
import type { Produto } from "./tipos";

export async function listarProdutos(usuarioId: string): Promise<Produto[]> {
  const { data } = await supabase
    .from("produtos")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("nome", { ascending: true });
  return (data as Produto[]) ?? [];
}

export interface NovoProduto {
  usuario_id: string;
  nome: string;
  custo: number;
  preco_venda: number;
  quantidade_estoque: number;
  estoque_minimo: number;
}

export async function criarProduto(produto: NovoProduto) {
  return supabase.from("produtos").insert(produto).select().single();
}

export async function atualizarProduto(id: string, dados: Omit<NovoProduto, "usuario_id">) {
  return supabase.from("produtos").update(dados).eq("id", id);
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
