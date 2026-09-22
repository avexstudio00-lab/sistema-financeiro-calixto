import { NextResponse } from "next/server";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { obterCotacaoCdi, obterCotacaoCambio, obterTitulosTesouro } from "@/lib/mercado/cotacoes";
import type { CotacoesMercado } from "@/lib/data/tipos";

export const runtime = "nodejs";
// O download do CSV do Tesouro Direto (dezenas de MB) só acontece quando o
// cache de "tesouro_titulos" passa de 6h (ver PRAZO_CACHE_MS em
// src/lib/mercado/cotacoes.ts) -- nesse momento a resposta pode demorar
// bem mais que o padrão de 10s do plano Hobby, daí o maxDuration maior.
export const maxDuration = 60;

/**
 * Cotações de mercado ao vivo (Bloco 9+10): CDI atual, câmbio USD/EUR e a
 * lista de títulos do Tesouro Direto ainda em oferta -- cada uma cacheada
 * separadamente em `cotacoes_mercado` e só reconferida de verdade quando o
 * cache expira (ver src/lib/mercado/cotacoes.ts). Sem cron nenhum: dispara
 * quando a tela de Investimentos (ou o widget de câmbio da Empresa) carrega.
 *
 * É dado público de mercado, não específico de usuário -- mas a rota ainda
 * exige login (evita virar um proxy anônimo aberto pras 3 APIs externas) e
 * tem rate limit, já que uma delas baixa um arquivo pesado quando expira.
 */
export async function GET(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }
  const { user } = autenticado;

  const { permitido } = await limitarRequisicoes("mercado-cotacoes", {
    limite: 30,
    janelaSegundos: 3600,
    identificador: user.id,
  });
  if (!permitido) {
    return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });
  }

  const admin = supabaseAdmin();
  const [cdi, cambio, tesouro] = await Promise.all([
    obterCotacaoCdi(admin),
    obterCotacaoCambio(admin),
    obterTitulosTesouro(admin),
  ]);

  const corpo: CotacoesMercado = {
    cdi: cdi.valor,
    cdiAtualizadoEm: cdi.atualizadoEm,
    usd: cambio.usd,
    eur: cambio.eur,
    cambioAtualizadoEm: cambio.atualizadoEm,
    titulosTesouro: tesouro.titulos,
    titulosAtualizadoEm: tesouro.atualizadoEm,
  };
  return NextResponse.json(corpo);
}
