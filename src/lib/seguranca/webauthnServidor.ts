import { createHash, createPublicKey, randomBytes, verify as verificarAssinatura } from "crypto";

/**
 * Verificação WebAuthn no servidor (Fase 1, item 3.2), sem biblioteca
 * externa: só o módulo `crypto` do Node. Cobre o necessário pra desbloqueio
 * com biometria do próprio aparelho (Face ID/Touch ID, digital Android,
 * Windows Hello):
 *  - registro com attestation "none" (não exigimos certificado do
 *    fabricante; a garantia é a verificação de usuário UV + desafio único);
 *  - autenticação com checagem de desafio, origem, rpIdHash, flags UP/UV,
 *    assinatura (ES256 ou RS256) e contador.
 */

export const ALG_ES256 = -7;
export const ALG_RS256 = -257;

export function b64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString("base64url");
}

export function deB64url(texto: string): Buffer {
  return Buffer.from(texto, "base64url");
}

export function novoDesafio(): string {
  return b64url(randomBytes(32));
}

export function sha256(dados: Buffer | string): Buffer {
  return createHash("sha256").update(dados).digest();
}

/** rpId e origem esperada a partir do host da própria requisição. */
export function contextoRp(request: Request): { rpId: string; origem: string } {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();
  const rpId = host.replace(/:\d+$/, "");
  const local = rpId === "localhost" || rpId === "127.0.0.1";
  return { rpId, origem: `${local ? "http" : "https"}://${host}` };
}

// ---------------------------------------------------------------------------
// CBOR mínimo (RFC 8949) — só o que aparece em attestationObject/COSE.
// ---------------------------------------------------------------------------

type ValorCbor = number | bigint | string | boolean | null | undefined | Buffer | ValorCbor[] | Map<ValorCbor, ValorCbor>;

function lerCbor(buf: Buffer, pos: number): { valor: ValorCbor; pos: number } {
  if (pos >= buf.length) throw new Error("CBOR truncado");
  const inicial = buf[pos++];
  const tipo = inicial >> 5;
  const info = inicial & 0x1f;

  let tamanho: number;
  if (info < 24) tamanho = info;
  else if (info === 24) tamanho = buf.readUInt8(pos++);
  else if (info === 25) {
    tamanho = buf.readUInt16BE(pos);
    pos += 2;
  } else if (info === 26) {
    tamanho = buf.readUInt32BE(pos);
    pos += 4;
  } else if (info === 27) {
    const grande = buf.readBigUInt64BE(pos);
    pos += 8;
    if (grande > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("CBOR: inteiro grande demais");
    tamanho = Number(grande);
  } else throw new Error("CBOR: comprimento indefinido não suportado");

  switch (tipo) {
    case 0:
      return { valor: tamanho, pos };
    case 1:
      return { valor: -1 - tamanho, pos };
    case 2: {
      if (pos + tamanho > buf.length) throw new Error("CBOR truncado");
      return { valor: buf.subarray(pos, pos + tamanho), pos: pos + tamanho };
    }
    case 3: {
      if (pos + tamanho > buf.length) throw new Error("CBOR truncado");
      return { valor: buf.subarray(pos, pos + tamanho).toString("utf8"), pos: pos + tamanho };
    }
    case 4: {
      const lista: ValorCbor[] = [];
      for (let i = 0; i < tamanho; i++) {
        const r = lerCbor(buf, pos);
        lista.push(r.valor);
        pos = r.pos;
      }
      return { valor: lista, pos };
    }
    case 5: {
      const mapa = new Map<ValorCbor, ValorCbor>();
      for (let i = 0; i < tamanho; i++) {
        const k = lerCbor(buf, pos);
        const v = lerCbor(buf, k.pos);
        mapa.set(k.valor, v.valor);
        pos = v.pos;
      }
      return { valor: mapa, pos };
    }
    case 7:
      if (info === 20) return { valor: false, pos };
      if (info === 21) return { valor: true, pos };
      if (info === 22) return { valor: null, pos };
      if (info === 23) return { valor: undefined, pos };
      throw new Error("CBOR: valor simples não suportado");
    default:
      throw new Error("CBOR: tipo não suportado");
  }
}

// ---------------------------------------------------------------------------
// authenticatorData
// ---------------------------------------------------------------------------

interface DadosAutenticador {
  rpIdHash: Buffer;
  usuarioPresente: boolean;
  usuarioVerificado: boolean;
  contador: number;
  credentialId?: Buffer;
  chaveCose?: Map<ValorCbor, ValorCbor>;
}

function lerAuthData(authData: Buffer, esperaCredencial: boolean): DadosAutenticador {
  if (authData.length < 37) throw new Error("authenticatorData curto demais");
  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32];
  const contador = authData.readUInt32BE(33);
  const resultado: DadosAutenticador = {
    rpIdHash,
    usuarioPresente: (flags & 0x01) !== 0,
    usuarioVerificado: (flags & 0x04) !== 0,
    contador,
  };
  const temCredencial = (flags & 0x40) !== 0;
  if (esperaCredencial) {
    if (!temCredencial) throw new Error("Registro sem dados de credencial");
    let pos = 37 + 16; // pula o AAGUID
    const tamanhoId = authData.readUInt16BE(pos);
    pos += 2;
    resultado.credentialId = authData.subarray(pos, pos + tamanhoId);
    pos += tamanhoId;
    const cose = lerCbor(authData, pos).valor;
    if (!(cose instanceof Map)) throw new Error("Chave pública inválida");
    resultado.chaveCose = cose;
  }
  return resultado;
}

