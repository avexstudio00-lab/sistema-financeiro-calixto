import { supabase } from "@/lib/supabase/client";
import { campoEmpresa, filtrarPorEmpresa } from "@/lib/empresa/empresaAtiva";
import type { Agendamento, StatusAgendamento } from "./tipos";

/**
 * Agenda de serviços (13/nov/2026): cliente + serviço + dia e hora. Lembrete
 * no celular de manhã (cron de notificações) e, no dia, vira venda com 1
 * toque (Vendas abre já com o cliente e o serviço no carrinho).
 */

const SELECT = "*, clientes(id, nome, telefone), servicos(id, nome)";

export const ROTULO_STATUS_AGENDA: Record<StatusAgendamento, string> = {
  marcado: "Marcado",
  confirmado: "Confirmado",
  concluido: "Atendido",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

export async function listarAgendamentos(contaMestreId: string, inicioIso: string, fimIso: string): Promise<{ lista: Agendamento[]; erro: string | null }> {
  const { data, error } = await filtrarPorEmpresa(
    supabase.from("agendamentos").select(SELECT).eq("usuario_id", contaMestreId).gte("inicio", inicioIso).lt("inicio", fimIso).order("inicio", { ascending: true })
  );
  if (error) {
    console.error("Erro ao listar agenda:", error);
    return { lista: [], erro: error.message };
  }
  return { lista: (data as Agendamento[]) ?? [], erro: null };
}

export async function buscarAgendamento(id: string): Promise<Agendamento | null> {
  const { data } = await supabase.from("agendamentos").select(SELECT).eq("id", id).maybeSingle();
  return (data as Agendamento | null) ?? null;
}

export interface NovoAgendamento {
  cliente_id: string | null;
  servico_id: string | null;
  descricao: string;
  inicio: string;
  duracao_min: number;
  valor: number | null;
  observacoes: string | null;
}

export async function criarAgendamento(contaMestreId: string, a: NovoAgendamento) {
  return supabase.from("agendamentos").insert({ ...campoEmpresa(), usuario_id: contaMestreId, ...a }).select(SELECT).single();
}

export async function atualizarAgendamento(id: string, a: NovoAgendamento) {
  return supabase.from("agendamentos").update(a).eq("id", id);
}

export async function mudarStatusAgendamento(id: string, status: StatusAgendamento) {
  return supabase.from("agendamentos").update({ status }).eq("id", id);
}

/** Depois que a venda é registrada: marca como atendido e guarda o vínculo. */
export async function marcarAgendamentoVendido(id: string, vendaGrupoId: string | null) {
  return supabase.from("agendamentos").update({ status: "concluido", venda_grupo_id: vendaGrupoId }).eq("id", id);
}

export async function excluirAgendamento(id: string) {
  return supabase.from("agendamentos").delete().eq("id", id);
}

/** "2026-11-13T09:30" no horário local → ISO com fuso, pro banco. */
export function localParaIso(dataIso: string, hora: string): string {
  return new Date(`${dataIso}T${hora || "09:00"}:00`).toISOString();
}

export function horaLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function dataLocalIso(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function mensagemConfirmacaoAgenda(a: Agendamento, nomeEmpresa: string): string {
  const primeiro = a.clientes?.nome?.split(" ")[0];
  const dia = new Date(a.inicio).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const servico = a.servicos?.nome ?? a.descricao;
  const empresa = nomeEmpresa ? ` Aqui é da *${nomeEmpresa}*.` : "";
  return `Olá${primeiro ? `, ${primeiro}` : ""}! Tudo bem?${empresa}\n\nPassando pra confirmar seu horário:\n📅 ${dia}\n🕒 ${horaLocal(a.inicio)}\n📋 ${servico}\n\nPode me confirmar se está tudo certo? Se precisar remarcar, é só me avisar. 😊`;
}
