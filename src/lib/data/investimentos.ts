import { supabase } from "@/lib/supabase/client";
import { NOMES_MES } from "@/lib/format";
import type { Investimento, ParcelaInvestimento } from "./tipos";

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
  forma_pagamento: "vista" | "parcelado" | null;
  numero_parcelas: number | null;
  valor_parcela: number | null;
  periodicidade_parcelas: "mensal" | "quinzenal" | "semanal" | null;
  valor_retornavel: number | null;
  data_vencimento_final: string | null;
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

/** Soma meses a uma data "YYYY-MM-DD" mantendo o dia (ajustado pro último
 * dia do mês quando o mês de destino for mais curto, ex: 31/jan + 1 mês =
 * 28 ou 29/fev, nunca março). Cálculo só com aritmética de calendário —
 * sem passar por Date→ISO, que converteria pra UTC e poderia mudar o dia. */
function adicionarMeses(dataIso: string, meses: number): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const totalMeses = mes - 1 + meses;
  const novoAno = ano + Math.floor(totalMeses / 12);
  const novoMes = ((totalMeses % 12) + 12) % 12;
  const ultimoDiaDoMes = new Date(novoAno, novoMes + 1, 0).getDate();
  const novoDia = Math.min(dia, ultimoDiaDoMes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${novoAno}-${pad(novoMes + 1)}-${pad(novoDia)}`;
}

/** Soma dias a uma data "YYYY-MM-DD" (usado pras periodicidades quinzenal e
 * semanal). Feito com `new Date(ano, mes-1, dia + dias)` — números soltos,
 * sem passar por string ISO/UTC — o próprio JS já rola pro mês/ano seguinte
 * corretamente quando o dia estoura o mês, sem risco de mudar de dia por
 * causa de fuso horário. */
function adicionarDias(dataIso: string, dias: number): string {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia + dias);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Formata um `Date` local como "YYYY-MM-DD", pra poder reaproveitar
 * `adicionarMeses` (que já trata corretamente meses mais curtos e virada de
 * ano, inclusive com offsets negativos) em qualquer cálculo que precise
 * "voltar N meses" a partir de hoje. */
function formatarDataIso(data: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}`;
}

export type PeriodicidadeParcelas = "mensal" | "quinzenal" | "semanal";

/**
 * As N datas de vencimento "sugeridas" pro app pré-preencher o formulário de
 * parcelamento, uma por período (mensal, quinzenal ou semanal) a partir de
 * um período após a data de início. O usuário pode editar qualquer uma
 * manualmente antes de salvar (ex: combinaram parcelas com frequência
 * mista) — por isso isso é separado de `criarParcelasDoInvestimento`, que
 * só grava o que vier no array final (editado ou não).
 */
export function gerarDatasSugeridasParcelas(
  dataInicio: string,
  numeroParcelas: number,
  periodicidade: PeriodicidadeParcelas = "mensal"
): string[] {
  const dataVencimento = (indiceParcela: number) => {
    if (periodicidade === "quinzenal") return adicionarDias(dataInicio, indiceParcela * 15);
    if (periodicidade === "semanal") return adicionarDias(dataInicio, indiceParcela * 7);
    return adicionarMeses(dataInicio, indiceParcela);
  };
  return Array.from({ length: Math.max(0, numeroParcelas) }, (_, i) => dataVencimento(i + 1));
}

/**
 * As N valores "sugeridos" pro app pré-preencher o formulário de
 * parcelamento — divide `valorTotal` em partes iguais (a última absorve a
 * diferença de arredondamento pra a soma bater certinho). O usuário pode
 * editar qualquer uma manualmente antes de salvar (ex: combinaram parcelas
 * de valores diferentes, tipo R$600 numa data e R$500 noutra) — por isso
 * isso é separado de `criarParcelasDoInvestimento`, que só grava o que vier
 * no array final (editado ou não). Mesmo padrão já usado em
 * `gerarDatasSugeridasParcelas` pras datas.
 */
