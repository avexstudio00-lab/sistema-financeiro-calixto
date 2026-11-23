import { NextResponse } from "next/server";
import { usuarioAutenticadoDaRequisicao, supabaseAdmin } from "@/lib/supabase/admin";
import { limitarRequisicoes, RESPOSTA_RATE_LIMIT } from "@/lib/rateLimit";
import { gerarCodigoVoz, hashCodigoVoz } from "@/lib/voz/token";
import { registrarEventoSeguranca } from "@/lib/auditoria";

export const runtime = "nodejs";

function faltaTabela(erro: { code?: string; message?: string } | null): boolean {
  return !!erro && (erro.code === "42P01" || /voz_tokens/.test(erro.message ?? ""));
}

/**
 * Código pessoal do atalho da Siri (23/nov/2026).
 * GET: diz se a pessoa já tem código (nunca devolve o código).
 * POST: cria um código novo (o antigo para de funcionar) e devolve UMA vez.
 * O usuário vem sempre do JWT — ninguém gera código pra conta de outro.
 */
export async function GET(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  const { data, error } = await supabaseAdmin()
    .from("voz_tokens")
    .select("criado_em, ultimo_uso")
    .eq("usuario_id", autenticado.user.id)
    .maybeSingle();
  if (faltaTabela(error)) return NextResponse.json({ configurado: false, faltaSql: true });
  if (error) {
    console.error("voz/codigo GET:", error);
    return NextResponse.json({ erro: "Falha ao consultar." }, { status: 500 });
  }
  const linha = data as { criado_em: string; ultimo_uso: string | null } | null;
  return NextResponse.json({ configurado: !!linha, criadoEm: linha?.criado_em ?? null, ultimoUso: linha?.ultimo_uso ?? null });
}

export async function POST(request: Request) {
  const autenticado = await usuarioAutenticadoDaRequisicao(request);
  if (!autenticado) return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  const usuarioId = autenticado.user.id;

  const { permitido } = await limitarRequisicoes("voz-codigo", { limite: 10, janelaSegundos: 3600, identificador: usuarioId });
  if (!permitido) return NextResponse.json(RESPOSTA_RATE_LIMIT, { status: 429 });

  const codigo = gerarCodigoVoz();
  const { error } = await supabaseAdmin()
    .from("voz_tokens")
    .upsert({ usuario_id: usuarioId, token_hash: hashCodigoVoz(codigo), criado_em: new Date().toISOString(), ultimo_uso: null }, { onConflict: "usuario_id" });
  if (faltaTabela(error)) return NextResponse.json({ erro: "Falta rodar o SQL do comando de voz no Supabase.", faltaSql: true }, { status: 503 });
  if (error) {
    console.error("voz/codigo POST:", error);
    return NextResponse.json({ erro: "Não foi possível criar o código." }, { status: 500 });
  }
  await registrarEventoSeguranca(usuarioId, "codigo_voz_criado", {});
  return NextResponse.json({ codigo });
}
