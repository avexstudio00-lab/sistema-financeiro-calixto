import { supabase } from "@/lib/supabase/client";
import { campoEmpresa, filtrarPorEmpresa } from "@/lib/empresa/empresaAtiva";
import { adicionarMeses } from "./investimentos";
import { criarTransacao, deletarTransacao } from "./transacoes";
import type { ContaPagar, ContaReceber, Transacao } from "./tipos";

// ---------------------------------------------------------------------------
// Contas a pagar (fornecedores, DAS e outras contas do negócio)
// ---------------------------------------------------------------------------

export async function listarContasPagar(usuarioId: string): Promise<ContaPagar[]> {
  const { data } = await filtrarPorEmpresa(
    supabase
      .from("contas_pagar")
      .select("*, fornecedores(*)")
      .eq("usuario_id", usuarioId)
      .order("vencimento", { ascending: true })
  );
  return (data as ContaPagar[]) ?? [];
}

export interface NovaContaPagar {
  usuario_id: string;
  fornecedor_id: string | null;
  categoria: ContaPagar["categoria"];
  descricao: string;
  valor: number;
  vencimento: string;
}

export async function criarContaPagar(conta: NovaContaPagar) {
  return supabase.from("contas_pagar").insert({ ...campoEmpresa(), ...conta }).select().single();
}

/** Valores das parcelas: divisão igual, com a última absorvendo os centavos. */
export function dividirEmParcelas(valorTotal: number, numeroParcelas: number): number[] {
  const base = Math.floor((valorTotal / numeroParcelas) * 100) / 100;
  const valores = new Array(numeroParcelas).fill(base) as number[];
  valores[numeroParcelas - 1] = Number((valorTotal - base * (numeroParcelas - 1)).toFixed(2));
  return valores;
}

/** Cria uma conta a pagar parcelada (item 5.2): N títulos independentes, um
 * por mês a partir do 1º vencimento, ligados pelo mesmo `grupo_parcela_id`.
 * Cada parcela pode depois ser editada sozinha (item 5.1). */
export async function criarContaPagarParcelada(conta: NovaContaPagar, numeroParcelas: number) {
  const grupo = crypto.randomUUID();
  const valores = dividirEmParcelas(conta.valor, numeroParcelas);
  const linhas = valores.map((valor, i) => ({
    ...campoEmpresa(),
    ...conta,
    valor,
    vencimento: adicionarMeses(conta.vencimento, i),
    descricao: `${conta.descricao} (${i + 1}/${numeroParcelas})`,
    grupo_parcela_id: grupo,
    parcela_numero: i + 1,
    parcela_total: numeroParcelas,
  }));
  return supabase.from("contas_pagar").insert(linhas).select();
}