export function gerarValoresSugeridosParcelas(valorTotal: number, numeroParcelas: number): number[] {
  if (numeroParcelas < 1 || !Number.isFinite(valorTotal)) return [];
  const valorBase = Math.round((valorTotal / numeroParcelas) * 100) / 100;
  return Array.from({ length: numeroParcelas }, (_, i) => {
    const ultima = i === numeroParcelas - 1;
    return ultima ? Number((valorTotal - valorBase * (numeroParcelas - 1)).toFixed(2)) : valorBase;
  });
}

/**
 * Gera as parcelas de um investimento parcelado (empréstimo recebido de
 * volta, celular financiado etc.) — cada uma com o valor e a data
 * informados em `valoresVencimento`/`datasVencimento` (um par por parcela,
 * na ordem — normalmente os sugeridos por `gerarValoresSugeridosParcelas`/
 * `gerarDatasSugeridasParcelas`, possivelmente editados manualmente pelo
 * usuário pra combinar valores ou frequência diferentes entre parcelas, ex:
 * uma parcela de R$600 numa data e outra de R$500 noutra). Nenhuma é
 * marcada como paga — isso é sempre manual.
 */
export async function criarParcelasDoInvestimento(
  investimentoId: string,
  usuarioId: string,
  numeroParcelas: number,
  datasVencimento: string[],
  valoresVencimento: number[]
) {
  if (numeroParcelas < 2) {
    return { data: null, error: null };
  }
  if (datasVencimento.length !== numeroParcelas || valoresVencimento.length !== numeroParcelas) {
    return { data: null, error: new Error("Número de datas/valores não bate com o número de parcelas.") };
  }
  if (valoresVencimento.some((v) => !Number.isFinite(v) || v <= 0)) {
    return { data: null, error: new Error("Todas as parcelas precisam de um valor válido.") };
  }
  const parcelas = Array.from({ length: numeroParcelas }, (_, i) => ({
    investimento_id: investimentoId,
    usuario_id: usuarioId,
    numero: i + 1,
    data_vencimento: datasVencimento[i],
    valor: Number(valoresVencimento[i].toFixed(2)),
    pago: false,
  }));
  return supabase.from("investimento_parcelas").insert(parcelas);
}

/** Recalcula `investimentos.data_vencimento_final` como o vencimento mais
 * tardio entre as parcelas do investimento, e grava no banco. Chamado depois
 * de criar as parcelas e sempre que uma data individual é editada
 * manualmente (ver `atualizarDataVencimentoParcela`) — mantém essa coluna
 * como a fonte única de "até quando o ganho do empréstimo cresce", mesmo
 * quando as parcelas têm frequência combinada de forma mista (algumas
 * quinzenais, outras mensais, editadas à mão). */
export async function recalcularVencimentoFinalDoInvestimento(investimentoId: string) {
  const { data } = await supabase
    .from("investimento_parcelas")
    .select("data_vencimento")
    .eq("investimento_id", investimentoId);
  const datas = ((data as { data_vencimento: string }[]) ?? []).map((p) => p.data_vencimento);
  if (datas.length === 0) return { data: null, error: null };
  const maisTarde = datas.reduce((acc, d) => (d > acc ? d : acc), datas[0]);
  return supabase.from("investimentos").update({ data_vencimento_final: maisTarde }).eq("id", investimentoId);
}

/** Edita manualmente o vencimento de UMA parcela (ex: o combinado real foi
 * quinzenal/mensal misturado, ou a pessoa remarcou uma data) e mantém
 * `data_vencimento_final` do investimento sincronizado depois. */
export async function atualizarDataVencimentoParcela(
  parcelaId: string,
  investimentoId: string,
  novaData: string
) {
  const { error } = await supabase
    .from("investimento_parcelas")
    .update({ data_vencimento: novaData })
    .eq("id", parcelaId);
  if (error) return { data: null, error };
  return recalcularVencimentoFinalDoInvestimento(investimentoId);
}

