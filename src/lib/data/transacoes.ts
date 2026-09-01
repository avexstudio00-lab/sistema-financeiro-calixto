import { supabase } from "@/lib/supabase/client";
import type { Transacao } from "./tipos";

export interface NovaTransacao {
  usuario_id: string;
  conta_id: string | null;
  categoria_id: string | null;
  tipo: "receita" | "despesa";
  valor: number;
  descricao: string;
  data: string;
  forma_pagamento: Transacao["forma_pagamento"];
  tipo_negocio: Transacao["tipo_negocio"];
}

export async function listarTransacoes(
  usuarioId: string,
  filtros?: { inicio?: string; fim?: string; categoriaId?: string; tipo?: "receita" | "despesa" }
): Promise<Transacao[]> {
  let query = supabase
    .from("transacoes")
    .select("*, categorias(*)")
    .eq("usuario_id", usuarioId)
    .order("data", { ascending: false })
    .order("criado_em", { ascending: false });

  if (filtros?.inicio) query = query.gte("data", filtros.inicio);
  if (filtros?.fim) query = query.lte("data", filtros.fim);
  if (filtros?.categoriaId) query = query.eq("categoria_id", filtros.categoriaId);
  if (filtros?.tipo) query = query.eq("tipo", filtros.tipo);

  const { data } = await query;
  return (data as Transacao[]) ?? [];
}

export async function contarTransacoesDoMes(usuarioId: string, inicio: string, fim: string) {
  const { count } = await supabase
    .from("transacoes")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuarioId)
    .gte("data", inicio)
    .lte("data", fim);
  return count ?? 0;
}

function deltaDe(tipo: "receita" | "despesa", valor: number) {
  return tipo === "receita" ? valor : -valor;
}

async function ajustarSaldoConta(contaId: string, delta: number) {
  const { data: conta } = await supabase
    .from("contas")
    .select("saldo_atual")
    .eq("id", contaId)
    .single();
  if (conta) {
    await supabase
      .from("contas")
      .update({ saldo_atual: Number(conta.saldo_atual) + delta })
      .eq("id", contaId);
  }
}

export async function criarTransacao(transacao: NovaTransacao) {
  const { data, error } = await supabase.from("transacoes").insert(transacao).select().single();

  if (!error && transacao.conta_id) {
    await ajustarSaldoConta(transacao.conta_id, deltaDe(transacao.tipo, transacao.valor));
  }

  return { data, error };
}

export async function atualizarTransacao(transacaoOriginal: Transacao, dados: NovaTransacao) {
  const { data, error } = await supabase
    .from("transacoes")
    .update(dados)
    .eq("id", transacaoOriginal.id)
    .select()
    .single();

  if (!error) {
    // Desfaz o efeito da versão antiga no saldo da conta de origem...
    if (transacaoOriginal.conta_id) {
      await ajustarSaldoConta(
        transacaoOriginal.conta_id,
        -deltaDe(transacaoOriginal.tipo, Number(transacaoOriginal.valor))
      );
    }
    // ...e aplica o efeito da versão nova (pode ser a mesma conta ou outra).
    if (dados.conta_id) {
      await ajustarSaldoConta(dados.conta_id, deltaDe(dados.tipo, dados.valor));
    }
  }

  return { data, error };
}

export async function deletarTransacao(transacao: Transacao) {
  const { error } = await supabase.from("transacoes").delete().eq("id", transacao.id);

  if (!error && transacao.conta_id) {
    await ajustarSaldoConta(
      transacao.conta_id,
      -deltaDe(transacao.tipo, Number(transacao.valor))
    );
  }

  return { error };
}
