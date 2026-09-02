import { supabase } from "@/lib/supabase/client";

export async function atualizarTipoPerfil(usuarioId: string, tipo: "clt" | "mei" | "me") {
  return supabase.from("usuarios").update({ tipo_perfil: tipo }).eq("id", usuarioId);
}

export async function atualizarNome(usuarioId: string, nome: string) {
  return supabase.from("usuarios").update({ nome }).eq("id", usuarioId);
}

/**
 * Envia a foto de perfil pro bucket "avatars" do Storage, sempre no mesmo
 * caminho (`{usuarioId}/avatar`, sem extensão — o content-type real do
 * arquivo já basta pro navegador exibir certo) com `upsert: true`, pra nunca
 * deixar arquivo antigo órfão quando a pessoa troca de foto mais de uma vez.
 * A URL salva ganha um `?v=` com a hora do envio só pra evitar que o
 * navegador mostre a foto antiga em cache depois da troca.
 */
export async function enviarFotoPerfil(usuarioId: string, arquivo: File) {
  const caminho = `${usuarioId}/avatar`;
  const { error: erroUpload } = await supabase.storage
    .from("avatars")
    .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type, cacheControl: "0" });
  if (erroUpload) return { url: null, error: erroUpload };

  const { data } = supabase.storage.from("avatars").getPublicUrl(caminho);
  const urlComVersao = `${data.publicUrl}?v=${Date.now()}`;

  const { error: erroUpdate } = await supabase
    .from("usuarios")
    .update({ foto_url: urlComVersao })
    .eq("id", usuarioId);
  if (erroUpdate) return { url: null, error: erroUpdate };

  return { url: urlComVersao, error: null };
}

export async function deletarFotoPerfil(usuarioId: string) {
  const { error: erroStorage } = await supabase.storage.from("avatars").remove([`${usuarioId}/avatar`]);
  if (erroStorage) {
    // Não bloqueia a remoção por causa disso — o pior caso é um arquivo órfão
    // no bucket, sem efeito prático (a URL não fica mais salva em lugar
    // nenhum, então nunca mais é exibida pro usuário nem pra mais ninguém).
    console.error("Falha ao remover foto do Storage:", erroStorage.message);
  }
  return supabase.from("usuarios").update({ foto_url: null }).eq("id", usuarioId);
}
