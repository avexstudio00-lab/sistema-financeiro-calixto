import { supabase } from "@/lib/supabase/client";

/**
 * Preferência "Ocultar prévia das notificações" (Fase 1, item 3.1). Fica no
 * banco porque quem monta o texto do push é o servidor (cron), que precisa
 * saber se pode ou não mostrar valores e descrições na tela de bloqueio.
 */
export async function lerOcultarPrevia(usuarioId: string): Promise<boolean> {
  const { data } = await supabase
    .from("preferencias_privacidade")
    .select("ocultar_previa_notificacoes")
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  return !!(data as { ocultar_previa_notificacoes: boolean } | null)?.ocultar_previa_notificacoes;
}

export async function salvarOcultarPrevia(usuarioId: string, ocultar: boolean) {
  return supabase
    .from("preferencias_privacidade")
    .upsert({ usuario_id: usuarioId, ocultar_previa_notificacoes: ocultar, atualizado_em: new Date().toISOString() }, { onConflict: "usuario_id" });
}
