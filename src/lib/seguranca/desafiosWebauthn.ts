import type { SupabaseClient } from "@supabase/supabase-js";
import { novoDesafio } from "./webauthnServidor";

const VALIDADE_MS = 5 * 60 * 1000;

/** Cria um desafio de uso único (5 min) amarrado ao usuário e ao domínio. */
export async function criarDesafio(
  admin: SupabaseClient,
  params: { userId: string; tipo: "registro" | "autenticacao"; rpId: string; origem: string }
): Promise<string | null> {
  const desafio = novoDesafio();
  const { error } = await admin.from("webauthn_challenges").insert({
    user_id: params.userId,
    challenge: desafio,
    tipo: params.tipo,
    rp_id: params.rpId,
    origem: params.origem,
    expira_em: new Date(Date.now() + VALIDADE_MS).toISOString(),
  });
  if (error) {
    console.error("Erro ao criar desafio WebAuthn:", error.message);
    return null;
  }
  // Limpeza oportunista: desafios vencidos ou já usados deste usuário.
  await admin
    .from("webauthn_challenges")
    .delete()
    .eq("user_id", params.userId)
    .or(`usado.eq.true,expira_em.lt.${new Date().toISOString()}`);
  return desafio;
}

/**
 * Consome (marca como usado) o desafio mais recente do usuário daquele
 * tipo, se ainda válido. Só um uso: replay de uma resposta antiga falha.
 */
export async function consumirDesafio(
  admin: SupabaseClient,
  params: { userId: string; tipo: "registro" | "autenticacao" }
): Promise<{ challenge: string; rp_id: string; origem: string } | null> {
  const { data } = await admin
    .from("webauthn_challenges")
    .select("id, challenge, rp_id, origem, expira_em")
    .eq("user_id", params.userId)
    .eq("tipo", params.tipo)
    .eq("usado", false)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  const linha = data as { id: string; challenge: string; rp_id: string; origem: string; expira_em: string } | null;
  if (!linha) return null;
  const { data: marcado } = await admin
    .from("webauthn_challenges")
    .update({ usado: true })
    .eq("id", linha.id)
    .eq("usado", false)
    .select("id");
  if (!marcado || (marcado as unknown[]).length === 0) return null;
  if (new Date(linha.expira_em).getTime() < Date.now()) return null;
  return { challenge: linha.challenge, rp_id: linha.rp_id, origem: linha.origem };
}
