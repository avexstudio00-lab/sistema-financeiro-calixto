/**
 * Sessão em cookie httpOnly — lado NAVEGADOR (item 3 da apuração de
 * segurança de 10/out/2026). Par de src/lib/auth/sessaoServidor.ts.
 *
 * Antes: o supabase-js guardava a sessão inteira (access + refresh token) no
 * localStorage — qualquer script injetado na página (XSS) conseguia copiar
 * o refresh token e entrar na conta da pessoa por semanas.
 *
 * Agora (com NEXT_PUBLIC_SESSAO_COOKIE=1):
 *  - `armazenamentoSessao` guarda a sessão SÓ EM MEMÓRIA, com o refresh
 *    token trocado por um marcador. O refresh token real vai para o cookie
 *    httpOnly via POST /api/auth/sessao no instante em que o login acontece.
 *  - Ao abrir/recarregar o app, a sessão é recuperada com GET
 *    /api/auth/sessao (o servidor lê o cookie).
 *  - `fetchSessaoCookie` desvia a renovação automática do supabase-js
 *    (`/auth/v1/token?grant_type=refresh_token`) para /api/auth/renovar.
 *  - Na primeira visita com a chave ligada, uma sessão antiga que ainda
 *    esteja no localStorage é migrada para o cookie e apagada de lá — quem
 *    já estava logado continua logado.
 */

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wtkwsyvjtnxpoopdniwq.supabase.co";

export const MODO_SESSAO_COOKIE = process.env.NEXT_PUBLIC_SESSAO_COOKIE === "1";

const REFRESH_TOKEN_NO_COOKIE = "sessao-em-cookie-httponly";
/** Mesma chave que o supabase-js usaria por padrão (sb-<ref>-auth-token). */
export const CHAVE_SESSAO = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

type SessaoGuardada = {
  access_token?: string;
  refresh_token?: string;
  [k: string]: unknown;
};

let sessaoEmMemoria: string | null = null;
// true depois que já perguntamos ao servidor nesta carga da página.
let jaConsultouServidor = false;
let consultaEmAndamento: Promise<string | null> | null = null;
// Muda a cada login/logout: uma consulta antiga ao servidor nunca sobrescreve
// algo que aconteceu depois dela.
let versao = 0;
// Depois de uma falha passageira (servidor/rede fora), espera um pouco antes
// de perguntar de novo — senão cada leitura de dados repetiria a consulta.
let proximaConsultaPermitidaEm = 0;

function noNavegador(): boolean {
  return typeof window !== "undefined";
}

function localStorageSeguro(): Storage | null {
  try {
    return noNavegador() ? window.localStorage : null;
  } catch {
    return null;
  }
}

type ResultadoEnvio = { estado: "ok"; sessaoDoServidor: SessaoGuardada | null } | { estado: "definitivo" | "passageiro" };

/** Manda o refresh token para o cookie httpOnly. Com access token válido, o
 * servidor só confere e guarda; sem ele (migração de sessão antiga), o
 * servidor valida renovando e devolve a sessão nova. */
async function enviarRefreshTokenParaCookie(sessao: SessaoGuardada): Promise<ResultadoEnvio> {
  try {
    const resp = await fetch("/api/auth/sessao", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        sessao.access_token
          ? { access_token: sessao.access_token, refresh_token: sessao.refresh_token }
          : { refresh_token: sessao.refresh_token }
      ),
    });
    if (resp.ok) {
      const corpo = (await resp.json().catch(() => ({}))) as { sessao?: SessaoGuardada | null };
      return { estado: "ok", sessaoDoServidor: corpo.sessao ?? null };
    }
    return { estado: resp.status >= 500 || resp.status === 429 ? "passageiro" : "definitivo" };
  } catch {
    return { estado: "passageiro" };
  }
}

type ResultadoBusca = { valor: string | null; definitivo: boolean };

async function buscarSessaoNoServidor(): Promise<ResultadoBusca> {
  // Migração: sessão antiga ainda no localStorage (de antes da chave ligar).
  // O access token antigo provavelmente já venceu — por isso o servidor
  // valida pelo refresh token (renovando), não pelo access token.
  const ls = localStorageSeguro();
  const antiga = ls?.getItem(CHAVE_SESSAO);
  if (antiga) {
    let sessao: SessaoGuardada | null = null;
    try {
      sessao = JSON.parse(antiga) as SessaoGuardada;
    } catch {
      sessao = null;
    }
    if (sessao?.refresh_token && sessao.refresh_token !== REFRESH_TOKEN_NO_COOKIE) {
      const r = await enviarRefreshTokenParaCookie({ refresh_token: sessao.refresh_token });
      if (r.estado === "passageiro") return { valor: null, definitivo: false }; // tenta na próxima
      ls?.removeItem(CHAVE_SESSAO); // ok ou recusado: o token sai do localStorage de vez
      if (r.estado === "ok" && r.sessaoDoServidor) {
        return { valor: JSON.stringify(r.sessaoDoServidor), definitivo: true };
      }
    } else {
      ls?.removeItem(CHAVE_SESSAO);
    }
  }

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const resp = await fetch("/api/auth/sessao", { credentials: "same-origin", cache: "no-store" });
      if (resp.ok) {
        const corpo = (await resp.json()) as { sessao: SessaoGuardada | null };
        return { valor: corpo.sessao ? JSON.stringify(corpo.sessao) : null, definitivo: true };
      }
      if (resp.status !== 503) return { valor: null, definitivo: true };
    } catch {
      // sem rede — tenta mais uma vez
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  // Falha passageira: NÃO marca como consultado — a próxima leitura tenta de novo.
  return { valor: null, definitivo: false };
}

