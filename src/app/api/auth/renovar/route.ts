import { NextResponse } from "next/server";
import {
  CORPO_SEM_SESSAO,
  COOKIE_RT,
  cabecalhosApagarSessao,
  cabecalhosGravarSessao,
  lerCookie,
  modoSessaoCookieAtivo,
  renovarComRefreshToken,
  requisicaoDoMesmoSite,
  sessaoParaNavegador,
} from "@/lib/auth/sessaoServidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Renovação do access token (item 3 da apuração de segurança). O
 * supabase-js do navegador chama `.../auth/v1/token?grant_type=refresh_token`
 * de tempos em tempos; com a sessão em cookie, essa chamada é desviada para
 * cá (ver src/lib/supabase/sessaoCookie.ts). Aqui o servidor lê o refresh
 * token do cookie httpOnly, renova no Supabase, grava o par novo no cookie e
 * devolve a resposta no MESMO formato do Supabase — só que sem o refresh
 * token de verdade.
 */
export async function POST(request: Request) {
  const semCache = { "Cache-Control": "no-store" };
  if (!modoSessaoCookieAtivo() || !requisicaoDoMesmoSite(request)) {
    return NextResponse.json(CORPO_SEM_SESSAO, { status: 400, headers: semCache });
  }
  const rt = lerCookie(request.headers.get("cookie"), COOKIE_RT);
  if (!rt) return NextResponse.json(CORPO_SEM_SESSAO, { status: 400, headers: semCache });

  const r = await renovarComRefreshToken(rt);
  if (r.ok) {
    const resp = NextResponse.json(sessaoParaNavegador(r.sessao), { headers: semCache });
    for (const c of cabecalhosGravarSessao(r.sessao.access_token, r.sessao.refresh_token, r.sessao.expires_in)) {
      resp.headers.append("Set-Cookie", c);
    }
    return resp;
  }

  if (r.definitivo) {
    const resp = NextResponse.json(r.corpo ?? CORPO_SEM_SESSAO, { status: r.status, headers: semCache });
    for (const c of cabecalhosApagarSessao()) resp.headers.append("Set-Cookie", c);
    return resp;
  }
  // Falha passageira (rede, limite de requisições do Supabase etc.): sempre
  // 503, que o supabase-js trata como "tentar de novo". Repassar um 429, por
  // exemplo, faria o supabase-js deslogar a pessoa com o refresh token bom.
  console.error("[auth/renovar] falha passageira:", r.status);
  return NextResponse.json(
    { error: "temporarily_unavailable", error_description: "Tente de novo." },
    { status: 503, headers: semCache }
  );
}
