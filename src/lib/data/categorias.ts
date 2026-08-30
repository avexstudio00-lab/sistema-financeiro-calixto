import { supabase } from "@/lib/supabase/client";
import type { Categoria } from "./tipos";

export async function listarCategorias(usuarioId: string): Promise<Categoria[]> {
  const { data } = await supabase
    .from("categorias")
    .select("*")
    .or(`usuario_id.is.null,usuario_id.eq.${usuarioId}`)
    .order("nome", { ascending: true });
  return (data as Categoria[]) ?? [];
}

export async function criarCategoriaPersonalizada(
  usuarioId: string,
  nome: string,
  tipo: "receita" | "despesa"
) {
  return supabase
    .from("categorias")
    .insert({
      usuario_id: usuarioId,
      nome,
      tipo,
      is_padrao: false,
      is_personalizada: true,
      cor: "#10B981",
    })
    .select()
    .single();
}
