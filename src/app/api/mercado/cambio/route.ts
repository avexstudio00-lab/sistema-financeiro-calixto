import { NextResponse } from "next/server";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { obterCambioAoVivo } from "@/lib/mercado/cotacoes";

export const runtime = "nodejs";

/**
 * Câmbio comercial ao vivo pro widget da Empresa (23/nov/2026). Separado de
 * /api/mercado/cotacoes porque o widget pergunta a cada minuto enquanto a
 * tela está aberta — a rota geral tem limite baixo (30/h) por causa do
 * download pesado do Tesouro. Aqui é leve: no máximo uma busca externa por
 * minuto pra todo mundo (cache em `cotacoes_mercado`).
 */
export async function GET(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }

  const { permitido } = await limitarRequisicoes("mercado-cambio", {
    limite: 240,
    janelaSegundos: 3600,
    identificador: autenticado.user.id,
  });
  if (!permitido) {
    return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });
  }

  const cambio = await obterCambioAoVivo(supabaseAdmin());
  return NextResponse.json(cambio, { headers: { "Cache-Control": "no-store" } });
}
