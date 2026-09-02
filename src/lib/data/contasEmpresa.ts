import { supabase } from "@/lib/supabase/client";
import type { ContaPagar, ContaReceber } from "./tipos";

// ---------------------------------------------------------------------------
// Contas a pagar (fornecedores, DAS e outras contas do negócio)
// ---------------------------------------------------------------------------

export async function listarContasPagar(usuarioId: string): Promise<ContaPagar[]> {
  const { data } = await supabase
    .from("contas_pagar")
    .select("*, fornecedores(*)")
    .eq("usuario_id", usuarioId)
    .order("vencimento", { ascending: true });
  return (data as ContaPagar[]) ?? [];
}

export interface NovaContaPagar {
  usuario_id: string;
  fornecedor_id: string | null;
  categoria: ContaPagar["categoria"];
  descricao: string;
  valor: number;
  vencimento: string;
}

export async function criarContaPagar(conta: NovaContaPagar) {
  return supabase.from("contas_pagar").insert(conta).select().single();
}

export async function marcarContaPagarPaga(id: string, pago: boolean) {
  return supabase
    .from("contas_pagar")
    .update({ status: pago ? "pago" : "pendente", data_pagamento: pago ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", id);
}

export async function deletarContaPagar(id: string) {
  return supabase.from("contas_pagar").delete().eq("id", id);
}

// ---------------------------------------------------------------------------
// Contas a receber (clientes)
// ---------------------------------------------------------------------------

export async function listarContasReceber(usuarioId: string): Promise<ContaReceber[]> {
  const { data } = await supabase
    .from("contas_receber")
    .select("*, clientes(*)")
    .eq("usuario_id", usuarioId)
    .order("vencimento", { ascending: true });
  return (data as ContaReceber[]) ?? [];
}

export interface NovaContaReceber {
  usuario_id: string;
  cliente_id: string | null;
  descricao: string;
  valor: number;
  vencimento: string;
}

export async function criarContaReceber(conta: NovaContaReceber) {
  return supabase.from("contas_receber").insert(conta).select().single();
}

export async function marcarContaReceberRecebida(id: string, recebido: boolean) {
  return supabase
    .from("contas_receber")
    .update({
      status: recebido ? "recebido" : "pendente",
      data_recebimento: recebido ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);
}

export async function deletarContaReceber(id: string) {
  return supabase.from("contas_receber").delete().eq("id", id);
}

// ---------------------------------------------------------------------------
// Helper compartilhado
// ---------------------------------------------------------------------------

/** true quando o vencimento já passou e a conta ainda está pendente —
 * mesma lógica de `parcelaEstaAtrasada` em investimentos.ts. */
export function estaAtrasada(
  item: { vencimento: string; status: "pendente" | "pago" | "recebido" },
  referencia: Date = new Date()
): boolean {
  if (item.status !== "pendente") return false;
  const vencimento = new Date(item.vencimento + "T00:00:00");
  const hoje = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  return vencimento < hoje;
}
