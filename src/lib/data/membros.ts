import { supabase } from "@/lib/supabase/client";
import type { Membro, DetalheConvite } from "./tipos";

/** Lista quem já foi convidado (pendente, ativo ou removido) pra conta do
 * dono logado — a RLS já garante que só o próprio dono vê isso. */
export async function listarMembros(contaMestreId: string): Promise<Membro[]> {
  const { data } = await supabase
    .from("membros")
    .select("*")
    .eq("conta_mestre_id", contaMestreId)
    .order("criado_em", { ascending: true });
  return (data as Membro[]) ?? [];
}

/** Cria um convite (linha em `membros` com status "pendente"). O banco
 * valida o limite de 2 convidados e o plano Grupo via trigger — se algo
 * disso não bater, `error.message` vem com o motivo em português, pronto
 * pra mostrar na tela. */
export async function convidarMembro(contaMestreId: string, email: string, papel: "socio" | "funcionario") {
  return supabase
    .from("membros")
    .insert({ conta_mestre_id: contaMestreId, email: email.trim().toLowerCase(), papel })
    .select()
    .single();
}

/** Muda o papel de um membro já convidado/ativo (ex: promover funcionário a sócio). */
export async function atualizarPapelMembro(membroId: string, papel: "socio" | "funcionario") {
  return supabase.from("membros").update({ papel }).eq("id", membroId);
}

/** Remove o acesso de um membro (convite pendente ou já ativo). Não apaga a
 * linha — só marca como "removido", o que já corta o acesso na hora porque
 * as políticas de RLS só reconhecem membros com status "ativo". */
export async function removerMembro(membroId: string) {
  return supabase.from("membros").update({ status: "removido" }).eq("id", membroId);
}

/** Consulta os dados públicos de um convite pelo token — funciona mesmo
 * sem estar logado, pra tela de convite poder mostrar "fulano te convidou"
 * antes da pessoa entrar ou criar conta. */
export async function consultarConvite(token: string): Promise<DetalheConvite | null> {
  const { data } = await supabase.rpc("consultar_convite", { p_token: token });
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha as DetalheConvite | undefined) ?? null;
}

/** Aceita o convite — precisa estar logado com o mesmo e-mail que recebeu o
 * convite. O banco confere tudo isso (e-mail, status, se não é a própria
 * conta) e lança um erro em português se algo não bater. */
export async function aceitarConvite(token: string) {
  return supabase.rpc("aceitar_convite", { p_token: token });
}
