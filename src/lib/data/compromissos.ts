import { listarContasFixas } from "./contasFixas";
import { listarDividasComProgresso, listarParcelasDivida, calcularStatusParcelasDivida } from "./dividas";
import { listarInvestimentos, listarParcelas } from "./investimentos";
import { hojeIso, somarDias } from "@/lib/util/texto";

export interface Compromisso {
  id: string;
  titulo: string;
  valor: number;
  sentido: "entrada" | "saida";
  /** yyyy-mm-dd */
  data: string;
  atrasado: boolean;
  href: string;
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Compromissos financeiros pessoais pendentes (vencidos + próximos `dias`
 * dias): contas fixas ainda não lançadas, parcelas de dívidas em aberto e
 * parcelas a receber de empréstimos/revendas. Alimenta a "Visão de hoje"
 * (6.4) e a projeção de liquidez (6.5).
 */
export async function listarCompromissosPessoais(usuarioId: string, dias = 30): Promise<Compromisso[]> {
  const hoje = hojeIso();
  const limite = somarDias(hoje, dias);
  const [fixas, dividas, parcelasDivida, investimentos, parcelasInv] = await Promise.all([
    listarContasFixas(usuarioId),
    listarDividasComProgresso(usuarioId),
    listarParcelasDivida(usuarioId),
    listarInvestimentos(usuarioId),
    listarParcelas(usuarioId),
  ]);
  const itens: Compromisso[] = [];

  // Contas fixas: a ocorrência do mês atual (se ainda não foi lançada) e as
  // dos próximos meses que caem dentro da janela.
  const agora = new Date();
  for (const cf of fixas) {
    if (!cf.ativa) continue;
    for (let m = 0; m <= Math.ceil(dias / 28); m++) {
      const ano = agora.getFullYear();
      const mesIdx = agora.getMonth() + m;
      const ultimoDia = new Date(ano, mesIdx + 1, 0).getDate();
      const d = new Date(ano, mesIdx, Math.min(cf.dia_vencimento, ultimoDia));
      const data = isoLocal(d);
      if (data > limite) continue;
      if (cf.data_inicio > data || (cf.data_fim && cf.data_fim < data)) continue;
      const jaGerada = cf.ultimo_ano_gerado === d.getFullYear() && cf.ultimo_mes_gerado === d.getMonth() + 1;
      if (jaGerada) continue;
      if (m === 0 && data < hoje) continue; // o sistema lança sozinho no dia
      itens.push({
        id: `cf-${cf.id}-${data}`,
        titulo: cf.descricao,
        valor: Number(cf.valor),
        sentido: cf.tipo === "receita" ? "entrada" : "saida",
        data,
        atrasado: false,
        href: "/dashboard/contas-fixas",
      });
    }
  }

  // Dívidas parceladas: status por cascata do valor já pago.
  for (const d of dividas) {
    if (d.quitada) continue;
    const parcelas = calcularStatusParcelasDivida(parcelasDivida.filter((p) => p.divida_id === d.id), d.valor_pago);
    for (const p of parcelas) {
      if (p.paga || p.data_vencimento > limite) continue;
      itens.push({
        id: `dv-${p.id}`,
        titulo: `${d.nome} — parcela ${p.numero}`,
        valor: Number(p.valor),
        sentido: "saida",
        data: p.data_vencimento,
        atrasado: p.data_vencimento < hoje,
        href: "/dashboard/dividas",
      });
    }
  }

  // Parcelas a receber (empréstimos e compra e revenda).
  const nomes = new Map(investimentos.map((i) => [i.id, i.nome]));
  for (const p of parcelasInv) {
    if (p.pago || p.data_vencimento > limite) continue;
    if (!nomes.has(p.investimento_id)) continue;
    itens.push({
      id: `iv-${p.id}`,
      titulo: `${nomes.get(p.investimento_id)} — parcela ${p.numero}`,
      valor: Number(p.valor),
      sentido: "entrada",
      data: p.data_vencimento,
      atrasado: p.data_vencimento < hoje,
      href: "/dashboard/investimentos",
    });
  }

  return itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}
