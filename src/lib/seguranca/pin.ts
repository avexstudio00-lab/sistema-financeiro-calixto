/**
 * PIN de acesso ao app (Fase 1, item 3.1 da especificação de 03/out/2026).
 *
 * Tudo aqui é LOCAL ao aparelho: o PIN nunca sai do navegador e nunca vai
 * pro Supabase. Guardamos só um hash PBKDF2-SHA256 (210 mil iterações) com
 * salt aleatório de 16 bytes, por usuário (`calixto:seg:<userId>`), assim
 * duas contas no mesmo navegador têm PINs independentes.
 *
 * Limite honesto: é uma barreira visual contra quem pega o aparelho
 * desbloqueado. Quem tem acesso às ferramentas de desenvolvedor do
 * navegador pode apagar o armazenamento local — mas aí perde também a
 * sessão de login e cai na tela de senha da conta.
 */

export const TEMPOS_DESBLOQUEIO = [
  { minutos: 0, rotulo: "Imediatamente" },
  { minutos: 1, rotulo: "1 minuto" },
  { minutos: 5, rotulo: "5 minutos" },
  { minutos: 15, rotulo: "15 minutos" },
  { minutos: 30, rotulo: "30 minutos" },
] as const;

export const MAX_TENTATIVAS = 5;
const ESPERA_INICIAL_MS = 5 * 60 * 1000;
const ITERACOES = 210_000;

export interface ConfigPin {
  v: 1;
  salt: string;
  hash: string;
  iteracoes: number;
  digitos: number;
  /** "Manter desbloqueado por" em minutos (0 = bloqueia ao sair do app). */
  minutos: number;
  /** Credenciais biométricas cadastradas NESTE aparelho (ids base64url). */
  biometria: string[];
}

interface EstadoTentativas {
  falhas: number;
  nivel: number;
  bloqueadoAte: number;
}

const chaveConfig = (uid: string) => `calixto:seg:${uid}`;
const chaveTentativas = (uid: string) => `calixto:seg-tent:${uid}`;
const chaveDesbloqueio = (uid: string) => `calixto:seg-ok:${uid}`;
const chaveAtividade = (uid: string) => `calixto:seg-ativ:${uid}`;

function ler<T>(chave: string): T | null {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : null;
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* armazenamento indisponível (aba anônima cheia etc.) */
  }
}

function apagar(chave: string) {
  try {
    localStorage.removeItem(chave);
  } catch {
    /* idem */
  }
}

function paraB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function deB64(texto: string): Uint8Array<ArrayBuffer> {
  const bruto = atob(texto);
  const arr = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) arr[i] = bruto.charCodeAt(i);
  return arr;
}

async function derivar(pin: string, salt: Uint8Array<ArrayBuffer>, iteracoes: number): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iteracoes }, chave, 256);
  return paraB64(bits);
}

/** Comparação sem atalho (tempo constante em relação ao conteúdo). */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export function pinValido(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export function lerConfigPin(uid: string): ConfigPin | null {
  const c = ler<ConfigPin>(chaveConfig(uid));
  return c && c.v === 1 && c.hash && c.salt ? { ...c, biometria: c.biometria ?? [] } : null;
}

export async function definirPin(uid: string, pin: string, minutos?: number): Promise<void> {
  if (!pinValido(pin)) throw new Error("O PIN precisa ter de 4 a 6 números.");
  const atual = lerConfigPin(uid);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(pin, salt, ITERACOES);
  gravar(chaveConfig(uid), {
    v: 1,
    salt: paraB64(salt),
    hash,
    iteracoes: ITERACOES,
    digitos: pin.length,
    minutos: minutos ?? atual?.minutos ?? 1,
    biometria: atual?.biometria ?? [],
  } satisfies ConfigPin);
  apagar(chaveTentativas(uid));
  marcarDesbloqueado(uid);
}

export async function conferirPin(uid: string, pin: string): Promise<boolean> {
  const c = lerConfigPin(uid);
  if (!c) return false;
  const hash = await derivar(pin, deB64(c.salt), c.iteracoes);
  return iguais(hash, c.hash);
}

export function removerPin(uid: string) {
  apagar(chaveConfig(uid));
  apagar(chaveTentativas(uid));
  apagar(chaveDesbloqueio(uid));
  apagar(chaveAtividade(uid));
}

export function atualizarConfigPin(uid: string, parcial: Partial<Pick<ConfigPin, "minutos" | "biometria">>) {
  const c = lerConfigPin(uid);
  if (!c) return;
  gravar(chaveConfig(uid), { ...c, ...parcial });
}

// ---------------------------------------------------------------------------
// Tentativas erradas — persistidas, então recarregar a página não zera.
// ---------------------------------------------------------------------------

export function lerTentativas(uid: string): EstadoTentativas {
  return ler<EstadoTentativas>(chaveTentativas(uid)) ?? { falhas: 0, nivel: 0, bloqueadoAte: 0 };
}

/** Registra uma falha. Na 5ª seguida, congela por 5 min, depois 10, 20, 40… */
export function registrarFalha(uid: string): EstadoTentativas {
  const t = lerTentativas(uid);
  const falhas = t.falhas + 1;
  let novo: EstadoTentativas = { ...t, falhas };
  if (falhas >= MAX_TENTATIVAS) {
    const espera = ESPERA_INICIAL_MS * Math.pow(2, t.nivel);
    novo = { falhas: 0, nivel: t.nivel + 1, bloqueadoAte: Date.now() + espera };
  }
  gravar(chaveTentativas(uid), novo);
  return novo;
}

export function zerarTentativas(uid: string) {
  apagar(chaveTentativas(uid));
}

// ---------------------------------------------------------------------------
// Estado de desbloqueio + "Manter desbloqueado por".
// ---------------------------------------------------------------------------

export function marcarDesbloqueado(uid: string) {
  gravar(chaveDesbloqueio(uid), { em: Date.now() });
  registrarAtividade(uid);
}

export function bloquearAgora(uid: string) {
  apagar(chaveDesbloqueio(uid));
}

export function registrarAtividade(uid: string) {
  gravar(chaveAtividade(uid), Date.now());
}

/** Precisa pedir o PIN agora? (PIN ativo e sem desbloqueio válido.) */
export function precisaDesbloquear(uid: string): boolean {
  const c = lerConfigPin(uid);
  if (!c) return false;
  const ok = ler<{ em: number }>(chaveDesbloqueio(uid));
  if (!ok) return true;
  const ultima = ler<number>(chaveAtividade(uid)) ?? ok.em;
  // "Imediatamente": o PinGate apaga o desbloqueio assim que o app sai da
  // tela (troca de aba/app, recarregar, fechar). Com o app aberto e parado,
  // ainda bloqueia sozinho depois de 5 minutos sem nenhum toque.
  const toleranciaMs = c.minutos <= 0 ? 5 * 60 * 1000 : c.minutos * 60 * 1000;
  return Date.now() - ultima > toleranciaMs;
}
