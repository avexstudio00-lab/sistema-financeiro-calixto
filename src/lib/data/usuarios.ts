import { supabase } from "@/lib/supabase/client";

export async function atualizarTipoPerfil(usuarioId: string, tipo: "clt" | "mei" | "me") {
  return supabase.from("usuarios").update({ tipo_perfil: tipo }).eq("id", usuarioId);
}
