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

/** Edita os dados base da meta (nome, valor-alvo, prazo) depois de já criada
 * — pedido do usuário em 22/set/2026 ("tem como a pessoa editar tudo?"):
 * antes só dava pra editar o progresso (aporte/retirada), não o cadastro em
 * si. Não mexe em `valor_atual`/`status` — isso continua só por aporte. */
export async function atualizarMeta(
  metaId: string,
  dados: { nome: string; valorMeta: number; dataFim: string | null }
) {
  return supabase
    .from("metas")
    .update({ nome: dados.nome, valor_meta: dados.valorMeta, data_fim: dados.dataFim })
    .eq("id", metaId);
}

/**
 * Em quantos meses a meta é atingida, simulando um aporte mensal
 * hipotético constante a partir de hoje — pedido do usuário em 22/set/2026:
 * "se você guardar tanto por mês, em quanto tempo bate tal meta". Não é uma
 * projeção baseada no ritmo histórico de aportes (o app não guarda um
 * histórico de aportes individuais, só o total acumulado) — é um simulador:
 * a pessoa digita um valor mensal hipotético e vê a estimativa. `null`
 * quando o valor mensal é inválido/zero (nunca chegaria) ou a meta já foi
 * batida (nesse caso o valor restante já é 0).
 */
export function calcularMesesParaAtingirMeta(valorRestante: number, aporteMensal: number): number | null {
  if (valorRestante <= 0) return 0;
  if (!Number.isFinite(aporteMensal) || aporteMensal <= 0) return null;
  return Math.ceil(valorRestante / aporteMensal);
}