/** Chave COSE (EC2 P-256 ou RSA) → SPKI DER em base64url. */
function coseParaSpki(cose: Map<ValorCbor, ValorCbor>): { spki: string; alg: number } {
  const kty = cose.get(1);
  const alg = Number(cose.get(3));
  let jwk: Record<string, string>;
  if (kty === 2) {
    if (alg !== ALG_ES256 || cose.get(-1) !== 1) throw new Error("Algoritmo de chave não suportado");
    const x = cose.get(-2);
    const y = cose.get(-3);
    if (!Buffer.isBuffer(x) || !Buffer.isBuffer(y)) throw new Error("Chave EC inválida");
    jwk = { kty: "EC", crv: "P-256", x: b64url(x), y: b64url(y) };
  } else if (kty === 3) {
    if (alg !== ALG_RS256) throw new Error("Algoritmo de chave não suportado");
    const n = cose.get(-1);
    const e = cose.get(-2);
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e)) throw new Error("Chave RSA inválida");
    jwk = { kty: "RSA", n: b64url(n), e: b64url(e) };
  } else {
    throw new Error("Tipo de chave não suportado");
  }
  const chave = createPublicKey({ key: jwk, format: "jwk" });
  return { spki: b64url(chave.export({ type: "spki", format: "der" }) as Buffer), alg };
}

function conferirClientData(
  clientDataJSON: Buffer,
  esperado: { tipo: "webauthn.create" | "webauthn.get"; desafio: string; origem: string }
) {
  let dados: { type?: string; challenge?: string; origin?: string };
  try {
    dados = JSON.parse(clientDataJSON.toString("utf8"));
  } catch {
    throw new Error("clientDataJSON inválido");
  }
  if (dados.type !== esperado.tipo) throw new Error("Tipo de operação inesperado");
  if (dados.challenge !== esperado.desafio) throw new Error("Desafio não confere");
  if (dados.origin !== esperado.origem) throw new Error("Origem não confere");
}

export interface CredencialRegistrada {
  credentialId: string;
  spki: string;
  alg: number;
  contador: number;
}

export function verificarRegistro(params: {
  clientDataJSON: string;
  attestationObject: string;
  desafio: string;
  origem: string;
  rpId: string;
}): CredencialRegistrada {
  const clientData = deB64url(params.clientDataJSON);
  conferirClientData(clientData, { tipo: "webauthn.create", desafio: params.desafio, origem: params.origem });

  const att = lerCbor(deB64url(params.attestationObject), 0).valor;
  if (!(att instanceof Map)) throw new Error("attestationObject inválido");
  const authData = att.get("authData");
  if (!Buffer.isBuffer(authData)) throw new Error("authData ausente");

  const dados = lerAuthData(authData, true);
  if (!dados.rpIdHash.equals(sha256(params.rpId))) throw new Error("rpId não confere");
  if (!dados.usuarioPresente || !dados.usuarioVerificado) throw new Error("Biometria não foi confirmada");

  const { spki, alg } = coseParaSpki(dados.chaveCose!);
  return { credentialId: b64url(dados.credentialId!), spki, alg, contador: dados.contador };
}

export function verificarAutenticacao(params: {
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  desafio: string;
  origem: string;
  rpId: string;
  spki: string;
  contadorAnterior: number;
}): { contador: number } {
  const clientData = deB64url(params.clientDataJSON);
  conferirClientData(clientData, { tipo: "webauthn.get", desafio: params.desafio, origem: params.origem });

  const authData = deB64url(params.authenticatorData);
  const dados = lerAuthData(authData, false);
  if (!dados.rpIdHash.equals(sha256(params.rpId))) throw new Error("rpId não confere");
  if (!dados.usuarioPresente || !dados.usuarioVerificado) throw new Error("Biometria não foi confirmada");

  const chave = createPublicKey({ key: deB64url(params.spki), format: "der", type: "spki" });
  const assinado = Buffer.concat([authData, sha256(clientData)]);
  const ok = verificarAssinatura("sha256", assinado, chave, deB64url(params.signature));
  if (!ok) throw new Error("Assinatura inválida");

  // Contador: autenticadores que contam (ex: chaves físicas) precisam
  // sempre subir; passkeys sincronizadas (Apple/Google) mandam 0 sempre.
  if (dados.contador !== 0 || params.contadorAnterior !== 0) {
    if (dados.contador <= params.contadorAnterior) throw new Error("Contador de uso inválido (possível clone)");
  }
  return { contador: dados.contador };
}