export async function listarParcelas(usuarioId: string): Promise<ParcelaInvestimento[]> {
  const { data } = await supabase
    .from("investimento_parcelas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("numero", { ascending: true });
  return (data as ParcelaInvestimento[]) ?? [];
}

export async function marcarParcelaPaga(id: string, pago: boolean) {
  return supabase
    .from("investimento_parcelas")
    .update({ pago, data_pagamento: pago ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", id);
}

/** true quando a parcela venceu e ainda não foi marcada como paga. */
export function parcelaEstaAtrasada(parcela: ParcelaInvestimento, referencia: Date = new Date()): boolean {
  if (parcela.pago) return false;
  const vencimento = new Date(parcela.data_vencimento + "T00:00:00");
  const hoje = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  return vencimento < hoje;
}

export interface ResumoParcelas {
  pagas: number;
  total: number;
  atrasadas: number;
  proxima: ParcelaInvestimento | null;
}

export function resumirParcelas(parcelas: ParcelaInvestimento[]): ResumoParcelas {
  const pagas = parcelas.filter((p) => p.pago).length;
  const atrasadas = parcelas.filter((p) => parcelaEstaAtrasada(p)).length;
  const proxima = parcelas.find((p) => !p.pago) ?? null;
  return { pagas, total: parcelas.length, atrasadas, proxima };
}

export async function atualizarTaxaInvestimento(id: string, taxa: number) {
  return supabase.from("investimentos").update({ taxa }).eq("id", id);
}

export async function atualizarValorAtualInvestimento(id: string, valorAtual: number) {
  return supabase.from("investimentos").update({ valor_atual: valorAtual }).eq("id", id);
}

/** Edita o combinado de um empréstimo depois de já criado (ex: renegociou o
 * valor ou a data com a pessoa) — só faz sentido pro empréstimo à vista,
 * já que o parcelado tem `data_vencimento_final` sempre derivado das
 * parcelas (ver `recalcularVencimentoFinalDoInvestimento`). */
export async function atualizarEmprestimoInvestimento(
  id: string,
  dados: { valor_retornavel: number; data_vencimento_final: string }
) {
  return supabase
    .from("investimentos")
    .update({ valor_retornavel: dados.valor_retornavel, data_vencimento_final: dados.data_vencimento_final })
    .eq("id", id);
}

export async function deletarInvestimento(id: string) {
  return supabase.from("investimentos").delete().eq("id", id);
}

function diasEntre(dataInicio: string, referencia: Date): number {
  const inicio = new Date(dataInicio + "T00:00:00");
  const diffMs = referencia.getTime() - inicio.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** Dias entre duas datas "YYYY-MM-DD" (a segunda menos a primeira). Usado
 * pro empréstimo, onde o "hoje" não importa — o que importa é o tamanho da
 * janela entre a data de início e a data de vencimento combinada. */
function diasEntreDatas(dataInicioIso: string, dataFimIso: string): number {
  const inicio = new Date(dataInicioIso + "T00:00:00");
  const fim = new Date(dataFimIso + "T00:00:00");
  return Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24));
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), maximo);
}

type DadosCalculo = Pick<
  Investimento,
  | "tipo"
  | "valor_investido"
  | "valor_atual"
  | "taxa"
  | "tipo_ganho"
  | "data_inicio"
  | "valor_retornavel"
  | "data_vencimento_final"
>;

