import { supabase } from "@/lib/supabase/client";
import { adicionarMeses } from "./investimentos";
import type { Transacao } from "./tipos";

export interface NovaTransacao {
  usuario_id: string;
  conta_id: string | null;
  categoria_id: string | null;
  tipo: "receita" | "despesa";
  valor: number;
  descricao: string;
  data: string;
  forma_pagamento: Transacao["forma_pagamento"];
  tipo_negocio: Transacao["tipo_negocio"];
  /** Opcionais: só preenchidos quando a transação vem de uma conta fixa
   * recorrente (ver src/lib/data/contasFixas.ts). Omitidos em todo
   * lançamento manual, que continua exatamente como antes. */
  is_recorrente?: boolean;
  recorrencia?: Transacao["recorrencia"];
  conta_fixa_id?: string | null;
  /** Opcional: só preenchido quando o usuário anotou um pagamento na
   * categoria "Dívida" e escolheu a qual dívida ele se refere (ver
   * src/lib/data/dividas.ts). Omitido em todo lançamento que não é
   * pagamento de dívida. */
  divida_id?: string | null;
  /** Opcional: data real de vencimento desse lançamento (ver comentário em
   * `Transacao.data_vencimento`, tipos.ts). Omitido = sem vencimento. */
  data_vencimento?: string | null;
  /** Opcionais: só preenchidos quando esse lançamento é uma parcela de uma
   * compra parcelada comum (ver `criarCompraParcelada` abaixo e comentário
   * em `Transacao.grupo_parcela_id`, tipos.ts). Omitidos em todo lançamento
   * avulso, como sempre foi. */
  grupo_parcela_id?: string | null;
  parcela_numero?: number | null;
  parcela_total?: number | null;
}

export async function listarTransacoes(
  usuarioId: string,
  filtros?: { inicio?: string; fim?: string; categoriaId?: string; tipo?: "receita" | "despesa" }
): Promise<Transacao[]> {
  let query = supabase
    .from("transacoes")
    .select("*, categorias(*)")
    .eq("usuario_id", usuarioId)
    .order("data", { ascending: false })
    .order("criado_em", { ascending: false });

  if (filtros?.inicio) query = query.gte("data", filtros.inicio);
  if (filtros?.fim) query = query.lte("data", filtros.fim);
  if (filtros?.categoriaId) query = query.eq("categoria_id", filtros.categoriaId);
  if (filtros?.tipo) query = query.eq("tipo", filtros.tipo);

  const { data } = await query;
  return (data as Transacao[]) ?? [];
}

export interface DescricaoUsada {
  descricao: string;
  tipo: "receita" | "despesa";
}

export async function listarDescricoesUsadas(usuarioId: string, limite = 300): Promise<DescricaoUsada[]> {
  const { data } = await supabase
    .from("transacoes")
    .select("descricao, tipo")
    .eq("usuario_id", usuarioId)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (!data) return [];

  const contagem = new Map<string, { descricao: string; tipo: "receita" | "despesa"; vezes: number }>();
  for (const row of data as { descricao: string; tipo: "receita" | "despesa" }[]) {
    const descricao = row.descricao?.trim();
    if (!descricao) continue;
    const chave = `${row.tipo}::${descricao.toLowerCase()}`;
    const atual = contagem.get(chave);
    if (atual) {
      atual.vezes += 1;
    } else {
      contagem.set(chave, { descricao, tipo: row.tipo, vezes: 1 });
    }
  }

  return Array.from(contagem.values())
    .sort((a, b) => b.vezes - a.vezes)
    .slice(0, 40);
}

export async function contarTransacoesDoMes(usuarioId: string, inicio: string, fim: string) {
  const { count } = await supabase
    .from("transacoes")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuarioId)
    .gte("data", inicio)
    .lte("data", fim);
  return count ?? 0;
}

function deltaDe(tipo: "receita" | "despesa", valor: number) {
  return tipo === "receita" ? valor : -valor;
}

async function ajustarSaldoConta(contaId: string, delta: number) {
  const { data: conta } = await supabase
    .from("contas")
    .select("saldo_atual")
    .eq("id", contaId)
    .single();
  if (conta) {
    await supabase
      .from("contas")
      .update({ saldo_atual: Number(conta.saldo_atual) + delta })
      .eq("id", contaId);
  }
}

