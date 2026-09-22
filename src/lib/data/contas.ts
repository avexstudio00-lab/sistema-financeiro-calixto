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
  limite: number | null = null,
  diaFechamento: number | null = null,
  diaVencimento: number | null = null
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
      dia_fechamento: diaFechamento,
      dia_vencimento: diaVencimento,
    })
    .select()
    .single();
}

/** Edita nome/tipo/limite/dias de fatura da carteira. Não mexe em
 * saldo_inicial nem saldo_atual — o saldo é sempre resultado das transações
 * lançadas nela (ver `ajustarSaldoConta` em transacoes.ts), então editar
 * aqui não recalcula nada, só os dados de identificação da conta. */
export async function atualizarConta(
  id: string,
  dados: {
    nome: string;
    tipo: Conta["tipo"];
    limite: number | null;
    diaFechamento?: number | null;
    diaVencimento?: number | null;
  }
) {
  return supabase
    .from("contas")
    .update({
      nome: dados.nome,
      tipo: dados.tipo,
      limite: dados.limite,
      ...(dados.diaFechamento !== undefined ? { dia_fechamento: dados.diaFechamento } : {}),
      ...(dados.diaVencimento !== undefined ? { dia_vencimento: dados.diaVencimento } : {}),
    })
    .eq("id", id);
}

/** Apaga a carteira. Se ela ainda tiver transações lançadas, o banco recusa
 * a exclusão (chave estrangeira) — o chamador deve tratar `error` e avisar
 * a pessoa pra mover ou apagar os lançamentos primeiro. */
export async function deletarConta(id: string) {
  return supabase.from("contas").delete().eq("id", id);
}
