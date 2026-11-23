import { createHash, randomBytes } from "node:crypto";

/**
 * Código pessoal do atalho da Siri (23/nov/2026). Só roda no servidor.
 * O código tem prefixo "mc_" (Meu Controle) + 32 caracteres aleatórios; no
 * banco fica só o sha-256, então nem quem lê o banco consegue usar.
 */
export function gerarCodigoVoz(): string {
  return `mc_${randomBytes(24).toString("base64url")}`;
}

export function hashCodigoVoz(codigo: string): string {
  return createHash("sha256").update(codigo.trim()).digest("hex");
}

export function pareceCodigoVoz(codigo: string): boolean {
  return /^mc_[A-Za-z0-9_-]{20,64}$/.test(codigo.trim());
}
