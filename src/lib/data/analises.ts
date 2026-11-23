import { supabase } from "@/lib/supabase/client";
import type { Transacao, AnaliseIA } from "./tipos";
import type { Perfil } from "@/lib/auth/AuthProvider";
import { listarMetas } from "./metas";

function limitesDoMes(ano: number, mes: number) {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
  const fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  return { inicio, fim };
}

async function transacoesDoMes(usuarioId: string, ano: number, mes: number): Promise<Transacao[]> {
  const { inicio, fim } = limitesDoMes(ano, mes);
  const { data } = await supabase
    .from("transacoes")
    .select("*, categorias(*)")
    .eq("usuario_id", usuarioId)
    .gte("data", inicio)
    .lte("data", fim);
  return (data as Transacao[]) ?? [];
}

function somar(transacoes: Transacao[], tipo: "receita" | "despesa") {
  return transacoes.filter((t) => t.tipo === tipo).reduce((acc, t) => acc + Number(t.valor), 0);
}

export interface ResumoMensal {
  entradas: number;
  saidas: number;
  saldo: number;
  variacaoPercentual: number | null;
  maioresGastos: { categoria: string; valor: number }[];
  recomendacoes: string[];
  /** Mês com bem menos anotações que o anterior — comparação pouco confiável. */
  poucosLancamentos?: boolean;
}

/**
 * Resumo do mês da área "Minha vida" — só considera dados pessoais (o
 * negócio tem seu próprio resumo em "Painel da empresa", pra não misturar
 * as duas coisas na mesma tela). "Pessoal" inclui lançamentos antigos sem
 * tipo_negocio definido.
 */
export async function gerarResumoMensal(
  usuarioId: string,
  ano: number,
  mes: number,
  _perfil: Perfil | null
): Promise<ResumoMensal> {
  const atualCompleto = await transacoesDoMes(usuarioId, ano, mes);
  const mesAnteriorData = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const anteriorCompleto = await transacoesDoMes(usuarioId, mesAnteriorData.ano, mesAnteriorData.mes);
  // Buscado pra evitar sugerir "guarde numa meta" como se o usuário ainda não
  // tivesse guardado nada — antes disso acontecia mesmo quando ele já tinha
  // uma meta em andamento com progresso real (ver histórico de bug 09/set/2026).
  const metas = await listarMetas(usuarioId);
  const metasEmAndamento = metas.filter((m) => m.status !== "concluida" && Number(m.valor_meta) > 0);

  const atual = atualCompleto.filter((t) => t.tipo_negocio !== "negocio");
  const anterior = anteriorCompleto.filter((t) => t.tipo_negocio !== "negocio");

  const entradas = somar(atual, "receita");
  const saidas = somar(atual, "despesa");
  const saldo = entradas - saidas;

  const saidasAnterior = somar(anterior, "despesa");
  const variacaoPercentual =
    saidasAnterior > 0 ? ((saidas - saidasAnterior) / saidasAnterior) * 100 : null;

  const porCategoria = new Map<string, number>();
  atual
    .filter((t) => t.tipo === "despesa")
    .forEach((t) => {
      const nome = t.categorias?.nome ?? "Outros";
      porCategoria.set(nome, (porCategoria.get(nome) ?? 0) + Number(t.valor));
    });
  const maioresGastos = Array.from(porCategoria.entries())
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 3);

  // "O que percebemos" (23/nov/2026): no máximo 3 frases curtas e que digam
  // algo novo — a variação contra o mês anterior já tem card próprio na tela,
  // então não se repete aqui.
  const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const recomendacoes: string[] = [];

  // Poucos lançamentos: a comparação fica enganosa (ex.: "gastou 43% a
  // menos" só porque quase nada foi anotado).
  const qtdAtual = atual.length;
  const qtdAnterior = anterior.length;
  const poucosLancamentos = qtdAnterior >= 6 && qtdAtual < qtdAnterior * 0.5;
  if (poucosLancamentos) {
    recomendacoes.push(
      `Este mês tem bem menos anotações que o anterior (${qtdAtual} contra ${qtdAnterior}). Se faltou lançar algo, a comparação fica menor do que a realidade.`
    );
  }

  if (maioresGastos.length > 0 && saidas > 0) {
    const topo = maioresGastos[0];
    const fatia = Math.round((topo.valor / saidas) * 100);
    recomendacoes.push(
      fatia >= 35
        ? `${topo.categoria} levou ${fatia}% do que você gastou (${reais(topo.valor)}). É o primeiro lugar pra olhar se quiser cortar.`
        : `Seu maior gasto foi ${topo.categoria}: ${reais(topo.valor)} (${fatia}% do total).`
    );
  }

  if (saldo > 0) {
    // Destaca a meta com menor progresso relativo (mesmo critério do card
    // "Meta em destaque" do painel principal) em vez da sugestão genérica.
    const metaDestaque = [...metasEmAndamento].sort(
      (a, b) => Number(a.valor_atual) / Number(a.valor_meta) - Number(b.valor_atual) / Number(b.valor_meta)
    )[0];
    if (metaDestaque) {
      const falta = Math.max(Number(metaDestaque.valor_meta) - Number(metaDestaque.valor_atual), 0);
      recomendacoes.push(`Sobraram ${reais(saldo)}. Faltam ${reais(falta)} pra "${metaDestaque.nome}" — dá pra reforçar.`);
    } else {
      recomendacoes.push(`Sobraram ${reais(saldo)}. Criar uma meta ajuda a não deixar isso escapar no mês que vem.`);
    }
  } else if (saldo < 0) {
    recomendacoes.push(`As saídas passaram as entradas em ${reais(Math.abs(saldo))}.`);
  }

  return { entradas, saidas, saldo, variacaoPercentual, maioresGastos, recomendacoes: recomendacoes.slice(0, 3), poucosLancamentos };
}

export async function salvarAnaliseMensal(
  usuarioId: string,
  ano: number,
  mes: number,
  resumo: ResumoMensal
) {
  return supabase
    .from("analises_ia")
    .upsert(
      {
        usuario_id: usuarioId,
        ano,
        mes,
        resumo: resumo.recomendacoes.join(" "),
        entradas_total: resumo.entradas,
        saidas_total: resumo.saidas,
        saldo: resumo.saldo,
        variacao_percentual: resumo.variacaoPercentual,
        data_geracao: new Date().toISOString(),
      },
      { onConflict: "usuario_id,mes,ano" }
    )
    .select()
    .single();
}

export async function listarHistoricoAnalises(usuarioId: string): Promise<AnaliseIA[]> {
  const { data } = await supabase
    .from("analises_ia")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("ano", { ascending: false })
    .order("mes", { ascending: false });
  return (data as AnaliseIA[]) ?? [];
}
