/**
 * Sessão em cookie httpOnly — lado SERVIDOR (itens 3 e 5 da apuração de
 * segurança de 10/out/2026).
 *
 * Como funciona, em uma frase: o refresh token (a credencial de longa
 * duração, que mantém a pessoa logada por semanas) passa a morar SÓ num
 * cookie httpOnly, que o JavaScript da página não consegue ler. O navegador
 * guarda apenas o access token (vale ~1 h) em memória. Toda renovação passa
 * por /api/auth/renovar, que lê o cookie no servidor.
 *
 * Este arquivo usa só APIs Web (fetch, crypto.subtle, Headers) — roda tanto
 * no middleware (Edge) quanto nas rotas de API (Node).
 *
 * Tudo isto só vale com NEXT_PUBLIC_SESSAO_COOKIE=1 na Vercel (chave
 * liga/desliga). Desligado, o app funciona exatamente como antes.
 */

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wtkwsyvjtnxpoopdniwq.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a3dzeXZqdG54cG9vcGRuaXdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2Nzg3NzksImV4cCI6MjEwMzI1NDc3OX0.3UsGLu-z8lMSA96NqGTQbsVqjrzTiWhmrKrbSb9uuT8";

export function modoSessaoCookieAtivo(): boolean {
  return process.env.NEXT_PUBLIC_SESSAO_COOKIE === "1";
}

/** Valor que o navegador vê no lugar do refresh token de verdade. */
export const REFRESH_TOKEN_NO_COOKIE = "sessao-em-cookie-httponly";

const PRODUCAO = process.env.NODE_ENV === "production";
// Prefixo __Host-: o navegador só aceita o cookie se for Secure, Path=/ e
// sem Domain — ninguém consegue sobrescrevê-lo a partir de um subdomínio.
export const COOKIE_RT = PRODUCAO ? "__Host-calixto-rt" : "calixto-rt";
export const COOKIE_AT = PRODUCAO ? "__Host-calixto-at" : "calixto-at";
const DURACAO_RT_SEGUNDOS = 60 * 60 * 24 * 30; // 30 dias, renovado a cada uso

