import { supabase } from "@/lib/supabase/client";
import type { Conta } from "./tipos";

export async function listarContas(usuarioId: string): Promise<Conta[]> {
  const { data } = await supabase
    .from("contas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: true });
  return (data as Conta[]) ?? [];
}

export async function criarConta(
  usuarioId: string,
  nome: string,
  tipo: Conta["tipo"],
  saldoInicial: number
) {
  return supabase
    .from("contas")
    .insert({
      usuario_id: usuarioId,
      nome,
      tipo,
      saldo_inicial: saldoInicial,
      saldo_atual: saldoInicial,
    })
    .select()
    .single();
}
