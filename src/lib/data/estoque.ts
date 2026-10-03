import type { Fornecedor, Produto, Venda } from "./tipos";

/** Prazo de entrega usado quando o fornecedor não informou o dele. */
export const PRAZO_ENTREGA_PADRAO = 7;
/** Por quantos dias, depois que a mercadoria chega, a compra deve cobrir. */
export const DIAS_COBERTURA = 30;

export interface SugestaoReposicao {
  produto: Produto;
  fornecedor: Fornecedor | null;
  vendasUltimos60: number;
  vendaSemanal: number;
  prazoEntrega: number;
  pontoReposicao: number;
  diasDeEstoque: number | null;
  quantidadeSugerida: number;
  capitalNecessario: number;
  urgente: boolean;
}

/**
 * Sugestão de reposição (item 7.3 da especificação de 03/out/2026).
 * - Giro: unidades vendidas nos últimos 60 dias → média por dia/semana.
 * - Ponto de reposição = consumo diário × prazo de entrega + estoque mínimo.
 * - Quantidade sugerida = o que cobre o prazo de entrega + 30 dias, mais o
 *   estoque mínimo, menos o que já tem.
 * Só entram na lista os produtos que já chegaram (ou estão a até 20%) do
 * ponto de reposição — antes do estoque mínimo crítico, como pedido.
 */
export function calcularSugestoesReposicao(
  produtos: Produto[],
  vendas: Venda[],
  fornecedores: Fornecedor[],
  hoje: Date = new Date()
): SugestaoReposicao[] {
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() - 60);
  const limiteIso = limite.toISOString().slice(0, 10);

  const vendidoPorProduto = new Map<string, number>();
  for (const v of vendas) {
    if (!v.produto_id || v.data < limiteIso) continue;
    vendidoPorProduto.set(v.produto_id, (vendidoPorProduto.get(v.produto_id) ?? 0) + v.quantidade);
  }

  const sugestoes: SugestaoReposicao[] = [];
  for (const produto of produtos) {
    if (!produto.ativo) continue;
    const vendidos = vendidoPorProduto.get(produto.id) ?? 0;
    const porDia = vendidos / 60;
    const fornecedor = fornecedores.find((f) => f.id === produto.fornecedor_id) ?? null;
    const prazo = fornecedor?.prazo_entrega_dias ?? PRAZO_ENTREGA_PADRAO;
    const minimo = Number(produto.estoque_minimo);
    const atual = Number(produto.quantidade_estoque);
    const pontoReposicao = Math.ceil(porDia * prazo + minimo);
    const alvo = Math.ceil(porDia * (prazo + DIAS_COBERTURA) + minimo);
    const quantidadeSugerida = Math.max(0, alvo - atual);
    const pertoDoPonto = atual <= pontoReposicao * 1.2 || atual <= minimo;
    if (!pertoDoPonto || quantidadeSugerida <= 0) continue;
    sugestoes.push({
      produto,
      fornecedor,
      vendasUltimos60: vendidos,
      vendaSemanal: porDia * 7,
      prazoEntrega: prazo,
      pontoReposicao,
      diasDeEstoque: porDia > 0 ? Math.floor(atual / porDia) : null,
      quantidadeSugerida,
      capitalNecessario: quantidadeSugerida * Number(produto.custo),
      urgente: atual <= minimo || (porDia > 0 && atual / porDia <= prazo),
    });
  }
  return sugestoes.sort((a, b) => Number(b.urgente) - Number(a.urgente) || (a.diasDeEstoque ?? 9999) - (b.diasDeEstoque ?? 9999));
}

/** Valor do estoque pelo custo de aquisição (usado no patrimônio, 5.15). */
export function valorDoEstoque(produtos: Produto[]): number {
  return produtos.reduce((acc, p) => acc + Number(p.custo) * Number(p.quantidade_estoque), 0);
}
