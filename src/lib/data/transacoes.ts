import { supabase } from "@/lib/supabase/client";
import { adicionarMeses } from "./investimentos";
import { campoEmpresa } from "@/lib/empresa/empresaAtiva";
import { similaridade } from "@/lib/util/texto";
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
  /** Empresa (só lançamentos do negócio) — preenchida sozinha a partir da
   * empresa escolhida na área "Minha empresa" (ver empresaAtiva.ts). */
  empresa_id?: string | null;
  /** Aporte/retirada de meta (itens 6.6/12.6): rastreia a origem. */
  meta_id?: string | null;
  /** Par de uma transferência entre contas próprias (mesmo UUID nas duas
   * pontas). Fica fora dos totais de entradas/saídas dos relatórios. */
  transferencia_id?: string | null;
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

export async function ajustarSaldoConta(contaId: string, delta: number) {
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
  const linha =
    transacao.tipo_negocio === "negocio" && !transacao.empresa_id ? { ...transacao, ...campoEmpresa() } : transacao;
  const { data, error } = await supabase.from("transacoes").insert(linha).select().single();

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

export async function atualizarTransacao(transacaoOriginal: Transacao, dadosEntrada: NovaTransacao) {
  // Ponta de transferência: o tipo (saída/entrada) não muda — senão o par
  // deixaria de se anular. Valor e data são espelhados na outra ponta abaixo.
  const dados: NovaTransacao = transacaoOriginal.transferencia_id
    ? { ...dadosEntrada, tipo: transacaoOriginal.tipo, transferencia_id: transacaoOriginal.transferencia_id }
    : dadosEntrada;
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
    // Transferência: a outra ponta acompanha valor e data (senão o dinheiro
    // "some" ou "aparece" entre as carteiras).
    if (transacaoOriginal.transferencia_id) {
      const { data: pares } = await supabase
        .from("transacoes")
        .select("*")
        .eq("transferencia_id", transacaoOriginal.transferencia_id)
        .neq("id", transacaoOriginal.id);
      for (const par of (pares as Transacao[]) ?? []) {
        if (Number(par.valor) === Number(dados.valor) && par.data === dados.data) continue;
        // eslint-disable-next-line no-await-in-loop
        const { error: e2 } = await supabase.from("transacoes").update({ valor: dados.valor, data: dados.data }).eq("id", par.id);
        if (!e2 && par.conta_id) {
          // eslint-disable-next-line no-await-in-loop
          await ajustarSaldoConta(par.conta_id, deltaDe(par.tipo, Number(dados.valor)) - deltaDe(par.tipo, Number(par.valor)));
        }
      }
    }
  }

  return { data, error };
}

/** Remove o arquivo de comprovante (bucket privado) antes de apagar a linha
 * — item 2.6: apagar o lançamento apaga o arquivo físico também. */
