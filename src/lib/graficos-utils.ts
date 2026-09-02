import type { Transacao } from "@/lib/data/tipos";

/**
 * Paleta de cores para gráficos de categoria — tons de verde/teal da
 * identidade visual, com um tom neutro para o grupo "Outros".
 */
export const CORES_CATEGORIAS = [
  "#10b981",
  "#14b8a6",
  "#065f46",
  "#34d399",
  "#2dd4bf",
  "#059669",
];
export const COR_OUTROS = "#94a3b8";

export interface FatiaCategoria {
  id: string;
  nome: string;
  valor: number;
  cor: string;
}

/**
 * Agrupa despesas por categoria, mantendo no máximo `maxCategorias` fatias
 * e somando o restante em "Outros".
 */
export function agruparGastosPorCategoria(
  transacoes: Transacao[],
  maxCategorias = 6
): FatiaCategoria[] {
  const porCategoria = new Map<string, { nome: string; valor: number }>();

  for (const t of transacoes) {
    if (t.tipo !== "despesa") continue;
    const id = t.categoria_id ?? "sem-categoria";
    const nome = t.categorias?.nome ?? "Sem categoria";
    const atual = porCategoria.get(id);
    if (atual) {
      atual.valor += Number(t.valor);
    } else {
      porCategoria.set(id, { nome, valor: Number(t.valor) });
    }
  }

  const ordenado = Array.from(porCategoria.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.valor - a.valor);

  const principais = ordenado.slice(0, maxCategorias).map((c, i) => ({
    id: c.id,
    nome: c.nome,
    valor: c.valor,
    cor: CORES_CATEGORIAS[i % CORES_CATEGORIAS.length],
  }));

  const restante = ordenado.slice(maxCategorias);
  if (restante.length > 0) {
    const valorRestante = restante.reduce((acc, c) => acc + c.valor, 0);
    principais.push({ id: "outros", nome: "Outros", valor: valorRestante, cor: COR_OUTROS });
  }

  return principais;
}

export interface DiaHeatmap {
  dia: number;
  valor: number;
  /** 0 (sem gasto) a 4 (gasto mais alto do mês) */
  nivel: 0 | 1 | 2 | 3 | 4;
}

/**
 * Monta a grade de gastos por dia do mês informado, para o heatmap mensal.
 */
export function heatmapDoMes(transacoes: Transacao[], ano: number, mesNumero: number): DiaHeatmap[] {
  const ultimoDia = new Date(ano, mesNumero, 0).getDate();
  const porDia = new Array(ultimoDia + 1).fill(0) as number[];

  for (const t of transacoes) {
    if (t.tipo !== "despesa") continue;
    const dt = new Date(t.data + "T00:00:00");
    if (dt.getFullYear() !== ano || dt.getMonth() + 1 !== mesNumero) continue;
    porDia[dt.getDate()] += Number(t.valor);
  }

  const maiorValor = Math.max(0, ...porDia.slice(1));

  const dias: DiaHeatmap[] = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const valor = porDia[dia];
    let nivel: DiaHeatmap["nivel"] = 0;
    if (maiorValor > 0 && valor > 0) {
      const proporcao = valor / maiorValor;
      if (proporcao > 0.75) nivel = 4;
      else if (proporcao > 0.5) nivel = 3;
      else if (proporcao > 0.25) nivel = 2;
      else nivel = 1;
    }
    dias.push({ dia, valor, nivel });
  }
  return dias;
}