function atributosCookie(maxAge: number): string {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${PRODUCAO ? "; Secure" : ""}`;
}

export function cabecalhosGravarSessao(accessToken: string, refreshToken: string, expiresIn: number): string[] {
  return [
    `${COOKIE_RT}=${encodeURIComponent(refreshToken)}; ${atributosCookie(DURACAO_RT_SEGUNDOS)}`,
    `${COOKIE_AT}=${encodeURIComponent(accessToken)}; ${atributosCookie(Math.max(60, Math.floor(expiresIn)))}`,
  ];
}

export function cabecalhosApagarSessao(): string[] {
  return [`${COOKIE_RT}=; ${atributosCookie(0)}`, `${COOKIE_AT}=; ${atributosCookie(0)}`];
}

export function lerCookie(cabecalhoCookie: string | null, nome: string): string | null {
  if (!cabecalhoCookie) return null;
  for (const parte of cabecalhoCookie.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) {
      const valor = parte.slice(i + 1).trim();
      try {
        return valor ? decodeURIComponent(valor) : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Proteção contra CSRF nas rotas que GRAVAM/APAGAM o cookie: só aceita
 * chamada vinda do próprio site. (O cookie já é SameSite=Lax; isto é a
 * segunda camada.)
 */
export function requisicaoDoMesmoSite(request: Request): boolean {
  const origem = request.headers.get("origin");
  if (origem) {
    try {
      return origem === new URL(request.url).origin;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

// ---------------------------------------------------------------------
// Verificação local do JWT (ES256, chaves públicas do próprio Supabase)
// ---------------------------------------------------------------------

export interface ClaimsJwt {
  sub: string;
  exp: number;
  role?: string;
  aal?: string;
  session_id?: string;
  iss?: string;
}

type Jwk = JsonWebKey & { kid?: string; alg?: string };
let cacheJwks: { chaves: Jwk[]; em: number } | null = null;

async function chavesPublicas(): Promise<Jwk[]> {
  if (cacheJwks && Date.now() - cacheJwks.em < 10 * 60 * 1000) return cacheJwks.chaves;
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, {
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  if (!resp.ok) throw new Error(`JWKS ${resp.status}`);
  const corpo = (await resp.json()) as { keys?: Jwk[] };
  cacheJwks = { chaves: corpo.keys ?? [], em: Date.now() };
  return cacheJwks.chaves;
}

function base64UrlParaBytes(texto: string): Uint8Array {
  const b64 = texto.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texto.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodificarParte<T>(parte: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlParaBytes(parte))) as T;
  } catch {
    return null;
  }
}

/** Lê as claims SEM verificar assinatura — só para quem já confiou no token por outro meio. */
export function claimsSemVerificar(token: string): ClaimsJwt | null {
  const partes = token.split(".");
  return partes.length === 3 ? decodificarParte<ClaimsJwt>(partes[1]) : null;
}

export type ResultadoVerificacao =
  | { estado: "valido"; claims: ClaimsJwt }
  | { estado: "invalido" }
  | { estado: "indisponivel" }; // não deu para conferir agora (rede/Supabase)

/**
 * Verifica assinatura (ES256 via JWKS), validade e papel "authenticated".
 * Tokens assinados com o segredo antigo (HS256), ou JWKS fora do ar, caem
 * na validação pela rede (/auth/v1/user). Diferencia "token ruim" de "não
 * deu para conferir" — o segundo vira 503 (tentar de novo), nunca 401.
 */
export async function verificarAccessTokenDetalhado(token: string, margemSegundos = 0): Promise<ResultadoVerificacao> {
  const partes = token.split(".");
  if (partes.length !== 3) return { estado: "invalido" };
  const cabecalho = decodificarParte<{ alg?: string; kid?: string }>(partes[0]);
  const claims = decodificarParte<ClaimsJwt>(partes[1]);
  if (!cabecalho || !claims || !claims.sub || typeof claims.exp !== "number") return { estado: "invalido" };
  if (claims.exp - margemSegundos <= Math.floor(Date.now() / 1000)) return { estado: "invalido" };
  if (claims.role !== "authenticated") return { estado: "invalido" };

  if (cabecalho.alg === "ES256") {
    try {
      let chave = (await chavesPublicas()).find((k) => k.kid === cabecalho.kid);
      if (!chave) {
        cacheJwks = null; // chave nova (rotação) — busca de novo uma vez
        chave = (await chavesPublicas()).find((k) => k.kid === cabecalho.kid);
      }
      if (!chave) return { estado: "invalido" };
      const chaveCrypto = await crypto.subtle.importKey(
        "jwk",
        { kty: chave.kty, crv: chave.crv, x: chave.x, y: chave.y, ext: true },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
      );
      const ok = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        chaveCrypto,
        base64UrlParaBytes(partes[2]).buffer as ArrayBuffer,
        new TextEncoder().encode(`${partes[0]}.${partes[1]}`)
      );
      return ok ? { estado: "valido", claims } : { estado: "invalido" };
    } catch {
      // JWKS fora do ar: cai para a validação pela rede abaixo.
    }
  }
  const r = await buscarUsuarioDetalhado(token);
  if (r.estado === "ok") return { estado: "valido", claims };
  return r.estado === "recusado" ? { estado: "invalido" } : { estado: "indisponivel" };
}

/** Versão simples: claims se válido, null caso contrário (inclusive indisponível). */
export async function verificarAccessToken(token: string, margemSegundos = 0): Promise<ClaimsJwt | null> {
  const r = await verificarAccessTokenDetalhado(token, margemSegundos);
  return r.estado === "valido" ? r.claims : null;
}

type ResultadoUsuario =
  | { estado: "ok"; usuario: Record<string, unknown> }
  | { estado: "recusado" }
  | { estado: "erro" };

async function buscarUsuarioDetalhado(accessToken: string): Promise<ResultadoUsuario> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (resp.ok) return { estado: "ok", usuario: (await resp.json()) as Record<string, unknown> };
    return resp.status === 401 || resp.status === 403 ? { estado: "recusado" } : { estado: "erro" };
  } catch {
    return { estado: "erro" };
  }
}

export async function buscarUsuario(accessToken: string): Promise<Record<string, unknown> | null> {
  const r = await buscarUsuarioDetalhado(accessToken);
  return r.estado === "ok" ? r.usuario : null;
}

// ---------------------------------------------------------------------
// Renovação com o refresh token do cookie
// ---------------------------------------------------------------------

export interface SessaoSupabase {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
  user: Record<string, unknown>;
  [k: string]: unknown;
}

export type ResultadoRenovacao =
  | { ok: true; sessao: SessaoSupabase }
  | { ok: false; status: number; corpo: unknown; definitivo: boolean };

/**
 * Troca o refresh token por uma sessão nova direto no Supabase.
 * `definitivo: true` = token recusado (expirado/revogado/usado): apagar o
 * cookie. `false` = falha passageira (rede, 5xx, limite): manter o cookie.
 */
export async function renovarComRefreshToken(refreshToken: string): Promise<ResultadoRenovacao> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store",
    });
    const corpo = await resp.json().catch(() => ({}));
    if (resp.ok && corpo && typeof corpo.access_token === "string" && typeof corpo.refresh_token === "string") {
      const sessao = corpo as SessaoSupabase;
      if (!sessao.expires_at) sessao.expires_at = Math.floor(Date.now() / 1000) + Number(sessao.expires_in || 3600);
      return { ok: true, sessao };
    }
    return { ok: false, status: resp.status, corpo, definitivo: resp.status === 400 || resp.status === 401 || resp.status === 403 };
  } catch (e) {
    return { ok: false, status: 503, corpo: { error: "network_error", error_description: String(e) }, definitivo: false };
  }
}

/** Sessão no formato que o supabase-js espera, sem o refresh token real. */
export function sessaoParaNavegador(sessao: SessaoSupabase): SessaoSupabase {
  return { ...sessao, refresh_token: REFRESH_TOKEN_NO_COOKIE };
}

/** Resposta de "refresh token inexistente" no MESMO formato do Supabase — o
 * supabase-js entende e encerra a sessão de forma limpa. */
export const CORPO_SEM_SESSAO = {
  error: "invalid_grant",
  error_description: "Refresh Token Not Found",
  code: "refresh_token_not_found",
};
