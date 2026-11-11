import { supabase } from "@/lib/supabase/client";
import { aliquotaEfetivaSimples, dasMei, type AnexoSimples, type AtividadeMei } from "@/lib/util/simuladorImpostos";

/**
 * Identificação fiscal da empresa (10/nov/2026) — preenchida uma vez em
 * Minhas empresas e usada no simulador de impostos e no preço sugerido.
 * Fica em config_negocio.regime_fiscal (jsonb) e a meta do mês em
 * config_negocio.meta_faturamento.
 */
export type RegimeFiscal = "mei" | "simples" | "outro";

export interface PerfilFiscal {
  regime: RegimeFiscal;
  atividadeMei: AtividadeMei;
  anexo: AnexoSimples;
  /** "Outro": percentual informado pelo contador. */
  percentual: number;
  /** MEI: quanto paga de DAS de verdade (muda um pouco de mês pra mês). Nulo = calcula. */
  dasValor: number | null;
  /** Margem de lucro padrão do preço sugerido (%). */
  margemPadrao: number;
}

export const PERFIL_FISCAL_PADRAO: PerfilFiscal = {
  regime: "mei",
  atividadeMei: "servicos",
  anexo: "III",
  percentual: 6,
  dasValor: null,
  margemPadrao: 30,
};

export async function buscarPerfilNegocio(usuarioId: string): Promise<{ fiscal: PerfilFiscal | null; meta: number | null }> {
  const { data, error } = await supabase.from("config_negocio").select("regime_fiscal, meta_faturamento").eq("usuario_id", usuarioId).maybeSingle();
  if (error || !data) return { fiscal: null, meta: null };
  const linha = data as { regime_fiscal: Partial<PerfilFiscal> | null; meta_faturamento: number | null };
  const r = linha.regime_fiscal;
  return {
    fiscal: r
      ? {
          regime: (r.regime as RegimeFiscal) ?? "mei",
          atividadeMei: (r.atividadeMei as AtividadeMei) ?? "servicos",
          anexo: (r.anexo as AnexoSimples) ?? "III",
          percentual: Number(r.percentual ?? 6),
          dasValor: r.dasValor != null ? Number(r.dasValor) : null,
          margemPadrao: Number(r.margemPadrao ?? 30),
        }
      : null,
    meta: linha.meta_faturamento != null ? Number(linha.meta_faturamento) : null,
  };
}

export async function salvarPerfilFiscal(usuarioId: string, perfil: PerfilFiscal) {
  const limpo = (n: number, max: number) => (Number.isFinite(n) && n >= 0 && n <= max ? Number(n.toFixed(2)) : 0);
  return supabase.from("config_negocio").upsert(
    {
      usuario_id: usuarioId,
      regime_fiscal: {
        regime: perfil.regime,
        atividadeMei: perfil.atividadeMei,
        anexo: perfil.anexo,
        percentual: limpo(perfil.percentual, 60),
        dasValor: perfil.dasValor != null ? limpo(perfil.dasValor, 5000) : null,
        margemPadrao: limpo(perfil.margemPadrao, 500),
      },
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "usuario_id" }
  );
}

export async function salvarMetaFaturamento(usuarioId: string, meta: number | null) {
  return supabase
    .from("config_negocio")
    .upsert(
      { usuario_id: usuarioId, meta_faturamento: meta != null && meta > 0 ? Number(meta.toFixed(2)) : null, atualizado_em: new Date().toISOString() },
      { onConflict: "usuario_id" }
    );
}

/** DAS que a pessoa já pagou (guias marcadas como pagas), do mais novo pro mais antigo. */
export async function historicoDas(usuarioId: string): Promise<{ vencimento: string; valor: number }[]> {
  const { data } = await supabase
    .from("contas_pagar")
    .select("vencimento, valor")
    .eq("usuario_id", usuarioId)
    .eq("categoria", "das")
    .eq("status", "pago")
    .order("vencimento", { ascending: false })
    .limit(12);
  return ((data as { vencimento: string; valor: number }[] | null) ?? []).map((d) => ({ vencimento: d.vencimento, valor: Number(d.valor) }));
}

/**
 * Quanto do preço vai em imposto (%), pela identificação fiscal:
 *  - MEI: o DAS é fixo por mês; pro preço, pesa DAS ÷ faturamento médio;
 *  - Simples: alíquota efetiva dos últimos 12 meses;
 *  - Outro: o percentual informado.
 */
export function percentualImposto(perfil: PerfilFiscal | null, faturamento12m: number): number {
  if (!perfil) return 0;
  if (perfil.regime === "outro") return perfil.percentual;
  if (perfil.regime === "simples") return aliquotaEfetivaSimples(perfil.anexo, faturamento12m > 0 ? faturamento12m : 0.01);
  const das = perfil.dasValor ?? dasMei(perfil.atividadeMei);
  const media = faturamento12m / 12;
  return media > 0 ? Math.min(30, (das / media) * 100) : 0;
}

/** Preço pra sobrar a margem depois de taxa, imposto e outros custos (% do preço). */
export function precoSugerido(custo: number, percentuais: { taxa: number; imposto: number; margem: number; outros?: number }): number | null {
  const soma = percentuais.taxa + percentuais.imposto + percentuais.margem + (percentuais.outros ?? 0);
  if (!(custo > 0) || soma >= 95) return null;
  return Number((custo / (1 - soma / 100)).toFixed(2));
}

/** Faturamento dos últimos 12 meses (mês atual + 11 anteriores). */
export async function faturamentoUltimos12Meses(usuarioId: string): Promise<number> {
  const { faturamentoAnualPorMes } = await import("./empresa");
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const [este, anterior] = await Promise.all([faturamentoAnualPorMes(usuarioId, ano), faturamentoAnualPorMes(usuarioId, ano - 1)]);
  return [...anterior.filter((p) => p.mesNumero > mes), ...este.filter((p) => p.mesNumero <= mes)].reduce((acc, p) => acc + p.faturamento, 0);
}
