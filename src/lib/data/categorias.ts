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

/** Acha uma categoria padrão pelo nome exato (ex: "Pró-labore"), usada em
 * atalhos que já abrem a anotação com a categoria certa pré-selecionada. */
export async function buscarCategoriaPadraoPorNome(
  nome: string,
  tipo: "receita" | "despesa"
): Promise<Categoria | null> {
  const { data } = await supabase
    .from("categorias")
    .select("*")
    .is("usuario_id", null)
    .eq("nome", nome)
    .eq("tipo", tipo)
    .maybeSingle();
  return (data as Categoria | null) ?? null;
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
