import { supabase } from "@/lib/supabase/client";
import { campoEmpresa, filtrarPorEmpresa } from "@/lib/empresa/empresaAtiva";
import { formatarMoeda } from "@/lib/format";
import type { Servico } from "./tipos";

/** Catálogo de serviços (itens 5.6 e 5.7 da especificação de 03/out/2026) —
 * tabela própria, sem nenhuma relação com estoque. */
export async function listarServicos(usuarioId: string): Promise<Servico[]> {
  const { data } = await filtrarPorEmpresa(
    supabase.from("servicos").select("*").eq("usuario_id", usuarioId).eq("ativo", true).order("nome", { ascending: true })
  );
  return (data as Servico[]) ?? [];
}

export interface NovoServico {
  usuario_id: string;
  nome: string;
  descricao: string | null;
  codigo: string | null;
  tempo_estimado: string | null;
  preco_fixo: boolean;
  preco: number | null;
  custo: number | null;
  referencia_preco: string | null;
}

function limpar(s: NovoServico): NovoServico {
  return {
    ...s,
    nome: s.nome.trim(),
    descricao: s.descricao?.trim() || null,
    codigo: s.codigo?.trim() || null,
    tempo_estimado: s.tempo_estimado?.trim() || null,
    referencia_preco: s.referencia_preco?.trim() || null,
    // Sem preço fixo, o valor final só nasce no orçamento/venda.
    preco: s.preco_fixo ? s.preco : null,
  };
}

export async function criarServico(servico: NovoServico) {
  return supabase.from("servicos").insert({ ...campoEmpresa(), ...limpar(servico) }).select().single();
}

export async function atualizarServico(id: string, servico: Omit<NovoServico, "usuario_id">) {
  const { usuario_id: _ignorado, ...dados } = limpar({ ...servico, usuario_id: "" });
  void _ignorado;
  return supabase.from("servicos").update(dados).eq("id", id);
}

/** Desativa em vez de apagar: vendas e orçamentos antigos continuam
 * apontando pro serviço. */
export async function removerServico(id: string) {
  return supabase.from("servicos").update({ ativo: false }).eq("id", id);
}

/** Texto do preço pra exibir no catálogo/orçamento. */
export function rotuloPrecoServico(s: Pick<Servico, "preco_fixo" | "preco" | "referencia_preco">): string {
  if (s.preco_fixo && s.preco != null) return formatarMoeda(Number(s.preco));
  return s.referencia_preco || "Sob consulta";
}
