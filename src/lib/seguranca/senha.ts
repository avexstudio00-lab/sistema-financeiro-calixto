/**
 * Item 6 da apuração de segurança (10/out/2026): força mínima de senha e
 * bloqueio de senha já vazada.
 *
 * Roda no navegador (cadastro, redefinir senha, convite) e no servidor
 * (/api/auth/trocar-senha). Só usa APIs Web (crypto.subtle, fetch).
 *
 * Senha vazada: consulta a base pública do Have I Been Pwned pelo método
 * k-anonymity — só os 5 primeiros caracteres do hash SHA-1 saem do aparelho;
 * a senha (e o hash completo) nunca são enviados a ninguém.
 */

export const TAMANHO_MINIMO_SENHA = 8;

// Senhas fracas mais usadas no Brasil/mundo (amostra; a checagem de vazadas
// cobre o resto).
const COMUNS = new Set([
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000",
  "password", "password1", "senha123", "senha1234", "qwerty123", "abc12345",
  "brasil123", "iloveyou", "admin123", "mudar123", "teste123", "a1b2c3d4",
  "q1w2e3r4", "1q2w3e4r", "12345abc", "abcd1234", "flamengo", "corinthians",
]);

function sequencial(s: string): boolean {
  const t = s.toLowerCase();
  let asc = 0;
  let desc = 0;
  for (let i = 1; i < t.length; i++) {
    const d = t.charCodeAt(i) - t.charCodeAt(i - 1);
    asc = d === 1 ? asc + 1 : 0;
    desc = d === -1 ? desc + 1 : 0;
    if (asc >= 5 || desc >= 5) return true;
  }
  return false;
}

/** Devolve a mensagem de erro, ou null se a senha passa nas regras locais. */
export function problemaNaSenha(senha: string, email?: string | null): string | null {
  if (senha.length < TAMANHO_MINIMO_SENHA) return `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  if (senha.length > 72) return "A senha pode ter no máximo 72 caracteres.";
  if (!/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) return "Use letras e números na senha.";
  if (/^(.)\1+$/.test(senha) || COMUNS.has(senha.toLowerCase())) return "Essa senha é muito comum. Escolha outra.";
  if (sequencial(senha)) return "Evite sequências como 123456 ou abcdef.";
  const usuario = (email ?? "").split("@")[0]?.toLowerCase();
  if (usuario && usuario.length >= 4 && senha.toLowerCase().includes(usuario)) {
    return "A senha não pode conter o seu e-mail.";
  }
  return null;
}

async function sha1Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * true = senha aparece em vazamentos conhecidos; false = não aparece;
 * null = não deu para consultar (sem rede/serviço fora) — quem chama decide
 * (aqui no app: segue, porque a regra local acima já barrou o básico).
 */
export async function senhaVazada(senha: string): Promise<boolean | null> {
  try {
    const hash = await sha1Hex(senha);
    const prefixo = hash.slice(0, 5);
    const sufixo = hash.slice(5);
    const controle = new AbortController();
    const tempo = setTimeout(() => controle.abort(), 5000);
    const resp = await fetch(`https://api.pwnedpasswords.com/range/${prefixo}`, {
      headers: { "Add-Padding": "true" },
      signal: controle.signal,
      cache: "no-store",
    });
    clearTimeout(tempo);
    if (!resp.ok) return null;
    const corpo = await resp.text();
    for (const linha of corpo.split("\n")) {
      const [suf, qtd] = linha.trim().split(":");
      if (suf === sufixo && Number(qtd) > 0) return true;
    }
    return false;
  } catch {
    return null;
  }
}

/** Regras locais + vazamento. Devolve a mensagem de erro ou null. */
export async function validarSenhaNova(senha: string, email?: string | null): Promise<string | null> {
  const local = problemaNaSenha(senha, email);
  if (local) return local;
  if ((await senhaVazada(senha)) === true) {
    return "Essa senha já apareceu em vazamentos de dados na internet. Escolha outra senha.";
  }
  return null;
}