async function removerComprovante(transacaoId: string) {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch(`/api/comprovantes?transacao_id=${encodeURIComponent(transacaoId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // sem rede: o arquivo fica órfão no bucket privado (sem link nenhum).
  }
}

export async function deletarTransacao(transacao: Transacao) {
  if (transacao.comprovante_path) await removerComprovante(transacao.id);
  const { error } = await supabase.from("transacoes").delete().eq("id", transacao.id);

  // Transferência entre contas: apagar uma ponta apaga a outra (e devolve o
  // saldo das duas carteiras).
  if (!error && transacao.transferencia_id) {
    const { data: pares } = await supabase
      .from("transacoes")
      .select("*")
      .eq("transferencia_id", transacao.transferencia_id)
      .neq("id", transacao.id);
    for (const par of (pares as Transacao[]) ?? []) {
      const { error: e2 } = await supabase.from("transacoes").delete().eq("id", par.id);
      if (!e2 && par.conta_id) await ajustarSaldoConta(par.conta_id, -deltaDe(par.tipo, Number(par.valor)));
    }
  }

  if (!error && transacao.conta_id) {
    await ajustarSaldoConta(
      transacao.conta_id,
      -deltaDe(transacao.tipo, Number(transacao.valor))
    );
  }

  return { error };
}

/** Aviso de lançamento duplicado (item 6.7 da especificação de 03/out/2026):
 * procura outro lançamento do mesmo usuário, do mesmo tipo e valor, com data
 * até 3 dias de diferença e descrição parecida (similaridade de Levenshtein
 * >= 0,8). Só avisa — quem decide se grava mesmo assim é a pessoa. */
export async function buscarPossivelDuplicata(dados: Pick<NovaTransacao, "usuario_id" | "tipo" | "valor" | "descricao" | "data"> & { conta_id?: string | null }): Promise<Transacao | null> {
  const base = new Date(dados.data + "T00:00:00");
  const inicio = new Date(base);
  inicio.setDate(inicio.getDate() - 3);
  const fim = new Date(base);
  fim.setDate(fim.getDate() + 3);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const { data } = await supabase
    .from("transacoes")
    .select("*")
    .eq("usuario_id", dados.usuario_id)
    .eq("tipo", dados.tipo)
    .eq("valor", dados.valor)
    .gte("data", iso(inicio))
    .lte("data", iso(fim))
    .limit(20);
  // Item 5.7 (09/out/2026): "na mesma conta" — quando a conta foi escolhida,
  // só compara com lançamentos daquela conta.
  const candidatas = ((data as Transacao[]) ?? []).filter((t) => !dados.conta_id || t.conta_id === dados.conta_id);
  return candidatas.find((t) => similaridade(t.descricao ?? "", dados.descricao) >= 0.8) ?? null;
}

export const NOME_CATEGORIA_TRANSFERENCIA = "Transferência entre contas";

/** Ids das categorias padrão "Transferência entre contas" (receita e despesa). */
export async function idsCategoriasTransferencia(): Promise<string[]> {
  const { data } = await supabase
    .from("categorias")
    .select("id")
    .is("usuario_id", null)
    .eq("nome", NOME_CATEGORIA_TRANSFERENCIA);
  return ((data as { id: string }[]) ?? []).map((c) => c.id);
}

/** true para movimentos internos (não são receita nem despesa de verdade):
 * transferência entre contas próprias. Usado para os relatórios não somarem
 * dinheiro que só mudou de bolso (item 4.18). */
export function ehMovimentoInterno(t: Pick<Transacao, "transferencia_id" | "categorias">): boolean {
  return !!t.transferencia_id || t.categorias?.nome === NOME_CATEGORIA_TRANSFERENCIA;
}

/**
 * Transferência entre carteiras próprias (ex.: conta corrente → poupança,
 * ou pagar a fatura do cartão). Gera duas pontas ligadas pelo mesmo
 * `transferencia_id`: saída na origem e entrada no destino, na categoria
 * "Transferência entre contas". Não conta como gasto nem como receita nos
 * relatórios (item 4.18 da especificação de 09/out/2026).
 */
export async function criarTransferencia(params: {
  usuarioId: string;
  contaOrigemId: string;
  contaDestinoId: string;
  valor: number;
  data: string;
  descricao?: string;
}) {
  if (params.contaOrigemId === params.contaDestinoId) return { error: { message: "Escolha carteiras diferentes." } };
  if (!(params.valor > 0)) return { error: { message: "Digite um valor maior que zero." } };
  const { data: cats } = await supabase
    .from("categorias")
    .select("id, tipo")
    .is("usuario_id", null)
    .eq("nome", NOME_CATEGORIA_TRANSFERENCIA);
  const lista = (cats as { id: string; tipo: "receita" | "despesa" }[]) ?? [];
  const catSaida = lista.find((c) => c.tipo === "despesa")?.id ?? null;
  const catEntrada = lista.find((c) => c.tipo === "receita")?.id ?? null;
  const transferenciaId = crypto.randomUUID();
  const valor = Number(params.valor.toFixed(2));
  const descricao = (params.descricao?.trim() || "Transferência entre contas").slice(0, 120);
  const saida = await criarTransacao({
    usuario_id: params.usuarioId,
    conta_id: params.contaOrigemId,
    categoria_id: catSaida,
    tipo: "despesa",
    valor,
    descricao,
    data: params.data,
    forma_pagamento: "pix",
    tipo_negocio: "pessoal",
    transferencia_id: transferenciaId,
  });
  if (saida.error) return { error: saida.error };
  const entrada = await criarTransacao({
    usuario_id: params.usuarioId,
    conta_id: params.contaDestinoId,
    categoria_id: catEntrada,
    tipo: "receita",
    valor,
    descricao,
    data: params.data,
    forma_pagamento: "pix",
    tipo_negocio: "pessoal",
    transferencia_id: transferenciaId,
  });
  if (entrada.error && saida.data) {
    await deletarTransacao(saida.data as Transacao);
    return { error: entrada.error };
  }
  return { error: null };
}
