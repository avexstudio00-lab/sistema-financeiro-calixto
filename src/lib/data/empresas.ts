import { supabase } from "@/lib/supabase/client";
import type { Empresa } from "./tipos";

/** Ramo de atividade da empresa (item 5.5 da especificação de 03/out/2026),
 * derivado das duas colunas booleanas que já existiam em `empresas`. */
export type RamoAtividade = "servicos" | "produtos" | "ambos";

export function ramoDaEmpresa(e: Pick<Empresa, "vende_produto" | "vende_servico">): RamoAtividade {
  if (e.vende_produto && e.vende_servico) return "ambos";
  if (e.vende_servico) return "servicos";
  return "produtos";
}

export function colunasDoRamo(ramo: RamoAtividade): { vende_produto: boolean; vende_servico: boolean } {
  return {
    vende_produto: ramo === "produtos" || ramo === "ambos",
    vende_servico: ramo === "servicos" || ramo === "ambos",
  };
}

/** Empresas visíveis pra quem está logado (dono vê as dele; sócio/funcionário
 * vê só a(s) empresa(s) a que foi vinculado — o RLS de `empresas` já filtra). */
export async function listarEmpresas(contaMestreId: string): Promise<Empresa[]> {
  const { data } = await supabase
    .from("empresas")
    .select("*")
    .eq("usuario_id", contaMestreId)
    .eq("ativa", true)
    .order("criado_em", { ascending: true });
  return (data as Empresa[]) ?? [];
}

export async function criarEmpresa(contaMestreId: string, nomeFantasia: string, ramo: RamoAtividade) {
  return supabase
    .from("empresas")
    .insert({ usuario_id: contaMestreId, nome_fantasia: nomeFantasia.trim() || "Minha empresa", ...colunasDoRamo(ramo) })
    .select()
    .single();
}

export async function atualizarEmpresa(id: string, dados: { nomeFantasia: string; ramo: RamoAtividade }) {
  return supabase
    .from("empresas")
    .update({ nome_fantasia: dados.nomeFantasia.trim() || "Minha empresa", ...colunasDoRamo(dados.ramo) })
    .eq("id", id);
}

/** Desativa (não apaga) — os dados da empresa continuam no banco. */
export async function desativarEmpresa(id: string) {
  return supabase.from("empresas").update({ ativa: false }).eq("id", id);
}
