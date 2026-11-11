import { supabase } from "@/lib/supabase/client";

/**
 * Taxas da maquininha de cartão (10/nov/2026). O empreendedor preenche UMA
 * vez (Minha empresa → Configurações); a cada venda no débito/crédito o app
 * calcula a taxa, lança como despesa "Taxas de cartão" e o fluxo de caixa
 * mostra quanto foi embora em taxa — pra decidir desconto no Pix, etc.
 *
 * Guardado em config_negocio.taxas_maquininha (jsonb). Valores em %.
 */
export interface TaxasMaquininha {
  nome: string;
  debito: number;
  credito_vista: number;
  /** % por número de parcelas ("2".."12"). Faltando, usa a do crédito à vista. */
  parcelado: Record<string, number>;
  pix: number;
}

export const TAXAS_VAZIAS: TaxasMaquininha = { nome: "", debito: 0, credito_vista: 0, parcelado: {}, pix: 0 };

export async function buscarTaxasMaquininha(usuarioId: string): Promise<TaxasMaquininha | null> {
  const { data, error } = await supabase.from("config_negocio").select("taxas_maquininha").eq("usuario_id", usuarioId).maybeSingle();
  if (error || !data) return null;
  const t = (data as { taxas_maquininha: Partial<TaxasMaquininha> | null }).taxas_maquininha;
  if (!t) return null;
  return {
    nome: String(t.nome ?? ""),
    debito: Number(t.debito ?? 0),
    credito_vista: Number(t.credito_vista ?? 0),
    parcelado: Object.fromEntries(Object.entries(t.parcelado ?? {}).map(([k, v]) => [k, Number(v)])),
    pix: Number(t.pix ?? 0),
  };
}

export async function salvarTaxasMaquininha(usuarioId: string, taxas: TaxasMaquininha) {
  const limpar = (n: number) => (Number.isFinite(n) && n >= 0 && n <= 30 ? Number(n.toFixed(2)) : 0);
  const parcelado: Record<string, number> = {};
  for (let n = 2; n <= 12; n++) {
    const v = taxas.parcelado[String(n)];
    if (v != null && v > 0) parcelado[String(n)] = limpar(v);
  }
  return supabase.from("config_negocio").upsert(
    {
      usuario_id: usuarioId,
      taxas_maquininha: {
        nome: taxas.nome.trim().slice(0, 60),
        debito: limpar(taxas.debito),
        credito_vista: limpar(taxas.credito_vista),
        parcelado,
        pix: limpar(taxas.pix),
      },
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "usuario_id" }
  );
}

/** % da taxa para uma forma/parcelas. */
export function percentualTaxa(taxas: TaxasMaquininha | null, forma: string | null | undefined, parcelas = 1): number {
  if (!taxas) return 0;
  if (forma === "debito") return taxas.debito;
  if (forma === "pix") return taxas.pix;
  if (forma === "credito") {
    if (parcelas <= 1) return taxas.credito_vista;
    return taxas.parcelado[String(parcelas)] ?? taxas.credito_vista;
  }
  return 0;
}

export function calcularTaxa(taxas: TaxasMaquininha | null, forma: string | null | undefined, parcelas: number, valor: number) {
  const percentual = percentualTaxa(taxas, forma, parcelas);
  const taxa = Number(((valor * percentual) / 100).toFixed(2));
  return { percentual, taxa, liquido: Number((valor - taxa).toFixed(2)) };
}
