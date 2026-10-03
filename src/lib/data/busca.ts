import { supabase } from "@/lib/supabase/client";
import { formatarMoeda } from "@/lib/format";

export interface ResultadoBusca {
  id: string;
  titulo: string;
  detalhe: string;
  href: string;
}

export interface GrupoBusca {
  grupo: "Transações" | "Entidades" | "Compromissos" | "Custódia" | "Mercadorias";
  itens: ResultadoBusca[];
}

/** Escapa curingas do ILIKE pra o texto digitado ser buscado literalmente. */
function padrao(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const LIMITE = 5;

/**
 * Busca global (item 6.2 da especificação de 03/out/2026): consulta várias
 * tabelas ao mesmo tempo e devolve resultados agrupados. Tudo continua
 * passando pelo RLS — cada pessoa só encontra o que já pode ver.
 * `usuarioId` = dados pessoais; `contaMestreId` = dados do negócio (null se
 * a conta não tem acesso à área "Minha empresa").
 */
export async function buscarGlobal(texto: string, usuarioId: string, contaMestreId: string | null): Promise<GrupoBusca[]> {
  const termo = texto.trim();
  if (termo.length < 2) return [];
  const p = padrao(termo);
  const negocio = contaMestreId;
  const vazio = Promise.resolve({ data: [] as unknown[] });

  const [transacoes, transacoesNeg, clientes, fornecedores, dividas, pagar, receber, investimentos, metas, produtos, servicos] =
    await Promise.all([
      supabase.from("transacoes").select("id, descricao, valor, data, tipo").eq("usuario_id", usuarioId).or("tipo_negocio.is.null,tipo_negocio.eq.pessoal").ilike("descricao", p).order("data", { ascending: false }).limit(LIMITE),
      negocio
        ? supabase.from("transacoes").select("id, descricao, valor, data, tipo").eq("usuario_id", negocio).eq("tipo_negocio", "negocio").ilike("descricao", p).order("data", { ascending: false }).limit(LIMITE)
        : vazio,
      negocio ? supabase.from("clientes").select("id, nome, telefone").eq("usuario_id", negocio).ilike("nome", p).limit(LIMITE) : vazio,
      negocio ? supabase.from("fornecedores").select("id, nome, telefone").eq("usuario_id", negocio).ilike("nome", p).limit(LIMITE) : vazio,
      supabase.from("dividas").select("id, nome, valor_total, quitada").eq("usuario_id", usuarioId).ilike("nome", p).limit(LIMITE),
      negocio ? supabase.from("contas_pagar").select("id, descricao, valor, vencimento, status").eq("usuario_id", negocio).ilike("descricao", p).limit(LIMITE) : vazio,
      negocio ? supabase.from("contas_receber").select("id, descricao, valor, vencimento, status").eq("usuario_id", negocio).ilike("descricao", p).limit(LIMITE) : vazio,
      supabase.from("investimentos").select("id, nome, tipo, valor_investido").eq("usuario_id", usuarioId).ilike("nome", p).limit(LIMITE),
      supabase.from("metas").select("id, nome, valor_meta, valor_atual").eq("usuario_id", usuarioId).ilike("nome", p).limit(LIMITE),
      negocio ? supabase.from("produtos").select("id, nome, quantidade_estoque, preco_venda").eq("usuario_id", negocio).ilike("nome", p).limit(LIMITE) : vazio,
      negocio ? supabase.from("servicos").select("id, nome, referencia_preco, preco").eq("usuario_id", negocio).eq("ativo", true).ilike("nome", p).limit(LIMITE) : vazio,
    ]);

  type Linha = Record<string, unknown>;
  const linhas = (r: { data: unknown }) => ((r.data as Linha[] | null) ?? []);
  const data = (iso: unknown) => (typeof iso === "string" ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "");
  const moeda = (v: unknown) => formatarMoeda(Number(v ?? 0));

  const grupos: GrupoBusca[] = [
    {
      grupo: "Transações",
      itens: [
        ...linhas(transacoes).map((t) => ({
          id: `t-${t.id}`,
          titulo: String(t.descricao ?? "Sem descrição"),
          detalhe: `${t.tipo === "receita" ? "Entrada" : "Saída"} · ${moeda(t.valor)} · ${data(t.data)}`,
          href: "/dashboard/extrato",
        })),
        ...linhas(transacoesNeg).map((t) => ({
          id: `tn-${t.id}`,
          titulo: String(t.descricao ?? "Sem descrição"),
          detalhe: `Empresa · ${moeda(t.valor)} · ${data(t.data)}`,
          href: "/dashboard/empresa/extrato",
        })),
      ],
    },
    {
      grupo: "Entidades",
      itens: [
        ...linhas(clientes).map((c) => ({ id: `c-${c.id}`, titulo: String(c.nome), detalhe: "Cliente", href: `/dashboard/empresa/clientes/${c.id}` })),
        ...linhas(fornecedores).map((f) => ({ id: `f-${f.id}`, titulo: String(f.nome), detalhe: "Fornecedor", href: "/dashboard/empresa/clientes-fornecedores" })),
      ],
    },
    {
      grupo: "Compromissos",
      itens: [
        ...linhas(dividas).map((d) => ({ id: `d-${d.id}`, titulo: String(d.nome), detalhe: `Dívida · ${moeda(d.valor_total)}${d.quitada ? " · quitada" : ""}`, href: "/dashboard/dividas" })),
        ...linhas(pagar).map((c) => ({ id: `cp-${c.id}`, titulo: String(c.descricao), detalhe: `A pagar · ${moeda(c.valor)} · vence ${data(c.vencimento)}`, href: "/dashboard/empresa/contas" })),
        ...linhas(receber).map((c) => ({ id: `cr-${c.id}`, titulo: String(c.descricao), detalhe: `A receber · ${moeda(c.valor)} · vence ${data(c.vencimento)}`, href: "/dashboard/empresa/contas" })),
      ],
    },
    {
      grupo: "Custódia",
      itens: [
        ...linhas(investimentos).map((i) => ({ id: `i-${i.id}`, titulo: String(i.nome), detalhe: `Investimento · ${moeda(i.valor_investido)}`, href: "/dashboard/investimentos" })),
        ...linhas(metas).map((m) => ({ id: `m-${m.id}`, titulo: String(m.nome), detalhe: `Meta · ${moeda(m.valor_atual)} de ${moeda(m.valor_meta)}`, href: "/dashboard/metas" })),
      ],
    },
    {
      grupo: "Mercadorias",
      itens: [
        ...linhas(produtos).map((pr) => ({ id: `p-${pr.id}`, titulo: String(pr.nome), detalhe: `Produto · ${pr.quantidade_estoque} em estoque · ${moeda(pr.preco_venda)}`, href: "/dashboard/empresa/estoque" })),
        ...linhas(servicos).map((sv) => ({ id: `s-${sv.id}`, titulo: String(sv.nome), detalhe: `Serviço · ${sv.preco != null ? moeda(sv.preco) : String(sv.referencia_preco ?? "sob consulta")}`, href: "/dashboard/empresa/servicos" })),
      ],
    },
  ];
  return grupos.filter((g) => g.itens.length > 0);
}