// Várias abas: cada uma tem a sessão só em memória. Quando uma aba entra,
// sai ou troca de conta, as outras esquecem a cópia delas e releem do
// servidor (pelo cookie, que é compartilhado).
const CANAL_ABAS = "calixto-sessao-cookie";
let canalAbas: BroadcastChannel | null = null;
function canal(): BroadcastChannel | null {
  if (canalAbas || !noNavegador() || typeof BroadcastChannel === "undefined") return canalAbas;
  try {
    canalAbas = new BroadcastChannel(CANAL_ABAS);
    canalAbas.onmessage = () => {
      versao++;
      sessaoEmMemoria = null;
      jaConsultouServidor = false;
    };
  } catch {
    canalAbas = null;
  }
  return canalAbas;
}
function avisarOutrasAbas() {
  try {
    canal()?.postMessage({ tipo: "sessao-mudou", em: Date.now() });
  } catch {
    // sem canal: as outras abas se acertam no próximo recarregamento
  }
}

/** Storage do supabase-js: só a chave da sessão é tratada aqui; qualquer
 * outra (ex.: code verifier do PKCE) continua no localStorage normal. */
export const armazenamentoSessao = {
  async getItem(chave: string): Promise<string | null> {
    if (chave !== CHAVE_SESSAO) return localStorageSeguro()?.getItem(chave) ?? null;
    canal();
    if (sessaoEmMemoria !== null || jaConsultouServidor || !noNavegador()) return sessaoEmMemoria;
    if (!consultaEmAndamento && Date.now() < proximaConsultaPermitidaEm) return null;
    if (!consultaEmAndamento) {
      const versaoNoInicio = versao;
      consultaEmAndamento = buscarSessaoNoServidor().then(({ valor, definitivo }) => {
        // Se um login/logout aconteceu enquanto consultávamos, ele vence.
        if (versao === versaoNoInicio) {
          sessaoEmMemoria = valor;
          if (definitivo) jaConsultouServidor = true;
          else proximaConsultaPermitidaEm = Date.now() + 15_000;
        }
        consultaEmAndamento = null;
        return sessaoEmMemoria;
      });
    }
    return consultaEmAndamento;
  },

  async setItem(chave: string, valor: string): Promise<void> {
    if (chave !== CHAVE_SESSAO) {
      localStorageSeguro()?.setItem(chave, valor);
      return;
    }
    versao++;
    let sessao: SessaoGuardada;
    try {
      sessao = JSON.parse(valor) as SessaoGuardada;
    } catch {
      return;
    }
    // Refresh token de verdade (acabou de logar, confirmar 2FA, link de
    // e-mail): vai para o cookie e some do JavaScript. Se o cookie não puder
    // ser gravado, o login FALHA (erro) em vez de seguir com uma sessão que
    // o servidor não reconhece — isso evitaria o vai-e-volta entre /login e
    // /dashboard (o middleware barraria toda página).
    if (sessao.refresh_token && sessao.refresh_token !== REFRESH_TOKEN_NO_COOKIE) {
      let r = await enviarRefreshTokenParaCookie(sessao);
      if (r.estado === "passageiro") r = await enviarRefreshTokenParaCookie(sessao);
      if (r.estado !== "ok") {
        throw new Error("Não foi possível iniciar a sessão segura. Tente de novo em instantes.");
      }
      sessao = { ...sessao, refresh_token: REFRESH_TOKEN_NO_COOKIE };
      avisarOutrasAbas();
    }
    localStorageSeguro()?.removeItem(CHAVE_SESSAO);
    sessaoEmMemoria = JSON.stringify(sessao);
    jaConsultouServidor = true;
  },

  async removeItem(chave: string): Promise<void> {
    if (chave !== CHAVE_SESSAO) {
      localStorageSeguro()?.removeItem(chave);
      return;
    }
    versao++;
    sessaoEmMemoria = null;
    jaConsultouServidor = true;
    localStorageSeguro()?.removeItem(CHAVE_SESSAO);
    try {
      await fetch("/api/auth/sessao", { method: "DELETE", credentials: "same-origin" });
    } catch {
      // sem rede: o cookie expira sozinho; o refresh token já foi revogado
      // no servidor pelo signOut (scope global) quando havia rede.
    }
    avisarOutrasAbas();
  },
};

const URL_RENOVACAO = `${SUPABASE_URL}/auth/v1/token`;

function urlDe(entrada: RequestInfo | URL): string {
  if (typeof entrada === "string") return entrada;
  if (entrada instanceof URL) return entrada.href;
  return entrada.url;
}

/** fetch do supabase-js: só a renovação de token é desviada. */
export const fetchSessaoCookie: typeof fetch = (entrada, init) => {
  const url = urlDe(entrada);
  if (url.startsWith(URL_RENOVACAO) && url.includes("grant_type=refresh_token")) {
    return fetch("/api/auth/renovar", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: init?.signal,
    });
  }
  return fetch(entrada, init);
};