export async function marcarContaPagarPaga(id: string, pago: boolean) {
  return supabase
    .from("contas_pagar")
    .update({ status: pago ? "pago" : "pendente", data_pagamento: pago ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", id);
}

/** Edição isolada de um título/parcela (item 5.1): valor, vencimento e
 * status — sem mexer nas parcelas vizinhas. */
export async function editarContaPagar(
  id: string,
  dados: { valor: number; vencimento: string; status: ContaPagar["status"]; descricao?: string }
) {
  return supabase
    .from("contas_pagar")
    .update({
      valor: Number(dados.valor.toFixed(2)),
      vencimento: dados.vencimento,
      status: dados.status,
      ...(dados.descricao !== undefined ? { descricao: dados.descricao } : {}),
      data_pagamento: dados.status === "pago" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", id);
}

export async function deletarContaPagar(id: string) {
  return supabase.from("contas_pagar").delete().eq("id", id);
}

// ---------------------------------------------------------------------------
// Contas a receber (clientes)
// ---------------------------------------------------------------------------

export async function listarContasReceber(usuarioId: string): Promise<ContaReceber[]> {
  const { data } = await filtrarPorEmpresa(
    supabase
      .from("contas_receber")
      .select("*, clientes(*)")
      .eq("usuario_id", usuarioId)
      .order("vencimento", { ascending: true })
  );
  return (data as ContaReceber[]) ?? [];
}

export interface NovaContaReceber {
  usuario_id: string;
  cliente_id: string | null;
  descricao: string;
  valor: number;
  vencimento: string;
  origem?: ContaReceber["origem"];
  orcamento_id?: string | null;
}

export async function criarContaReceber(conta: NovaContaReceber) {
  return supabase.from("contas_receber").insert({ ...campoEmpresa(), ...conta }).select().single();
}

/** Conta a receber parcelada — usada pra venda fiada (a prazo) e pra fechar
 * um orçamento em parcelas (itens 5.2 e 5.8). */
export async function criarContaReceberParcelada(conta: NovaContaReceber, numeroParcelas: number, valores?: number[]) {
  if (numeroParcelas <= 1) {
    const { data, error } = await criarContaReceber(conta);
    return { data: data ? [data] : null, error };
  }
  const grupo = crypto.randomUUID();
  const lista = valores && valores.length === numeroParcelas ? valores : dividirEmParcelas(conta.valor, numeroParcelas);
  const linhas = lista.map((valor, i) => ({
    ...campoEmpresa(),
    ...conta,
    valor,
    vencimento: adicionarMeses(conta.vencimento, i),
    descricao: `${conta.descricao} (${i + 1}/${numeroParcelas})`,
    grupo_parcela_id: grupo,
    parcela_numero: i + 1,
    parcela_total: numeroParcelas,
  }));
  return supabase.from("contas_receber").insert(linhas).select();
}

async function idCategoriaVendas(): Promise<string | null> {
  const { data } = await supabase
    .from("categorias")
    .select("id")
    .is("usuario_id", null)
    .eq("nome", "Vendas")
    .eq("tipo", "receita")
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** Marca como recebida (ou desfaz). Títulos que nasceram de venda fiada ou
 * de orçamento fechado ainda não entraram no caixa — então, ao receber,
 * geramos a entrada correspondente no fluxo de caixa do negócio (e, ao
 * desfazer, apagamos essa entrada). Títulos manuais continuam como sempre
 * (só mudam de status). */
export async function marcarContaReceberRecebida(conta: ContaReceber, recebido: boolean, contaBancariaId: string | null = null) {
  const hoje = new Date().toISOString().slice(0, 10);
  const geraEntrada = conta.origem === "fiado" || conta.origem === "orcamento";
  let transacaoId: string | null = conta.transacao_id ?? null;

  if (geraEntrada && recebido && !transacaoId) {
    const { data } = await criarTransacao({
      usuario_id: conta.usuario_id,
      conta_id: contaBancariaId,
      categoria_id: await idCategoriaVendas(),
      tipo: "receita",
      valor: Number(conta.valor),
      descricao: `Recebido: ${conta.descricao}`,
      data: hoje,
      forma_pagamento: "pix",
      tipo_negocio: "negocio",
      empresa_id: conta.empresa_id ?? null,
    });
    transacaoId = (data as { id: string } | null)?.id ?? null;
  }
  if (!recebido && transacaoId) {
    const { data: t } = await supabase.from("transacoes").select("*").eq("id", transacaoId).maybeSingle();
    if (t) await deletarTransacao(t as Transacao);
    transacaoId = null;
  }

  return supabase
    .from("contas_receber")
    .update({
      status: recebido ? "recebido" : "pendente",
      data_recebimento: recebido ? hoje : null,
      transacao_id: transacaoId,
    })
    .eq("id", conta.id);
}

/** Edição isolada de um título/parcela a receber (item 5.1). */
export async function editarContaReceber(
  id: string,
  dados: { valor: number; vencimento: string; descricao?: string }
) {
  return supabase
    .from("contas_receber")
    .update({
      valor: Number(dados.valor.toFixed(2)),
      vencimento: dados.vencimento,
      ...(dados.descricao !== undefined ? { descricao: dados.descricao } : {}),
    })
    .eq("id", id);
}

export async function deletarContaReceber(conta: ContaReceber | string) {
  if (typeof conta !== "string" && conta.transacao_id) {
    const { data: t } = await supabase.from("transacoes").select("*").eq("id", conta.transacao_id).maybeSingle();
    if (t) await deletarTransacao(t as Transacao);
  }
  return supabase
    .from("contas_receber")
    .delete()
    .eq("id", typeof conta === "string" ? conta : conta.id);
}

// ---------------------------------------------------------------------------
// Helpers compartilhados
// ---------------------------------------------------------------------------

/** true quando o vencimento já passou e a conta ainda está pendente —
 * mesma lógica de `parcelaEstaAtrasada` em investimentos.ts. */
export function estaAtrasada(
  item: { vencimento: string; status: "pendente" | "pago" | "recebido" },
  referencia: Date = new Date()
): boolean {
  if (item.status !== "pendente") return false;
  const vencimento = new Date(item.vencimento + "T00:00:00");
  const hoje = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  return vencimento < hoje;
}

/** true quando ainda está pendente e vence de hoje até daqui a `dias` dias
 * (item 5.2: alerta de vencimento iminente — padrão 3 dias). */
export function venceEmBreve(
  item: { vencimento: string; status: "pendente" | "pago" | "recebido" },
  dias = 3,
  referencia: Date = new Date()
): boolean {
  if (item.status !== "pendente") return false;
  const vencimento = new Date(item.vencimento + "T00:00:00");
  const hoje = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + dias);
  return vencimento >= hoje && vencimento <= limite;
}
