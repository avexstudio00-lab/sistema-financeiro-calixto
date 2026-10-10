import { supabase } from "@/lib/supabase/client";
import { campoEmpresa, filtrarPorEmpresa } from "@/lib/empresa/empresaAtiva";
import type { Cliente } from "./tipos";

export async function listarClientes(usuarioId: string): Promise<Cliente[]> {
  const { data } = await filtrarPorEmpresa(supabase
    .from("clientes")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("nome", { ascending: true }));
  return (data as Cliente[]) ?? [];
}

export async function criarCliente(
  usuarioId: string,
  nome: string,
  telefone: string | null,
  email: string | null
) {
  return supabase
    .from("clientes")
    .insert({ ...campoEmpresa(), usuario_id: usuarioId, nome, telefone: telefone || null, email: email || null })
    .select()
    .single();
}

export async function atualizarCliente(
  id: string,
  nome: string,
  telefone: string | null,
  email: string | null
) {
  return supabase
    .from("clientes")
    .update({ nome, telefone: telefone || null, email: email || null })
    .eq("id", id);
}

export async function deletarCliente(id: string) {
  return supabase.from("clientes").delete().eq("id", id);
}

/**
 * Dossiê 360° e cards de clientes/fornecedores (itens 4.16/4.17 da
 * especificação de 09/out/2026).
 *
 * Correção do bug "cliente recém-cadastrado mostra Total comprado e Saldo
 * pendente zerados": as somas eram feitas sobre listas filtradas pela
 * EMPRESA ATIVA. Quando a venda/título era registrado com outra empresa (ou
 * na visão "todas", em que o banco escolhe a empresa principal), o vínculo
 * cliente_id existia, mas a linha ficava fora do filtro. Agora as somas vão
 * direto pela chave do cliente (cliente_id / fornecedor_id), sem o filtro de
 * empresa — o RLS continua garantindo que só vem dado da conta.
 */
async function lerTudoPorConta<T>(tabela: string, colunas: string, contaMestreId: string, filtro?: (q: any) => any): Promise<T[]> {
  const linhas: T[] = [];
  const pagina = 1000;
  for (let inicio = 0; inicio < 200000; inicio += pagina) {
    let q = supabase.from(tabela).select(colunas).eq("usuario_id", contaMestreId);
    if (filtro) q = filtro(q);
    const { data, error } = await q.range(inicio, inicio + pagina - 1);
    if (error || !data) break;
    linhas.push(...(data as T[]));
    if (data.length < pagina) break;
  }
  return linhas;
}

export interface TotaisParceiro {
  /** Clientes: total vendido. Fornecedores: total já pago. */
  total: number;
  pendente: number;
}

export async function totaisPorCliente(contaMestreId: string, incluiFinanceiro: boolean): Promise<Map<string, TotaisParceiro>> {
  const [vendas, receber] = await Promise.all([
    lerTudoPorConta<{ cliente_id: string | null; valor_total: number }>("vendas", "cliente_id, valor_total", contaMestreId, (q) => q.not("cliente_id", "is", null)),
    incluiFinanceiro
      ? lerTudoPorConta<{ cliente_id: string | null; valor: number }>("contas_receber", "cliente_id, valor", contaMestreId, (q) => q.eq("status", "pendente").not("cliente_id", "is", null))
      : Promise.resolve([] as { cliente_id: string | null; valor: number }[]),
  ]);
  const mapa = new Map<string, TotaisParceiro>();
  const pegar = (id: string) => mapa.get(id) ?? (mapa.set(id, { total: 0, pendente: 0 }), mapa.get(id)!);
  for (const v of vendas) if (v.cliente_id) pegar(v.cliente_id).total += Number(v.valor_total);
  for (const c of receber) if (c.cliente_id) pegar(c.cliente_id).pendente += Number(c.valor);
  return mapa;
}

export async function totaisPorFornecedor(contaMestreId: string): Promise<Map<string, TotaisParceiro>> {
  const pagar = await lerTudoPorConta<{ fornecedor_id: string | null; valor: number; status: string }>(
    "contas_pagar",
    "fornecedor_id, valor, status",
    contaMestreId,
    (q) => q.not("fornecedor_id", "is", null)
  );
  const mapa = new Map<string, TotaisParceiro>();
  for (const c of pagar) {
    if (!c.fornecedor_id) continue;
    const t = mapa.get(c.fornecedor_id) ?? { total: 0, pendente: 0 };
    if (c.status === "pago") t.total += Number(c.valor);
    else t.pendente += Number(c.valor);
    mapa.set(c.fornecedor_id, t);
  }
  return mapa;
}

export async function carregarDossieCliente(clienteId: string, incluiFinanceiro: boolean) {
  const [{ data: cliente }, { data: vendas }, orc, rec] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", clienteId).maybeSingle(),
    supabase.from("vendas").select("*").eq("cliente_id", clienteId).order("data", { ascending: false }),
    incluiFinanceiro
      ? supabase.from("orcamentos").select("*").eq("cliente_id", clienteId).order("criado_em", { ascending: false })
      : Promise.resolve({ data: [] }),
    incluiFinanceiro
      ? supabase.from("contas_receber").select("*").eq("cliente_id", clienteId).order("vencimento", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  return {
    cliente: (cliente as Cliente | null) ?? null,
    vendas: (vendas as import("./tipos").Venda[]) ?? [],
    orcamentos: (((orc as { data: unknown }).data as import("./tipos").Orcamento[]) ?? []).map((o) => ({
      ...o,
      itens: Array.isArray(o.itens) ? o.itens : [],
    })),
    titulos: ((rec as { data: unknown }).data as import("./tipos").ContaReceber[]) ?? [],
  };
}
