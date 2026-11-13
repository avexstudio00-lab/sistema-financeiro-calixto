import { supabase } from "@/lib/supabase/client";
import { filtrarPorEmpresa } from "@/lib/empresa/empresaAtiva";
import type { Cliente } from "./tipos";

/**
 * Clientes sumidos (13/nov/2026): quem já comprou mas não volta há X dias.
 * Serve pra reatar o contato antes que o cliente esqueça da loja, sem
 * precisar baixar preço. Respeita a empresa ativa (planos com 2 empresas).
 */
export interface ClienteSumido {
  cliente: Cliente;
  ultimaCompra: string;
  diasSemComprar: number;
  compras: number;
  totalGasto: number;
  ticketMedio: number;
}

function diasEntre(deIso: string, ateIso: string) {
  return Math.round((new Date(ateIso + "T00:00:00").getTime() - new Date(deIso + "T00:00:00").getTime()) / 86400000);
}

export async function listarClientesSumidos(contaMestreId: string, diasMinimo: number): Promise<ClienteSumido[]> {
  const vendas: { cliente_id: string | null; data: string; valor_total: number; grupo_venda_id: string | null; id: string }[] = [];
  const pagina = 1000;
  for (let inicio = 0; inicio < 100000; inicio += pagina) {
    const { data, error } = await filtrarPorEmpresa(
      supabase
        .from("vendas")
        .select("id, cliente_id, data, valor_total, grupo_venda_id")
        .eq("usuario_id", contaMestreId)
        .not("cliente_id", "is", null)
    ).range(inicio, inicio + pagina - 1);
    if (error || !data) break;
    vendas.push(...(data as typeof vendas));
    if (data.length < pagina) break;
  }
  if (vendas.length === 0) return [];

  const { data: listaClientes } = await filtrarPorEmpresa(supabase.from("clientes").select("*").eq("usuario_id", contaMestreId));
  const clientes = new Map(((listaClientes as Cliente[]) ?? []).map((c) => [c.id, c]));

  const porCliente = new Map<string, { ultima: string; grupos: Set<string>; total: number }>();
  for (const v of vendas) {
    if (!v.cliente_id) continue;
    const g = porCliente.get(v.cliente_id) ?? { ultima: v.data, grupos: new Set<string>(), total: 0 };
    if (v.data > g.ultima) g.ultima = v.data;
    g.grupos.add(v.grupo_venda_id ?? v.id);
    g.total += Number(v.valor_total);
    porCliente.set(v.cliente_id, g);
  }

  const hoje = new Date();
  const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const resultado: ClienteSumido[] = [];
  for (const [id, g] of porCliente) {
    const cliente = clientes.get(id);
    if (!cliente) continue;
    const dias = diasEntre(g.ultima, hojeIso);
    if (dias < diasMinimo) continue;
    const compras = g.grupos.size;
    resultado.push({ cliente, ultimaCompra: g.ultima, diasSemComprar: dias, compras, totalGasto: g.total, ticketMedio: compras ? g.total / compras : 0 });
  }
  // Quem mais gastava primeiro: é quem mais vale a pena trazer de volta.
  return resultado.sort((a, b) => b.totalGasto - a.totalGasto);
}

export function mensagemClienteSumido(nomeCliente: string, nomeEmpresa: string): string {
  const primeiro = nomeCliente.split(" ")[0];
  const empresa = nomeEmpresa ? ` Aqui é da *${nomeEmpresa}*.` : "";
  return `Oi, ${primeiro}! Tudo bem?${empresa}\n\nFaz um tempinho que a gente não se fala e lembrei de você. Chegaram novidades por aqui e queria te convidar pra dar uma passada (ou é só me chamar por aqui mesmo).\n\nSe precisar de alguma coisa, estou à disposição! 😊`;
}
