import { supabase } from "@/lib/supabase/client";
import type { Meta } from "./tipos";

export async function listarMetas(usuarioId: string): Promise<Meta[]> {
  const { data } = await supabase
    .from("metas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("data_inicio", { ascending: false });
  return (data as Meta[]) ?? [];
}

export async function criarMeta(
  usuarioId: string,
  nome: string,
  valorMeta: number,
  dataFim: string | null
) {
  return supabase
    .from("metas")
    .insert({
      usuario_id: usuarioId,
      nome,
      valor_meta: valorMeta,
      data_fim: dataFim,
    })
    .select()
    .single();
}

export async function atualizarProgressoMeta(metaId: string, valorAtual: number, status: Meta["status"]) {
  return supabase.from("metas").update({ valor_atual: valorAtual, status }).eq("id", metaId);
}
