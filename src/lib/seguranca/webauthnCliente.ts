import { supabase } from "@/lib/supabase/client";

/**
 * Lado do navegador do WebAuthn (Fase 1, item 3.2): chama
 * `navigator.credentials.create/get` com as opções que o servidor gerou e
 * devolve a resposta pra ele conferir. Erros viram mensagens amigáveis; o
 * cancelamento pela própria pessoa é sinalizado à parte (`cancelado`), pra
 * tela voltar pro PIN sem mostrar erro.
 */

export class ErroBiometria extends Error {
  constructor(mensagem: string, public cancelado = false) {
    super(mensagem);
  }
}

function paraB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deB64url(texto: string): ArrayBuffer {
  const base64 = texto.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texto.length + 3) % 4);
  const bruto = atob(base64);
  const arr = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) arr[i] = bruto.charCodeAt(i);
  return arr.buffer;
}

export function navegadorSuportaWebAuthn(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}

/** Tem leitor biométrico/Windows Hello disponível neste aparelho? */
export async function biometriaDisponivel(): Promise<boolean> {
  if (!navegadorSuportaWebAuthn()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

async function chamarApi(caminho: string, corpo: unknown): Promise<any> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new ErroBiometria("Sessão expirada. Entre de novo.");
  const resposta = await fetch(caminho, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(corpo),
  });
  const json = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new ErroBiometria(json?.erro ?? "Não foi possível falar com o servidor.");
  return json;
}

function traduzirErro(e: unknown): ErroBiometria {
  if (e instanceof ErroBiometria) return e;
  const nome = e instanceof DOMException ? e.name : "";
  if (nome === "NotAllowedError" || nome === "AbortError") {
    return new ErroBiometria("Leitura cancelada ou não reconhecida.", true);
  }
  if (nome === "InvalidStateError") return new ErroBiometria("Este aparelho já está cadastrado.");
  if (nome === "NotSupportedError") return new ErroBiometria("Este navegador não suporta biometria.");
  if (nome === "SecurityError") return new ErroBiometria("Biometria bloqueada por segurança neste endereço.");
  return new ErroBiometria("Não foi possível usar a biometria agora.");
}

/** Cadastra a biometria deste aparelho. Devolve o id da credencial. */
export async function cadastrarBiometria(apelido?: string): Promise<string> {
  if (!navegadorSuportaWebAuthn()) throw new ErroBiometria("Este navegador não suporta biometria.");
  const op = await chamarApi("/api/auth/webauthn/register", { etapa: "opcoes" });
  let credencial: PublicKeyCredential;
  try {
    credencial = (await navigator.credentials.create({
      publicKey: {
        challenge: deB64url(op.challenge),
        rp: op.rp,
        user: { id: deB64url(op.user.id), name: op.user.name, displayName: op.user.displayName },
        pubKeyCredParams: op.pubKeyCredParams,
        timeout: op.timeout,
        attestation: "none",
        authenticatorSelection: op.authenticatorSelection,
        excludeCredentials: (op.excludeCredentials ?? []).map((c: { id: string }) => ({ type: "public-key" as const, id: deB64url(c.id) })),
      },
    })) as PublicKeyCredential;
  } catch (e) {
    throw traduzirErro(e);
  }
  if (!credencial) throw new ErroBiometria("Cadastro cancelado.", true);
  const resp = credencial.response as AuthenticatorAttestationResponse;
  const transports = typeof resp.getTransports === "function" ? resp.getTransports() : undefined;
  const resultado = await chamarApi("/api/auth/webauthn/register", {
    etapa: "verificar",
    apelido,
    credencial: {
      id: paraB64url(credencial.rawId),
      clientDataJSON: paraB64url(resp.clientDataJSON),
      attestationObject: paraB64url(resp.attestationObject),
      transports,
    },
  });
  return resultado.credentialId as string;
}

/** Pede a biometria e confirma no servidor. Lança ErroBiometria se falhar. */
export async function autenticarComBiometria(credenciaisDoAparelho: string[]): Promise<void> {
  if (!navegadorSuportaWebAuthn()) throw new ErroBiometria("Este navegador não suporta biometria.");
  const op = await chamarApi("/api/auth/webauthn/verify", { etapa: "opcoes", credenciais: credenciaisDoAparelho });
  let credencial: PublicKeyCredential;
  try {
    credencial = (await navigator.credentials.get({
      publicKey: {
        challenge: deB64url(op.challenge),
        rpId: op.rpId,
        timeout: op.timeout,
        userVerification: "required",
        allowCredentials: (op.allowCredentials ?? []).map((c: { id: string; transports?: AuthenticatorTransport[] }) => ({
          type: "public-key" as const,
          id: deB64url(c.id),
          transports: c.transports,
        })),
      },
    })) as PublicKeyCredential;
  } catch (e) {
    throw traduzirErro(e);
  }
  if (!credencial) throw new ErroBiometria("Leitura cancelada.", true);
  const resp = credencial.response as AuthenticatorAssertionResponse;
  await chamarApi("/api/auth/webauthn/verify", {
    etapa: "verificar",
    credencial: {
      id: paraB64url(credencial.rawId),
      clientDataJSON: paraB64url(resp.clientDataJSON),
      authenticatorData: paraB64url(resp.authenticatorData),
      signature: paraB64url(resp.signature),
    },
  });
}

/** Remove a credencial do servidor (o dono pode apagar as próprias via RLS). */
export async function removerBiometriaServidor(credentialId: string): Promise<void> {
  await supabase.from("user_authenticators").delete().eq("credential_id", credentialId);
}
