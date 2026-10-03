import { supabase } from "@/lib/supabase/client";
import { campoEmpresa, filtrarPorEmpresa } from "@/lib/empresa/empresaAtiva";
import type { NotaFiscal, StatusNotaFiscal } from "./tipos";

export const ROTULO_STATUS_NOTA: Record<StatusNotaFiscal, string> = {
  pendente: "Pendente",
  autorizada: "Autorizada",
  rejeitada: "Rejeitada",
  cancelada: "Cancelada",
};

export async function listarNotasFiscais(usuarioId: string): Promise<NotaFiscal[]> {
  const { data } = await filtrarPorEmpresa(
    supabase.from("notas_fiscais").select("*").eq("usuario_id", usuarioId).order("data_emissao", { ascending: false }).order("criado_em", { ascending: false })
  );
  return (data as NotaFiscal[]) ?? [];
}

export interface NovaNotaFiscal {
  usuario_id: string;
  cliente_id: string | null;
  tipo: NotaFiscal["tipo"];
  tomador_nome: string;
  tomador_documento: string | null;
  discriminacao: string;
  codigo_atividade: string | null;
  aliquota: number | null;
  imposto_retido: boolean;
  valor: number;
}

export async function criarNotaFiscal(nota: NovaNotaFiscal) {
  return supabase
    .from("notas_fiscais")
    .insert({
      ...campoEmpresa(),
      ...nota,
      tomador_nome: nota.tomador_nome.trim(),
      tomador_documento: nota.tomador_documento?.replace(/\D/g, "") || null,
      discriminacao: nota.discriminacao.trim(),
      codigo_atividade: nota.codigo_atividade?.trim() || null,
      status: "pendente",
    })
    .select()
    .single();
}

export async function cancelarNotaFiscal(id: string) {
  return supabase.from("notas_fiscais").update({ status: "cancelada" }).eq("id", id);
}

export async function excluirNotaFiscal(id: string) {
  return supabase.from("notas_fiscais").delete().eq("id", id).eq("status", "pendente");
}

/** Pede a emissão ao servidor (que conversa com o emissor configurado —
 * PlugNotas ou Focus NFe — quando as credenciais estiverem na Vercel). */
export async function solicitarEmissao(id: string): Promise<{ ok: boolean; mensagem: string }> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;
  if (!token) return { ok: false, mensagem: "Sessão expirada. Entre de novo." };
  try {
    const resp = await fetch("/api/notas-fiscais/emitir", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });
    const corpo = (await resp.json().catch(() => ({}))) as { mensagem?: string };
    return { ok: resp.ok, mensagem: corpo.mensagem ?? (resp.ok ? "Enviada." : "Não foi possível emitir agora.") };
  } catch {
    return { ok: false, mensagem: "Sem conexão com o servidor." };
  }
}
