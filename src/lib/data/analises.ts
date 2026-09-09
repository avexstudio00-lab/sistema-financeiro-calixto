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

  const recomendacoes: string[] = [];
  if (maioresGastos[0]) {
    recomendacoes.push(
      `Seu maior gasto do mês foi com ${maioresGastos[0].categoria} (R$ ${maioresGastos[0].valor.toFixed(2)}). Fique de olho nessa categoria no próximo mês.`
    );
  }
  if (variacaoPercentual !== null && variacaoPercentual > 10) {
    recomendacoes.push(
      `Você gastou ${variacaoPercentual.toFixed(0)}% a mais que o mês passado. Vale revisar o que mudou.`
    );
  } else if (variacaoPercentual !== null && variacaoPercentual < -10) {
    recomendacoes.push(
      `Você gastou ${Math.abs(variacaoPercentual).toFixed(0)}% a menos que o mês passado. Continue assim!`
    );
  }
  if (saldo > 0) {
    if (metasEmAndamento.length > 0) {
      // Destaca a meta com menor progresso relativo — mesmo critério usado
      // no card de "Meta em destaque" do painel principal.
      const metaDestaque = [...metasEmAndamento].sort(
        (a, b) => Number(a.valor_atual) / Number(a.valor_meta) - Number(b.valor_atual) / Number(b.valor_meta)
      )[0];
      recomendacoes.push(
        `Sobraram R$ ${saldo.toFixed(2)} este mês. Você já guardou R$ ${Number(metaDestaque.valor_atual).toFixed(2)} de R$ ${Number(metaDestaque.valor_meta).toFixed(2)} em "${metaDestaque.nome}" — que tal reforçar ainda mais?`
      );
    } else {
      recomendacoes.push(`Sobraram R$ ${saldo.toFixed(2)} este mês. Que tal criar uma meta e começar a guardar uma parte?`);
    }
  } else if (saldo < 0) {
    recomendacoes.push(`Este mês as saídas passaram as entradas em R$ ${Math.abs(saldo).toFixed(2)}. Vamos ajustar o próximo mês juntos.`);
  }

  return { entradas, saidas, saldo, variacaoPercentual, maioresGastos, recomendacoes };
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
