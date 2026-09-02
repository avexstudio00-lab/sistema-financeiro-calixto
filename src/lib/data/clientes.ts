import { supabase } from "@/lib/supabase/client";
import type { Cliente } from "./tipos";

export async function listarClientes(usuarioId: string): Promise<Cliente[]> {
  const { data } = await supabase
    .from("clientes")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("nome", { ascending: true });
  return (data as Cliente[]) ?? [];
}

export async function criarCliente(
  usuarioId: string,
  nome: string,
  telefone: string | null,
  email: string | null
) {
  return supabase
    .from("clientes")
    .insert({ usuario_id: usuarioId, nome, telefone: telefone || null, email: email || null })
    .select()
    .single();
}

export async function atualizarCliente(
  id: string,
  nome: string,
  telefone: string | null,
  email: string | null
) {
  return supabase
    .from("clientes")
    .update({ nome, telefone: telefone || null, email: email || null })
    .eq("id", id);
}

export async function deletarCliente(id: string) {
  return supabase.from("clientes").delete().eq("id", id);
}
