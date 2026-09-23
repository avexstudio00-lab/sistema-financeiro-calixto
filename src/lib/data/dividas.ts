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

/** Edita os dados base da dívida (nome, valor total) depois de já cadastrada
 * — pedido do usuário em 22/set/2026 ("tem como a pessoa editar tudo?"):
 * antes só dava pra apagar e recriar. Não mexe em `quitada` — isso continua
 * só pelo toggle "Marcar como quitada"/"Reabrir", e o valor pago continua
 * sempre calculado a partir do extrato real (ver `listarDividasComProgresso`
 * acima), nunca editável diretamente. */
export async function atualizarDivida(dividaId: string, dados: { nome: string; valorTotal: number }) {
  return supabase.from("dividas").update({ nome: dados.nome, valor_total: dados.valorTotal }).eq("id", dividaId);
}

/**
 * Em quantos meses a dívida é quitada, simulando um pagamento mensal
 * hipotético constante a partir de hoje — pedido do usuário em 22/set/2026,
 * mesma lógica do Bloco 8 item "h" ("pagando X por mês, quita em Y meses") e
 * do simulador equivalente em Metas (`calcularMesesParaAtingirMeta`): não é
 * baseado no ritmo histórico de pagamentos, é um simulador com um valor
 * hipotético digitado pela pessoa. `null` quando o valor mensal é
 * inválido/zero.
 */
export function calcularMesesParaQuitar(valorRestante: number, pagamentoMensal: number): number | null {
  if (valorRestante <= 0) return 0;
  if (!Number.isFinite(pagamentoMensal) || pagamentoMensal <= 0) return null;
  return Math.ceil(valorRestante / pagamentoMensal);
}

/** Apaga só o cadastro da dívida — os pagamentos já anotados continuam
 * intactos em `transacoes` (só perdem a referência, `divida_id` vira null
 * via ON DELETE SET NULL), exatamente como uma conta fixa removida nunca
 * apaga os lançamentos que ela já gerou (ver seção 9 do contexto). */
export async function removerDivida(dividaId: string) {
  return supabase.from("dividas").delete().eq("id", dividaId);
}
