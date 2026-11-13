import { supabase } from "@/lib/supabase/client";

/**
 * Custos protegidos (14/nov/2026). Dono e sócio recebem o custo pelas
 * funções do banco custos_produtos / custos_servicos / custos_vendas
 * (SECURITY DEFINER, que conferem o papel); o funcionário recebe vazio e o
 * custo fica 0 na tela dele. Antes do SQL da blindagem rodar, as funções não
 * existem: aí lê a coluna direto (ainda liberada), pra nada quebrar.
 */

const LOTE = 300;

async function emLotes<T>(ids: string[], buscar: (lote: string[]) => Promise<T[] | null>): Promise<T[] | null> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  const saida: T[] = [];
  for (let i = 0; i < unicos.length; i += LOTE) {
    // eslint-disable-next-line no-await-in-loop -- poucos lotes, em sequência
    const r = await buscar(unicos.slice(i, i + LOTE));
    if (r === null) return null;
    saida.push(...r);
  }
  return saida;
}

type ComId = { id: string };

async function custosPorFuncao(funcao: "custos_produtos" | "custos_servicos", tabela: "produtos" | "servicos", ids: string[]): Promise<Map<string, number>> {
  const viaFuncao = await emLotes(ids, async (lote) => {
    const { data, error } = await supabase.rpc(funcao, { p_ids: lote });
    if (error) return null;
    return (data as { id: string; custo: number | null }[]) ?? [];
  });
  const linhas =
    viaFuncao ??
    (await emLotes(ids, async (lote) => {
      const { data } = await supabase.from(tabela).select("id, custo").in("id", lote);
      return (data as { id: string; custo: number | null }[]) ?? [];
    })) ??
    [];
  return new Map(linhas.map((l) => [l.id, Number(l.custo ?? 0)]));
}

/** Junta o custo (ou 0, para o funcionário) nos produtos lidos. */
export async function comCustoProdutos<T extends ComId>(lista: T[]): Promise<(T & { custo: number })[]> {
  if (lista.length === 0) return [];
  const mapa = await custosPorFuncao("custos_produtos", "produtos", lista.map((p) => p.id));
  return lista.map((p) => ({ ...p, custo: mapa.get(p.id) ?? 0 }));
}

export async function comCustoServicos<T extends ComId>(lista: T[]): Promise<(T & { custo: number | null })[]> {
  if (lista.length === 0) return [];
  const mapa = await custosPorFuncao("custos_servicos", "servicos", lista.map((s) => s.id));
  return lista.map((s) => ({ ...s, custo: mapa.has(s.id) ? mapa.get(s.id)! : null }));
}

/** Junta custo_unitario e taxa_maquininha nas vendas lidas. */
export async function comCustoVendas<T extends ComId>(lista: T[]): Promise<(T & { custo_unitario: number; taxa_maquininha: number | null })[]> {
  if (lista.length === 0) return [];
  const ids = lista.map((v) => v.id);
  const viaFuncao = await emLotes(ids, async (lote) => {
    const { data, error } = await supabase.rpc("custos_vendas", { p_ids: lote });
    if (error) return null;
    return (data as { id: string; custo_unitario: number | null; taxa_maquininha: number | null }[]) ?? [];
  });
  const linhas =
    viaFuncao ??
    (await emLotes(ids, async (lote) => {
      const { data } = await supabase.from("vendas").select("id, custo_unitario, taxa_maquininha").in("id", lote);
      return (data as { id: string; custo_unitario: number | null; taxa_maquininha: number | null }[]) ?? [];
    })) ??
    [];
  const mapa = new Map(linhas.map((l) => [l.id, l]));
  return lista.map((v) => ({
    ...v,
    custo_unitario: Number(mapa.get(v.id)?.custo_unitario ?? 0),
    taxa_maquininha: mapa.get(v.id)?.taxa_maquininha != null ? Number(mapa.get(v.id)!.taxa_maquininha) : null,
  }));
}

/** Custo de 1 produto/serviço (orçamento fechado, compra de estoque). */
export async function custoDoProduto(id: string): Promise<number> {
  return (await custosPorFuncao("custos_produtos", "produtos", [id])).get(id) ?? 0;
}

export async function custoDoServico(id: string): Promise<number> {
  return (await custosPorFuncao("custos_servicos", "servicos", [id])).get(id) ?? 0;
}