/**
 * Estima o valor atual de um investimento na data de hoje, a partir dos
 * dados informados pelo usuário (nunca inventa taxas ou cotações):
 * - CDI / Tesouro Direto: juros compostos anuais pela taxa informada.
 * - Empréstimo: o ganho combinado (`valor_retornavel - valor_investido`)
 *   cresce linearmente da data_inicio até a data_vencimento_final — no dia
 *   do vencimento o valor bate exatamente `valor_retornavel`, e continua
 *   nesse teto depois (a dívida não cresce mais, mesmo sem ter sido
 *   marcada como paga). Empréstimos antigos, criados antes de existir
 *   `valor_retornavel`/`data_vencimento_final` (ambos nulos), continuam
 *   calculando do jeito legado: taxa fixa (uma vez) ou taxa ao mês
 *   (linear, sem data de término).
 * - Bolsa de Valores / Compra e revenda: sem cálculo automático — o valor é
 *   o que o usuário atualizou manualmente por último (no caso de "revenda",
 *   o valor de venda registrado).
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
      if (inv.valor_retornavel != null && inv.data_vencimento_final != null) {
        const totalComJuros = Number(inv.valor_retornavel);
        const juros = totalComJuros - principal;
        const totalDias = Math.max(1, diasEntreDatas(inv.data_inicio, inv.data_vencimento_final));
        const diasPassados = limitar(diasEntre(inv.data_inicio, referencia), 0, totalDias);
        const progresso = diasPassados / totalDias;
        return principal + juros * progresso;
      }
      // Legado (empréstimo criado antes desta mudança, sem valor_retornavel).
      const ganho =
        inv.tipo_ganho === "mensal" ? principal * (taxa / 100) * (dias / 30) : principal * (taxa / 100);
      return principal + ganho;
    }
    case "bolsa":
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
 * Compra e revenda), onde o usuário pensa em "quanto eu ganhei em cima do
 * que paguei" em vez de um valor em R$.
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

/**
 * Estima o valor de UM investimento numa data qualquer (passada ou futura),
 * não só hoje — usado tanto no gráfico de evolução quanto no cálculo de
 * "ganho no período" (ver `calcularGanhoNoPeriodo`). Antes da data_inicio,
 * o investimento ainda não existia, então vale 0.
 */
export function calcularValorNaData(inv: Investimento, referencia: Date): number {
  const inicio = new Date(inv.data_inicio + "T00:00:00");
  if (inicio > referencia) return 0;

  if (temCalculoAutomatico(inv.tipo)) {
    return calcularValorAtualEstimado(inv, referencia);
  }

  // Bolsa / Compra e revenda: interpola entre o valor investido (início) e
  // o valor atual informado por último (hoje), já que não há histórico.
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
    const total = investimentos.reduce((acc, inv) => acc + calcularValorNaData(inv, fimDoMes), 0);
    pontos.push({ mes: NOMES_MES[fimDoMes.getMonth()], total });
  }
  return pontos;
}

/** Só o ganho (valor acima do principal investido) de UM investimento numa
 * data qualquer — 0 antes de existir, `calcularValorNaData - valor_investido`
 * depois. Separado de `calcularValorNaData` porque "ganho no período" (ver
 * abaixo) precisa isolar só a parte que cresceu, sem contar capital novo. */
function calcularGanhoAcumuladoNaData(inv: Investimento, referencia: Date): number {
  const inicio = new Date(inv.data_inicio + "T00:00:00");
  if (inicio > referencia) return 0;
  return calcularValorNaData(inv, referencia) - Number(inv.valor_investido);
}

/**
 * Quanto os investimentos (já filtrados por tipo, ou todos, a critério de
 * quem chama) ganharam nos últimos `meses` meses — ou seja, o crescimento
 * do ganho acumulado dentro dessa janela, sem contar o principal (então
 * cadastrar um empréstimo novo dentro do período conta só o juros dele
 * proporcional ao tempo decorrido, não o valor emprestado inteiro). Usado
 * tanto na visão "todos combinados" quanto no mini-dashboard de cada tipo,
 * pra responder "quanto eu ganhei só de CDI (ou só de empréstimo) nos
 * últimos 6 meses".
 */
export function calcularGanhoNoPeriodo(investimentos: Investimento[], meses: number): number {
  const hoje = new Date();
  // Usa `adicionarMeses` (com offset negativo) em vez de `new Date(ano, mes -
  // meses, dia)` cru — o construtor de Date "rola pra frente" em vez de
  // clampar quando o mês de destino é mais curto (ex: 31/ago - 6 meses vira
  // 03/mar em vez de 28/fev), o que encurtava a janela do período sem avisar.
  const dataPassada = new Date(adicionarMeses(formatarDataIso(hoje), -meses) + "T00:00:00");
  return investimentos.reduce((acc, inv) => {
    const ganhoHoje = calcularGanhoAcumuladoNaData(inv, hoje);
    const ganhoPassado = calcularGanhoAcumuladoNaData(inv, dataPassada);
    return acc + (ganhoHoje - ganhoPassado);
  }, 0);
}
