import { supabase } from "@/lib/supabase/client";
import type { Divida, DividaComProgresso } from "./tipos";

/** Lista as dívidas do usuário já com o progresso calculado — nunca lê um
 * "valor pago" salvo à parte (isso dessincronizaria do extrato real, ver
 * lição da seção 9 do contexto do projeto sobre contas fixas removidas sem
 * reverter o lançamento). Em vez disso, soma de verdade toda transação que
 * aponta pra cada dívida via `transacoes.divida_id`, sempre na hora. */
export async function listarDividasComProgresso(usuarioId: string): Promise<DividaComProgresso[]> {
  const { data: dividas } = await supabase
    .from("dividas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false });

  if (!dividas || dividas.length === 0) return [];

  const { data: pagamentos } = await supabase
    .from("transacoes")
    .select("divida_id, valor")
    .eq("usuario_id", usuarioId)
    .not("divida_id", "is", null);

  const totalPagoPorDivida = new Map<string, number>();
  (pagamentos ?? []).forEach((p) => {
    if (!p.divida_id) return;
    totalPagoPorDivida.set(p.divida_id, (totalPagoPorDivida.get(p.divida_id) ?? 0) + Number(p.valor));
  });

  return (dividas as Divida[]).map((d) => {
    // Trava em 0/total pra nunca mostrar "pago 110%" ou "falta -R$50" (ex:
    // usuário editou o valor total pra baixo depois de já ter pago mais).
    const valorPago = Math.min(totalPagoPorDivida.get(d.id) ?? 0, Number(d.valor_total));
    return {
      ...d,
      valor_pago: valorPago,
      valor_restante: Math.max(Number(d.valor_total) - valorPago, 0),
    };
  });
}

export async function criarDivida(usuarioId: string, nome: string, valorTotal: number) {
  return supabase
    .from("dividas")
    .insert({ usuario_id: usuarioId, nome, valor_total: valorTotal })
    .select()
    .single();
}

export async function alternarQuitadaDivida(dividaId: string, quitada: boolean) {
  return supabase.from("dividas").update({ quitada }).eq("id", dividaId);
}

/** Apaga só o cadastro da dívida — os pagamentos já anotados continuam
 * intactos em `transacoes` (só perdem a referência, `divida_id` vira null
 * via ON DELETE SET NULL), exatamente como uma conta fixa removida nunca
 * apaga os lançamentos que ela já gerou (ver seção 9 do contexto). */
export async function removerDivida(dividaId: string) {
  return supabase.from("dividas").delete().eq("id", dividaId);
}