export async function criarTransacao(transacao: NovaTransacao) {
  const { data, error } = await supabase.from("transacoes").insert(transacao).select().single();

  if (!error && transacao.conta_id) {
    await ajustarSaldoConta(transacao.conta_id, deltaDe(transacao.tipo, transacao.valor));
  }

  return { data, error };
}

/** Cria uma "compra parcelada comum" (ex: "celular em 10x", sem ser
 * investimento — Bloco 2 do pacote de 36 itens, 22/set/2026): gera
 * `numeroParcelas` lançamentos independentes, um por mês a partir da data
 * de `base` (mesmo helper `adicionarMeses` já usado nas parcelas de
 * investimento, que trata corretamente mês mais curto/virada de ano), cada
 * um com o valor de UMA parcela (`base.valor` já deve ser o valor por
 * parcela, não o total da compra). Cada parcela é uma `transacao` normal
 * de verdade (não uma tabela nova) — aparece sozinha no extrato, na fatura
 * do cartão (por já cair no ciclo certo pela própria `data`) e pode ser
 * editada/apagada individualmente pelo fluxo já existente (Bloco 1), sem
 * nenhum código novo pra isso. `grupo_parcela_id` só serve pra mostrar o
 * selo "3/10" na lista (ver ExtratoCompleto.tsx) — não é uma FK de verdade.
 *
 * Reaproveita `criarTransacao` (não um insert em lote) pra manter o ajuste
 * de saldo da conta por linha exatamente como já funciona hoje pra
 * qualquer lançamento — mesmo efeito de uma pessoa lançando as N parcelas
 * manualmente, só que de uma vez. Se alguma parcela falhar no meio, as
 * anteriores já ficam gravadas (sem transação SQL cobrindo o lote todo) —
 * aceitável pro MVP, mesmo padrão de "sem infra nova" do resto do projeto;
 * o erro é reportado pra a pessoa conferir/completar manualmente se
 * precisar. */
export async function criarCompraParcelada(base: NovaTransacao, numeroParcelas: number) {
  const grupoParcelaId = crypto.randomUUID();
  const resultados: { data: Transacao | null; error: unknown }[] = [];

  for (let i = 0; i < numeroParcelas; i++) {
    const parcela: NovaTransacao = {
      ...base,
      data: i === 0 ? base.data : adicionarMeses(base.data, i),
      descricao: `${base.descricao} (${i + 1}/${numeroParcelas})`,
      grupo_parcela_id: grupoParcelaId,
      parcela_numero: i + 1,
      parcela_total: numeroParcelas,
    };
    // eslint-disable-next-line no-await-in-loop -- precisa ser sequencial:
    // cada parcela ajusta o saldo da conta (ver criarTransacao), então
    // rodar em paralelo arriscaria uma condição de corrida no
    // ajustarSaldoConta (leitura-e-escrita do mesmo saldo_atual).
    resultados.push(await criarTransacao(parcela));
  }

  const erro = resultados.find((r) => r.error)?.error ?? null;
  return { data: resultados.map((r) => r.data), error: erro };
}

export async function atualizarTransacao(transacaoOriginal: Transacao, dados: NovaTransacao) {
  const { data, error } = await supabase
    .from("transacoes")
    .update(dados)
    .eq("id", transacaoOriginal.id)
    .select()
    .single();

  if (!error) {
    // Desfaz o efeito da versão antiga no saldo da conta de origem...
    if (transacaoOriginal.conta_id) {
      await ajustarSaldoConta(
        transacaoOriginal.conta_id,
        -deltaDe(transacaoOriginal.tipo, Number(transacaoOriginal.valor))
      );
    }
    // ...e aplica o efeito da versão nova (pode ser a mesma conta ou outra).
    if (dados.conta_id) {
      await ajustarSaldoConta(dados.conta_id, deltaDe(dados.tipo, dados.valor));
    }
  }

  return { data, error };
}

export async function deletarTransacao(transacao: Transacao) {
  const { error } = await supabase.from("transacoes").delete().eq("id", transacao.id);

  if (!error && transacao.conta_id) {
    await ajustarSaldoConta(
      transacao.conta_id,
      -deltaDe(transacao.tipo, Number(transacao.valor))
    );
  }

  return { error };
}
