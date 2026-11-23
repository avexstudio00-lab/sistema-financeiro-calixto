import { supabase } from "@/lib/supabase/client";
import type { CotacoesMercado } from "./tipos";

const VAZIO: CotacoesMercado = {
  cdi: null,
  cdiAtualizadoEm: null,
  usd: null,
  eur: null,
  cambioAtualizadoEm: null,
  titulosTesouro: [],
  titulosAtualizadoEm: null,
  poupanca: null,
  poupancaAtualizadoEm: null,
};

/**
 * Busca as cotações de mercado ao vivo (CDI, câmbio USD/EUR, títulos do
 * Tesouro Direto) via /api/mercado/cotacoes -- nunca lança erro: se a
 * sessão não existir ou a chamada falhar, devolve tudo `null`/vazio, e
 * quem usa (InvestimentoCard, NovoInvestimentoModal, CambioConversor) cai
 * pro comportamento sem cotação ao vivo (cálculo legado por taxa digitada,
 * ou o widget de câmbio simplesmente não aparece).
 */
export async function obterCotacoesMercado(): Promise<CotacoesMercado> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return VAZIO;

    const resposta = await fetch("/api/mercado/cotacoes", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!resposta.ok) return VAZIO;
    return (await resposta.json()) as CotacoesMercado;
  } catch {
    return VAZIO;
  }
}

export type { ResultadoCambioAoVivo } from "@/lib/mercado/cotacoes";
import type { ResultadoCambioAoVivo } from "@/lib/mercado/cotacoes";

/** Câmbio comercial ao vivo (USD/EUR) — usado pelo widget da Empresa, que
 * pergunta de novo a cada minuto. Nunca lança erro: devolve null. */
export async function obterCambioAoVivo(): Promise<ResultadoCambioAoVivo | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;
    const resposta = await fetch("/api/mercado/cambio", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    if (!resposta.ok) return null;
    return (await resposta.json()) as ResultadoCambioAoVivo;
  } catch {
    return null;
  }
}
