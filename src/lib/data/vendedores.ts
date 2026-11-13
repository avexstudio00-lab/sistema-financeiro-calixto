import { supabase } from "@/lib/supabase/client";
import { campoEmpresa, filtrarPorEmpresa } from "@/lib/empresa/empresaAtiva";
import type { Venda, Vendedor } from "./tipos";

/**
 * Vendedores (13/nov/2026): cada um ganha de um jeito.
 * - comissao: X% do que vende;
 * - repasse: te paga o preço de repasse de cada peça e fica com o que vender
 *   acima (ex.: repasse R$ 23, vendeu por R$ 30 → ele fica com R$ 7);
 * - nenhum: só acompanhar as vendas.
 * A venda guarda o nome (vendas.vendedor_nome) e o repasse do dia
 * (vendas.repasse_unitario), então mudar o cadastro não muda o passado.
 */

export async function listarVendedores(contaMestreId: string): Promise<Vendedor[]> {
  const { data, error } = await filtrarPorEmpresa(
    supabase.from("vendedores").select("*").eq("usuario_id", contaMestreId).order("nome", { ascending: true })
  );
  if (error) return [];
  return (data as Vendedor[]) ?? [];
}

export interface DadosVendedor {
  nome: string;
  modelo: Vendedor["modelo"];
  comissao_pct: number | null;
  meta_mensal: number | null;
  telefone: string | null;
  ativo?: boolean;
}

export async function criarVendedor(contaMestreId: string, d: DadosVendedor) {
  return supabase.from("vendedores").insert({ ...campoEmpresa(), usuario_id: contaMestreId, ...d, nome: d.nome.trim() }).select().single();
}

export async function atualizarVendedor(id: string, d: DadosVendedor) {
  return supabase.from("vendedores").update({ ...d, nome: d.nome.trim() }).eq("id", id);
}

export async function excluirVendedor(id: string) {
  return supabase.from("vendedores").delete().eq("id", id);
}

export interface ResultadoVendedor {
  nome: string;
  vendedor: Vendedor | null;
  vendido: number;
  vendas: number;
  /** Comissão (modelo comissão) ou o que ele ficou acima do repasse. */
  ganhoVendedor: number;
  /** Modelo repasse: quanto ele te deve pelas peças. */
  devePagar: number;
  /** Itens vendidos sem preço de repasse definido (modelo repasse). */
  itensSemRepasse: number;
  meta: number | null;
  falta: number | null;
}

const chaveNome = (n: string) => n.trim().toLocaleLowerCase("pt-BR");

export function calcularResultadoVendedores(vendasDoPeriodo: Venda[], vendedores: Vendedor[]): ResultadoVendedor[] {
  const porNome = new Map(vendedores.map((v) => [chaveNome(v.nome), v]));
  const mapa = new Map<string, ResultadoVendedor & { grupos: Set<string> }>();

  for (const v of vendasDoPeriodo) {
    if (!v.vendedor_nome) continue;
    const k = chaveNome(v.vendedor_nome);
    const cadastro = porNome.get(k) ?? null;
    const r =
      mapa.get(k) ??
      ({
        nome: cadastro?.nome ?? v.vendedor_nome,
        vendedor: cadastro,
        vendido: 0,
        vendas: 0,
        ganhoVendedor: 0,
        devePagar: 0,
        itensSemRepasse: 0,
        meta: cadastro?.meta_mensal != null ? Number(cadastro.meta_mensal) : null,
        falta: null,
        grupos: new Set<string>(),
      } as ResultadoVendedor & { grupos: Set<string> });
    const total = Number(v.valor_total);
    r.vendido += total;
    r.grupos.add(v.grupo_venda_id ?? v.id);
    if (cadastro?.modelo === "comissao") {
      r.ganhoVendedor += (total * Number(cadastro.comissao_pct ?? 0)) / 100;
    } else if (cadastro?.modelo === "repasse") {
      if (v.repasse_unitario != null && v.produto_id) {
        const repasse = Number(v.repasse_unitario) * Number(v.quantidade);
        r.devePagar += repasse;
        r.ganhoVendedor += total - repasse;
      } else {
        // Sem repasse definido: considera que ele repassa o valor todo.
        r.devePagar += total;
        r.itensSemRepasse += 1;
      }
    }
    mapa.set(k, r);
  }

  return Array.from(mapa.values())
    .map(({ grupos, ...r }) => ({
      ...r,
      vendas: grupos.size,
      vendido: Number(r.vendido.toFixed(2)),
      ganhoVendedor: Number(r.ganhoVendedor.toFixed(2)),
      devePagar: Number(r.devePagar.toFixed(2)),
      falta: r.meta != null ? Math.max(0, Number((r.meta - r.vendido).toFixed(2))) : null,
    }))
    .sort((a, b) => b.vendido - a.vendido);
}

/** Quanto sai para os vendedores no período (comissões + o que os de
 * repasse ficaram acima do repasse) — entra no cálculo do lucro líquido. */
export function custoVendedores(resultados: ResultadoVendedor[]): number {
  return resultados.reduce((acc, r) => acc + r.ganhoVendedor, 0);
}
