import { supabase } from "@/lib/supabase/client";
import { NOMES_MES } from "@/lib/format";
import type { Investimento } from "./tipos";

/** Taxa CDI de referência (% ao ano) sugerida ao cadastrar um investimento
 * do tipo CDI — apenas um valor inicial editável, nunca aplicado sem o
 * usuário confirmar ou ajustar. */
export const TAXA_CDI_SUGERIDA = 13.9;

export interface NovoInvestimento {
  usuario_id: string;
  nome: string;
  tipo: Investimento["tipo"];
  valor_investido: number;
  valor_atual: number;
  taxa: number | null;
  descricao: string | null;
  tipo_ganho: "fixo" | "mensal" | null;
  data_inicio: string;
}

export async function listarInvestimentos(usuarioId: string): Promise<Investimento[]> {
  const { data } = await supabase
    .from("investimentos")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("data_criacao", { ascending: false });
  return (data as Investimento[]) ?? [];
}

export async function criarInvestimento(dados: NovoInvestimento) {
  return supabase.from("investimentos").insert(dados).select().single();
}

export async function atualizarTaxaInvestimento(id: string, taxa: number) {
  return supabase.from("investimentos").update({ taxa }).eq("id", id);
}

export async function atualizarValorAtualInvestimento(id: string, valorAtual: number) {
  return supabase.from("investimentos").update({ valor_atual: valorAtual }).eq("id", id);
}

export async function deletarInvestimento(id: string) {
  return supabase.from("investimentos").delete().eq("id", id);
}

function diasEntre(dataInicio: string, referencia: Date): number {
  const inicio = new Date(dataInicio + "T00:00:00");
  const diffMs = referencia.getTime() - inicio.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

type DadosCalculo = Pick<
  Investimento,
  "tipo" | "valor_investido" | "valor_atual" | "taxa" | "tipo_ganho" | "data_inicio"
>;

/**
 * Estima o valor atual de um investimento na data de hoje, a partir dos
 * dados informados pelo usuário (nunca inventa taxas ou cotações):
 * - CDI / Tesouro Direto: juros compostos anuais pela taxa informada.
 * - Empréstimo: ganho combinado fixo (uma vez) ou mensal (linear), com a
 *   taxa própria de cada empréstimo (cada um pode ter uma taxa diferente).
 * - Bolsa de Valores / Investimento próprio / Compra e revenda: sem cálculo
 *   automático — o valor é o que o usuário atualizou manualmente por
 *   último (no caso de "revenda", o valor de venda registrado).
 */
export function calcularValorAtualEstimado(inv: DadosCalculo, referencia: Date = new Date()): number {
  const principal = Number(inv.valor_investido);
  const taxa = inv.taxa != null ? Number(inv.taxa) : 0;
  const dias = diasEntre(inv.data_inicio, referencia);

  switch (inv.tipo) {
    case "cdi":
    case "tesouro": {
      const anos = dias / 365;
      return principal * Math.pow(1 + taxa / 100, anos);
    }
    case "emprestimo": {
      const ganho =
        inv.tipo_ganho === "mensal" ? principal * (taxa / 100) * (dias / 30) : principal * (taxa / 100);
      return principal + ganho;
    }
    case "bolsa":
    case "proprio":
    case "revenda":
    default:
      return Number(inv.valor_atual) || principal;
  }
}

export function calcularGanhoEstimado(inv: DadosCalculo, referencia: Date = new Date()): number {
  return calcularValorAtualEstimado(inv, referencia) - Number(inv.valor_investido);
}

/**
 * Ganho em cima do valor investido, em porcentagem (ex: comprou por 2000,
 * vendeu por 2600 → +30%). Útil especialmente pros tipos sem taxa (Bolsa,
 * Investimento próprio, Compra e revenda), onde o usuário pensa em "quanto
 * eu ganhei em cima do que paguei" em vez de um valor em R$.
 */
export function calcularPercentualGanho(inv: DadosCalculo, referencia: Date = new Date()): number {
  const principal = Number(inv.valor_investido);
  if (!principal) return 0;
  return (calcularGanhoEstimado(inv, referencia) / principal) * 100;
}

/** true quando o ganho do investimento é calculado automaticamente pela taxa. */
export function temCalculoAutomatico(tipo: Investimento["tipo"]): boolean {
  return tipo === "cdi" || tipo === "tesouro" || tipo === "emprestimo";
}

/** true pros tipos onde o usuário registra um valor de venda (em vez de só
 * "atualizar o valor atual" de forma genérica) — hoje só Compra e revenda. */
export function ehTipoRevenda(tipo: Investimento["tipo"]): boolean {
  return tipo === "revenda";
}

export interface PontoEvolucaoInvestimentos {
  mes: string;
  total: number;
}

function valorNaData(inv: Investimento, referencia: Date): number {
  const inicio = new Date(inv.data_inicio + "T00:00:00");
  if (inicio > referencia) return 0;

  if (temCalculoAutomatico(inv.tipo)) {
    return calcularValorAtualEstimado(inv, referencia);
  }

  // Bolsa / Investimento próprio: interpola entre o valor investido (início)
  // e o valor atual informado por último (hoje), já que não há histórico.
  const hoje = new Date();
  const principal = Number(inv.valor_investido);
  const alvo = Number(inv.valor_atual) || principal;
  const totalDias = Math.max(1, diasEntre(inv.data_inicio, hoje));
  const diasAteReferencia = Math.min(totalDias, diasEntre(inv.data_inicio, referencia));
  const progresso = diasAteReferencia / totalDias;
  return principal + (alvo - principal) * progresso;
}

/**
 * Evolução do total investido (todos os investimentos somados) nos últimos
 * `meses` meses, usada no gráfico de linha da tela "Meus investimentos".
 */
export function calcularEvolucaoInvestimentos(
  investimentos: Investimento[],
  meses = 6
): PontoEvolucaoInvestimentos[] {
  const agora = new Date();
  const pontos: PontoEvolucaoInvestimentos[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const fimDoMes = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 0);
    const total = investimentos.reduce((acc, inv) => acc + valorNaData(inv, fimDoMes), 0);
    pontos.push({ mes: NOMES_MES[fimDoMes.getMonth()], total });
  }
  return pontos;
}
