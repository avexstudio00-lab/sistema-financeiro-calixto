import { supabase } from "@/lib/supabase/client";

/** Central de notificações (sininho) — 10/nov/2026. Gravada pela rotina diária. */
export interface Notificacao {
  id: string;
  area: "pessoal" | "empresa";
  titulo: string;
  corpo: string;
  url: string | null;
  criada_em: string;
  lida_em: string | null;
}

export async function listarNotificacoes(usuarioId: string): Promise<Notificacao[] | null> {
  const { data, error } = await supabase
    .from("notificacoes")
    .select("id, area, titulo, corpo, url, criada_em, lida_em")
    .eq("usuario_id", usuarioId)
    .order("criada_em", { ascending: false })
    .limit(40);
  if (error) return null; // tabela ainda não criada / sem rede: o sininho some
  return (data as Notificacao[]) ?? [];
}

export async function marcarNotificacoesLidas(ids: string[]) {
  if (ids.length === 0) return;
  await supabase.from("notificacoes").update({ lida_em: new Date().toISOString() }).in("id", ids).is("lida_em", null);
}
