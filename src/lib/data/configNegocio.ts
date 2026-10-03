import { supabase } from "@/lib/supabase/client";

/**
 * Parâmetros gerenciais do negócio (item 4.4 da especificação de 03/out/2026).
 * Uma linha por conta mestre (dono) — tabela `config_negocio`, RLS igual a
 * `contas_pagar`: dono e sócio leem/escrevem, funcionário não vê.
 *
 * - `retira_pro_labore = true`: os sócios têm um pró-labore fixo mensal
 *   (`valor_pro_labore`), que entra como saída prevista no fluxo de caixa.
 * - `retira_pro_labore = false`: não existe folha de sócio — o fluxo não cobra
 *   essa linha e não aponta "pró-labore não retirado" como inconsistência.
 *   `modo_sem_pro_labore` diz como os sócios tiram dinheiro:
 *   "esporadicas" (retiradas eventuais de subsistência) ou
 *   "conciliacao_unificada" (custos do dia a dia pagos direto pelo caixa da PJ).
 */
export type ModoSemProLabore = "esporadicas" | "conciliacao_unificada";

export interface ConfigNegocio {
  usuario_id: string;
  retira_pro_labore: boolean;
  valor_pro_labore: number | null;
  modo_sem_pro_labore: ModoSemProLabore | null;
  observacao_retiradas: string | null;
}

/** Valor padrão quando o negócio ainda nunca salvou nada (mantém o
 * comportamento antigo da tela: pró-labore registrado manualmente). */
export function configNegocioPadrao(usuarioId: string): ConfigNegocio {
  return {
    usuario_id: usuarioId,
    retira_pro_labore: true,
    valor_pro_labore: null,
    modo_sem_pro_labore: null,
    observacao_retiradas: null,
  };
}

export async function buscarConfigNegocio(usuarioId: string): Promise<ConfigNegocio> {
  const { data } = await supabase
    .from("config_negocio")
    .select("usuario_id, retira_pro_labore, valor_pro_labore, modo_sem_pro_labore, observacao_retiradas")
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  if (!data) return configNegocioPadrao(usuarioId);
  const linha = data as ConfigNegocio;
  return {
    ...linha,
    valor_pro_labore: linha.valor_pro_labore === null ? null : Number(linha.valor_pro_labore),
  };
}

export async function salvarConfigNegocio(config: ConfigNegocio) {
  const observacao = config.observacao_retiradas?.trim() || null;
  return supabase.from("config_negocio").upsert(
    {
      usuario_id: config.usuario_id,
      retira_pro_labore: config.retira_pro_labore,
      // Quando não retira pró-labore, o valor fixo deixa de existir — e o
      // inverso: o modo/observação só fazem sentido sem pró-labore.
      valor_pro_labore: config.retira_pro_labore ? config.valor_pro_labore : null,
      modo_sem_pro_labore: config.retira_pro_labore ? null : config.modo_sem_pro_labore,
      observacao_retiradas: config.retira_pro_labore ? null : observacao ? observacao.slice(0, 500) : null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "usuario_id" }
  );
}
