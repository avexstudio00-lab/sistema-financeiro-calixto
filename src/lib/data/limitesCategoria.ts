import { supabase } from "@/lib/supabase/client";
import type { LimiteCategoria } from "./tipos";

/** Lista os limites mensais que o usuário definiu, por categoria. */
export async function listarLimites(usuarioId: string): Promise<LimiteCategoria[]> {
  const { data } = await supabase.from("limites_categoria").select("*").eq("usuario_id", usuarioId);
  return (data as LimiteCategoria[]) ?? [];
}

/** Cria ou atualiza o limite mensal de uma categoria (upsert por
 * usuario_id+categoria_id — ver constraint UNIQUE na migração). */
export async function definirLimite(usuarioId: string, categoriaId: string, limiteMensal: number) {
  return supabase
    .from("limites_categoria")
    .upsert(
      { usuario_id: usuarioId, categoria_id: categoriaId, limite_mensal: limiteMensal },
      { onConflict: "usuario_id,categoria_id" }
    )
    .select()
    .single();
}

/** Remove o limite de uma categoria (volta a não ter alerta nenhum pra ela). */
export async function removerLimite(usuarioId: string, categoriaId: string) {
  return supabase.from("limites_categoria").delete().eq("usuario_id", usuarioId).eq("categoria_id", categoriaId);
}
