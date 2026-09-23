import { supabase } from "@/lib/supabase/client";
import { criarTransacao } from "./transacoes";
import type { Divida, DividaComProgresso, DividaParcela } from "./tipos";

/** Nome exato da categoria padrão "Dívida" — mesma constante usada em
 * NovaTransacaoModal.tsx (importada de lá pra nunca dessincronizar), pra
 * achar o id da categoria certa ao registrar um pagamento de parcela em um
 * clique (ver `registrarPagamentoParcela` abaixo). */
export const NOME_CATEGORIA_DIVIDA = "Dívida";

/** Lista as dívidas do usuário já com o progresso calculado — nunca lê um
 * "valor pago" salvo à parte (isso dessincronizaria do extrato real, ver
 * lição da seção 9 do contexto do projeto sobre contas fixas removidas sem
 * reverter o lançamento). Em vez disso, soma de verdade toda transação que
 * aponta pra cada dívida via `transacoes.divida_id`, sempre na hora. */
export async function listarDividasComProgresso(usuarioId: string): Promise<DividaComProgresso[]> {
  const { data: dividas } = await supabase
    .from("dividas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false });

  if (!dividas || dividas.length === 0) return [];

  const { data: pagamentos } = await supabase
    .from("transacoes")
    .select("divida_id, valor")
    .eq("usuario_id", usuarioId)
    .not("divida_id", "is", null);

  const totalPagoPorDivida = new Map<string, number>();
  (pagamentos ?? []).forEach((p) => {
    if (!p.divida_id) return;
    totalPagoPorDivida.set(p.divida_id, (totalPagoPorDivida.get(p.divida_id) ?? 0) + Number(p.valor));
  });

  return (dividas as Divida[]).map((d) => {
    // Trava em 0/total pra nunca mostrar "pago 110%" ou "falta -R$50" (ex:
    // usuário editou o valor total pra baixo depois de já ter pago mais).
    const valorPago = Math.min(totalPagoPorDivida.get(d.id) ?? 0, Number(d.valor_total));
    return {
      ...d,
      valor_pago: valorPago,
      valor_restante: Math.max(Number(d.valor_total) - valorPago, 0),
    };
  });
}

export interface NovaParcelaDivida {
  numero: number;
  valor: number;
  dataVencimento: string;
}

export interface OpcoesParcelamentoDivida {
  /** Quanto a pessoa pegou emprestado de verdade (principal) — opcional, só
   * pro simulador estático "vale a pena" (ver `calcularCustoJuros`). */
  valorEmprestado?: number | null;
  parcelas: NovaParcelaDivida[];
}

/** `parcelamento` é opcional — omitido, cria a dívida exatamente como
 * sempre (à vista, sem nenhuma parcela). Quando informado, marca
 * `parcelada = true` e cria as linhas em `divida_parcelas` numa segunda
 * chamada (mesmo padrão de "sem transação SQL cobrindo o lote todo" já
 * usado em `criarCompraParcelada`/`criarParcelasDoInvestimento` — aceitável
 * pro MVP; se a criação das parcelas falhar, a dívida já fica cadastrada,
 * só sem parcelas, e o erro é reportado pra pessoa tentar de novo). */
export async function criarDivida(
  usuarioId: string,
  nome: string,
  valorTotal: number,
  parcelamento?: OpcoesParcelamentoDivida
) {
  const { data: divida, error } = await supabase
    .from("dividas")
    .insert({
      usuario_id: usuarioId,
      nome,
      valor_total: valorTotal,
      parcelada: !!parcelamento,
      valor_emprestado: parcelamento?.valorEmprestado ?? null,
    })
    .select()
    .single();

  if (error || !divida || !parcelamento || parcelamento.parcelas.length === 0) {
    return { data: divida, error };
  }

  const linhas = parcelamento.parcelas.map((p) => ({
    divida_id: divida.id,
    usuario_id: usuarioId,
    numero: p.numero,
    valor: p.valor,
    data_vencimento: p.dataVencimento,
  }));
  const { error: erroParcelas } = await supabase.from("divida_parcelas").insert(linhas);
  return { data: divida, error: erroParcelas ?? null };
}

/** Lista as parcelas de todas as dívidas parceladas do usuário, ordenadas
 * por número — o status (paga/pendente/atrasada) de cada uma NUNCA vem
 * daqui, é calculado depois por `calcularStatusParcelasDivida`. */
export async function listarParcelasDivida(usuarioId: string): Promise<DividaParcela[]> {
  const { data } = await supabase
    .from("divida_parcelas")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("numero", { ascending: true });
  return (data as DividaParcela[]) ?? [];
}

export interface ParcelaDividaComStatus extends DividaParcela {
  paga: boolean;
  atrasada: boolean;
}

/**
 * Calcula o status de cada parcela por "cascata" (waterfall) sobre o total
 * já pago dessa dívida (o mesmo `valor_pago` de `listarDividasComProgresso`,
 * somado ao vivo de `transacoes.divida_id`) — nunca por um campo `pago`
 * guardado à parte, pra continuar valendo a regra de ouro do projeto
 * ("nunca dessincroniza do extrato real"). Ordena por número e vai
 * "consumindo" o valor pago parcela a parcela: se sobrar o bastante pra
 * cobrir 2 ou mais parcelas de uma vez (ex: a pessoa pagou 2 parcelas juntas
 * numa única anotação manual), as duas já aparecem pagas sozinhas, sem
 * precisar marcar nada na mão — pedido explícito do usuário em 23/set/2026.
 */
export function calcularStatusParcelasDivida(
  parcelas: DividaParcela[],
  valorPago: number
): ParcelaDividaComStatus[] {
  const ordenadas = [...parcelas].sort((a, b) => a.numero - b.numero);
  const hojeIso = new Date().toISOString().slice(0, 10);
  let restante = valorPago;
  return ordenadas.map((parcela) => {
    const valor = Number(parcela.valor);
    // Tolerância de 1 centavo pra arredondamento de ponto flutuante.
    const paga = restante >= valor - 0.005;
    if (paga) restante -= valor;
    return { ...parcela, paga, atrasada: !paga && parcela.data_vencimento < hojeIso };
  });
}

export interface ResumoParcelasDivida {
  pagas: number;
  total: number;
  atrasadas: number;
  proxima: ParcelaDividaComStatus | null;
}

export function resumirParcelasDivida(parcelas: ParcelaDividaComStatus[]): ResumoParcelasDivida {
  const pagas = parcelas.filter((p) => p.paga).length;
  const atrasadas = parcelas.filter((p) => p.atrasada).length;
  const proxima = parcelas.find((p) => !p.paga) ?? null;
  return { pagas, total: parcelas.length, atrasadas, proxima };
}

export interface CustoJurosDivida {
  valorEmprestado: number;
  valorTotalAPagar: number;
  jurosTotal: number;
  percentualJuros: number;
}

/**
 * Simulador estático "vale a pena?" — pedido do usuário em 23/set/2026: um
 * comparativo simples e ÚNICO (calculado uma vez, não um motor de juros
 * diário/atraso como o tipo Empréstimo de Investimentos, que é bem mais
 * complexo e não é o que foi pedido aqui) entre quanto a pessoa pegou
 * emprestado de verdade (`valor_emprestado`) e quanto vai pagar no total
 * (`valor_total`) — ex: "pegou R$50 mil, vai pagar R$100 mil, R$50 mil de
 * juros (100%)". `null` quando `valorEmprestado` não foi informado (campo
 * opcional) ou é inválido.
 */
export function calcularCustoJuros(valorTotal: number, valorEmprestado: number | null): CustoJurosDivida | null {
  if (valorEmprestado == null || !Number.isFinite(valorEmprestado) || valorEmprestado <= 0) return null;
  const jurosTotal = valorTotal - valorEmprestado;
  const percentualJuros = (jurosTotal / valorEmprestado) * 100;
  return { valorEmprestado, valorTotalAPagar: valorTotal, jurosTotal, percentualJuros };
}

/**
 * Registra o pagamento de UMA parcela em "um clique": cria uma transação
 * normal (reaproveita `criarTransacao`, mesmo ajuste de saldo da conta de
 * qualquer lançamento) já com `divida_id` preenchido e categoria "Dívida" —
 * o progresso da dívida e o status das parcelas atualizam sozinhos no
 * próximo carregamento, pela soma real do extrato (ver
 * `listarDividasComProgresso`/`calcularStatusParcelasDivida`), exatamente
 * como qualquer outro pagamento de dívida já funciona. O caminho manual
 * (selecionar "Qual dívida?" na anotação normal, cobrindo 1 ou mais
 * parcelas de uma vez) continua funcionando do lado de fora, sem mudança
 * nenhuma.
 */
export async function registrarPagamentoParcela(params: {
  usuarioId: string;
  dividaId: string;
  dividaNome: string;
  parcela: DividaParcela;
  totalParcelas?: number;
  contaId: string | null;
  categoriaId: string;
  data?: string;
}) {
  const rotulo = params.totalParcelas
    ? `${params.dividaNome} (parcela ${params.parcela.numero}/${params.totalParcelas})`
    : `${params.dividaNome} (parcela ${params.parcela.numero})`;
  return criarTransacao({
    usuario_id: params.usuarioId,
    conta_id: params.contaId,
    categoria_id: params.categoriaId,
    tipo: "despesa",
    valor: Number(params.parcela.valor),
    descricao: rotulo,
    data: params.data ?? new Date().toISOString().slice(0, 10),
    forma_pagamento: null,
    tipo_negocio: "pessoal",
    divida_id: params.dividaId,
  });
}

export async function alternarQuitadaDivida(dividaId: string, quitada: boolean) {
  return supabase.from("dividas").update({ quitada }).eq("id", dividaId);
}

/** Edita os dados base da dívida (nome, valor total) depois de já cadastrada
 * — pedido do usuário em 22/set/2026 ("tem como a pessoa editar tudo?"):
 * antes só dava pra apagar e recriar. Não mexe em `quitada` — isso continua
 * só pelo toggle "Marcar como quitada"/"Reabrir", e o valor pago continua
 * sempre calculado a partir do extrato real (ver `listarDividasComProgresso`
 * acima), nunca editável diretamente. */
export async function atualizarDivida(dividaId: string, dados: { nome: string; valorTotal: number }) {
  return supabase.from("dividas").update({ nome: dados.nome, valor_total: dados.valorTotal }).eq("id", dividaId);
}

/**
 * Em quantos meses a dívida é quitada, simulando um pagamento mensal
 * hipotético constante a partir de hoje — pedido do usuário em 22/set/2026,
 * mesma lógica do Bloco 8 item "h" ("pagando X por mês, quita em Y meses") e
 * do simulador equivalente em Metas (`calcularMesesParaAtingirMeta`): não é
 * baseado no ritmo histórico de pagamentos, é um simulador com um valor
 * hipotético digitado pela pessoa. `null` quando o valor mensal é
 * inválido/zero.
 */
export function calcularMesesParaQuitar(valorRestante: number, pagamentoMensal: number): number | null {
  if (valorRestante <= 0) return 0;
  if (!Number.isFinite(pagamentoMensal) || pagamentoMensal <= 0) return null;
  return Math.ceil(valorRestante / pagamentoMensal);
}

/** Apaga só o cadastro da dívida — os pagamentos já anotados continuam
 * intactos em `transacoes` (só perdem a referência, `divida_id` vira null
 * via ON DELETE SET NULL), exatamente como uma conta fixa removida nunca
 * apaga os lançamentos que ela já gerou (ver seção 9 do contexto). */
export async function removerDivida(dividaId: string) {
  return supabase.from("dividas").delete().eq("id", dividaId);
}
