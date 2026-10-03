import { supabase } from "@/lib/supabase/client";
import type { ModeloLancamento } from "./tipos";

/** Modelos de "lançamento rápido" (item 6.1 da especificação de 03/out/2026):
 * guardam tudo de um gasto/receita frequente (nome, categoria, carteira,
 * forma de pagamento) menos o valor, que é digitado na hora. */
export async function listarModelos(usuarioId: string, tipoNegocio: "pessoal" | "negocio"): Promise<ModeloLancamento[]> {
  const { data } = await supabase
    .from("modelos_lancamento")
    .select("*")
    .eq("usuario_id", usuarioId)
    .eq("tipo_negocio", tipoNegocio)
    .order("criado_em", { ascending: true });
  return (data as ModeloLancamento[]) ?? [];
}

export interface NovoModelo {
  usuario_id: string;
  nome: string;
  tipo: "receita" | "despesa";
  tipo_negocio: "pessoal" | "negocio";
  categoria_id: string | null;
  conta_id: string | null;
  forma_pagamento: ModeloLancamento["forma_pagamento"];
  ultimo_valor: number | null;
}

export async function criarModelo(modelo: NovoModelo) {
  return supabase.from("modelos_lancamento").insert({ ...modelo, nome: modelo.nome.trim().slice(0, 60) }).select().single();
}

export async function atualizarUltimoValorModelo(id: string, valor: number) {
  return supabase.from("modelos_lancamento").update({ ultimo_valor: valor }).eq("id", id);
}

export async function removerModelo(id: string) {
  return supabase.from("modelos_lancamento").delete().eq("id", id);
}
