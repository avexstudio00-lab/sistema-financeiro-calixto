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
  saldoInicial: number,
  limite: number | null = null
) {
  return supabase
    .from("contas")
    .insert({
      usuario_id: usuarioId,
      nome,
      tipo,
      saldo_inicial: saldoInicial,
      saldo_atual: saldoInicial,
      limite,
    })
    .select()
    .single();
}

/** Edita nome/tipo/limite da carteira. Não mexe em saldo_inicial nem
 * saldo_atual — o saldo é sempre resultado das transações lançadas nela
 * (ver `ajustarSaldoConta` em transacoes.ts), então editar aqui não recalcula
 * nada, só os dados de identificação da conta. */
export async function atualizarConta(
  id: string,
  dados: { nome: string; tipo: Conta["tipo"]; limite: number | null }
) {
  return supabase.from("contas").update(dados).eq("id", id);
}

/** Apaga a carteira. Se ela ainda tiver transações lançadas, o banco recusa
 * a exclusão (chave estrangeira) — o chamador deve tratar `error` e avisar
 * a pessoa pra mover ou apagar os lançamentos primeiro. */
export async function deletarConta(id: string) {
  return supabase.from("contas").delete().eq("id", id);
}
