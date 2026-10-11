import { NextResponse } from "next/server";
import { z } from "zod";
import {
  COOKIE_AT,
  COOKIE_RT,
  REFRESH_TOKEN_NO_COOKIE,
  buscarUsuario,
  cabecalhosApagarSessao,
  cabecalhosGravarSessao,
  lerCookie,
  modoSessaoCookieAtivo,
  renovarComRefreshToken,
  requisicaoDoMesmoSite,
  sessaoParaNavegador,
  verificarAccessToken,
  verificarAccessTokenDetalhado,
} from "@/lib/auth/sessaoServidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sessão em cookie httpOnly (item 3 da apuração de segurança).
 *
 * GET    → recupera a sessão ao abrir/recarregar o app: devolve o access
 *          token (e o usuário) a partir do cookie. O refresh token NUNCA sai
 *          do servidor — no lugar dele vai um marcador.
 * POST   → guarda no cookie o refresh token recebido logo após um login
 *          (senha, 2FA, link de e-mail). É o único momento em que ele passa
 *          pelo navegador.
 * DELETE → apaga o cookie (logout).
 */

function semCache(resp: NextResponse): NextResponse {
  resp.headers.set("Cache-Control", "no-store");
  return resp;
}

function anexarCookies(resp: NextResponse, cookies: string[]): NextResponse {
  for (const c of cookies) resp.headers.append("Set-Cookie", c);
  return semCache(resp);
}

export async function GET(request: Request) {
  if (!modoSessaoCookieAtivo()) return semCache(NextResponse.json({ sessao: null }));
  const cookies = request.headers.get("cookie");
  const rt = lerCookie(cookies, COOKIE_RT);
  if (!rt) return semCache(NextResponse.json({ sessao: null }));

  // 1) Access token do cookie ainda bom por mais de 2 min: reaproveita.
  const at = lerCookie(cookies, COOKIE_AT);
  if (at) {
    const claims = await verificarAccessToken(at, 120);
    if (claims) {
      const user = await buscarUsuario(at);
      if (user) {
        const agora = Math.floor(Date.now() / 1000);
        return semCache(
          NextResponse.json({
            sessao: {
              access_token: at,
              token_type: "bearer",
              expires_in: claims.exp - agora,
              expires_at: claims.exp,
              refresh_token: REFRESH_TOKEN_NO_COOKIE,
              user,
            },
          })
        );
      }
    }
  }

  // 2) Senão, renova com o refresh token do cookie.
  const r = await renovarComRefreshToken(rt);
  if (r.ok) {
    return anexarCookies(
      NextResponse.json({ sessao: sessaoParaNavegador(r.sessao) }),
      cabecalhosGravarSessao(r.sessao.access_token, r.sessao.refresh_token, r.sessao.expires_in)
    );
  }
  if (r.definitivo) {
    return anexarCookies(NextResponse.json({ sessao: null }), cabecalhosApagarSessao());
  }
  console.error("[auth/sessao] falha passageira ao renovar:", r.status);
  return semCache(NextResponse.json({ erro: "Tente de novo." }, { status: 503 }));
}

const esquemaPost = z
  .object({
    access_token: z.string().min(20).max(8192).optional(),
    refresh_token: z.string().min(6).max(512),
  })
  .strict();

export async function POST(request: Request) {
  if (!modoSessaoCookieAtivo()) return semCache(NextResponse.json({ erro: "Desativado." }, { status: 404 }));
  if (!requisicaoDoMesmoSite(request)) {
    return semCache(NextResponse.json({ erro: "Origem não permitida." }, { status: 403 }));
  }
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return semCache(NextResponse.json({ erro: "Corpo inválido." }, { status: 400 }));
  }
  const dados = esquemaPost.safeParse(corpo);
  if (!dados.success || dados.data.refresh_token === REFRESH_TOKEN_NO_COOKIE) {
    return semCache(NextResponse.json({ erro: "Dados inválidos." }, { status: 400 }));
  }

  // Caminho normal (logo depois do login/2FA): o access token tem que ser
  // legítimo (assinado pelo Supabase e válido) — impede gravar no cookie
  // qualquer coisa vinda de fora.
  if (dados.data.access_token) {
    const v = await verificarAccessTokenDetalhado(dados.data.access_token);
    if (v.estado === "indisponivel") return semCache(NextResponse.json({ erro: "Tente de novo." }, { status: 503 }));
    if (v.estado !== "valido") return semCache(NextResponse.json({ erro: "Não autenticado." }, { status: 401 }));
    const claims = v.claims;
    const expiraEm = claims.exp - Math.floor(Date.now() / 1000);
    return anexarCookies(
      NextResponse.json({ ok: true }),
      cabecalhosGravarSessao(dados.data.access_token, dados.data.refresh_token, expiraEm)
    );
  }

  // Migração de sessão antiga (só refresh token, access token já vencido):
  // o próprio Supabase valida o refresh token ao renová-lo; o par novo vai
  // para o cookie e o navegador recebe a sessão sem o refresh token.
  const r = await renovarComRefreshToken(dados.data.refresh_token);
  if (r.ok) {
    return anexarCookies(
      NextResponse.json({ ok: true, sessao: sessaoParaNavegador(r.sessao) }),
      cabecalhosGravarSessao(r.sessao.access_token, r.sessao.refresh_token, r.sessao.expires_in)
    );
  }
  if (r.definitivo) return semCache(NextResponse.json({ erro: "Sessão expirada." }, { status: 401 }));
  return semCache(NextResponse.json({ erro: "Tente de novo." }, { status: 503 }));
}

export async function DELETE(request: Request) {
  if (!requisicaoDoMesmoSite(request)) {
    return semCache(NextResponse.json({ erro: "Origem não permitida." }, { status: 403 }));
  }
  return anexarCookies(NextResponse.json({ ok: true }), cabecalhosApagarSessao());
}
