import { supabase } from "@/lib/supabase/client";
import { campoEmpresa, filtrarPorEmpresa } from "@/lib/empresa/empresaAtiva";
import type { Fornecedor } from "./tipos";

export async function listarFornecedores(usuarioId: string): Promise<Fornecedor[]> {
  const { data } = await filtrarPorEmpresa(supabase
    .from("fornecedores")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("nome", { ascending: true }));
  return (data as Fornecedor[]) ?? [];
}

export async function criarFornecedor(
  usuarioId: string,
  nome: string,
  telefone: string | null,
  email: string | null,
  prazoEntregaDias: number | null = null
) {
  return supabase
    .from("fornecedores")
    .insert({ ...campoEmpresa(), usuario_id: usuarioId, nome, telefone: telefone || null, email: email || null, prazo_entrega_dias: prazoEntregaDias })
    .select()
    .single();
}

export async function atualizarFornecedor(
  id: string,
  nome: string,
  telefone: string | null,
  email: string | null,
  prazoEntregaDias: number | null = null
) {
  return supabase
    .from("fornecedores")
    .update({ nome, telefone: telefone || null, email: email || null, prazo_entrega_dias: prazoEntregaDias })
    .eq("id", id);
}

export async function deletarFornecedor(id: string) {
  return supabase.from("fornecedores").delete().eq("id", id);
}
