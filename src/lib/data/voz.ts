import { supabase } from "@/lib/supabase/client";

/** Uma frase falada pela Siri, esperando a pessoa conferir no app. */
export interface AnotacaoVoz {
  id: string;
  origem: "app" | "siri";
  texto: string;
  status: "pendente" | "salva" | "descartada";
  criado_em: string;
}

/** Anotações da Siri ainda não conferidas (vazio se o SQL não rodou). */
export async function listarAnotacoesPendentes(usuarioId: string): Promise<AnotacaoVoz[]> {
  const { data, error } = await supabase
    .from("anotacoes_voz")
    .select("id, origem, texto, status, criado_em")
    .eq("usuario_id", usuarioId)
    .eq("status", "pendente")
    .order("criado_em", { ascending: false })
    .limit(30);
  if (error) return [];
  return (data as AnotacaoVoz[]) ?? [];
}

export async function resolverAnotacao(id: string, status: "salva" | "descartada") {
  return supabase.from("anotacoes_voz").update({ status, resolvido_em: new Date().toISOString() }).eq("id", id);
}

/** Microfone do app: guarda a frase já salva, só pra contar o uso. Falhar
 * aqui (ex.: SQL não rodado) não atrapalha nada. */
export async function registrarUsoMicrofone(usuarioId: string, texto: string) {
  try {
    await supabase.from("anotacoes_voz").insert({ usuario_id: usuarioId, origem: "app", texto: texto.slice(0, 500), status: "salva", resolvido_em: new Date().toISOString() });
  } catch {
    /* só métrica */
  }
}

async function cabecalhoAuth(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : null;
}

export interface StatusCodigoVoz {
  configurado: boolean;
  faltaSql?: boolean;
  criadoEm?: string | null;
  ultimoUso?: string | null;
}

export async function statusCodigoVoz(): Promise<StatusCodigoVoz | null> {
  const h = await cabecalhoAuth();
  if (!h) return null;
  try {
    const r = await fetch("/api/voz/codigo", { headers: h, cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as StatusCodigoVoz;
  } catch {
    return null;
  }
}

/** Gera um código novo (o antigo para de valer). */
export async function gerarNovoCodigoVoz(): Promise<{ codigo?: string; erro?: string }> {
  const h = await cabecalhoAuth();
  if (!h) return { erro: "Sessão expirada. Entre de novo." };
  try {
    const r = await fetch("/api/voz/codigo", { method: "POST", headers: h });
    const j = (await r.json()) as { codigo?: string; erro?: string };
    return r.ok ? { codigo: j.codigo } : { erro: j.erro ?? "Não foi possível gerar o código." };
  } catch {
    return { erro: "Sem conexão." };
  }
}
