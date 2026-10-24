import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_AT, COOKIE_RT, cabecalhosApagarSessao, modoSessaoCookieAtivo, verificarAccessToken } from "@/lib/auth/sessaoServidor";

/**
 * Item 5 da apuração de segurança (10/out/2026): proteção de rotas NO
 * SERVIDOR. Antes, /dashboard só redirecionava para /login depois que o
 * JavaScript carregava no navegador. Agora o próprio servidor da Vercel
 * confere o cookie httpOnly da sessão antes de entregar qualquer página
 * do painel:
 *   - access token válido (assinatura conferida localmente, sem ir à rede)
 *     → segue;
 *   - access token vencido mas refresh token no cookie → segue (o app
 *     renova pelo /api/auth/renovar);
 *   - nada disso → 307 para /login?proximo=<página pedida>.
 *
 * Depende da sessão em cookie (item 3): só age com NEXT_PUBLIC_SESSAO_COOKIE=1.
 * Os DADOS continuam protegidos pelo RLS do banco em qualquer caso — isto
 * impede que a casca do painel seja entregue a quem não está logado.
 */
// Next.js 16: o arquivo "middleware" passou a se chamar "proxy" (mesma função,
// mesmo matcher). Diferença: o proxy roda no runtime Node.js (o middleware
// rodava no Edge). Este código só usa APIs Web (fetch, crypto.subtle), que
// existem nos dois — o comportamento de segurança é o mesmo.
export async function proxy(request: NextRequest) {
  if (!modoSessaoCookieAtivo()) return NextResponse.next();

  const at = request.cookies.get(COOKIE_AT)?.value;
  if (at && (await verificarAccessToken(at, 30))) return NextResponse.next();

  // Access token vencido mas refresh token presente: deixa passar SEM
  // renovar aqui. A renovação fica só com o app no navegador (que faz uma
  // de cada vez); renovar em paralelo nos prefetches poderia perder um
  // cookie rotacionado e fazer o Supabase revogar a sessão inteira. A casca
  // da página não tem dado — os dados só saem com token válido (RLS).
  const rt = request.cookies.get(COOKIE_RT)?.value;
  if (rt) return NextResponse.next();

  const destino = request.nextUrl.clone();
  destino.pathname = "/login";
  destino.search = "";
  destino.searchParams.set("proximo", request.nextUrl.pathname);
  const resp = NextResponse.redirect(destino);
  if (rt || at) for (const c of cabecalhosApagarSessao()) resp.headers.append("Set-Cookie", c);
  resp.headers.set("Cache-Control", "no-store");
  return resp;
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/onboarding", "/onboarding/:path*"],
};
