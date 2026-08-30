import { supabase } from "@/lib/supabase/client";
import type { Transacao, AnaliseIA } from "./tipos";
import type { Perfil } from "@/lib/auth/AuthProvider";

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
  negocio?: { faturamento: number; custos: number; lucroReal: number };
  pessoal?: { entradas: number; saidas: number };
  recomendacoes: string[];
}

export async function gerarResumoMensal(
  usuarioId: string,
  ano: number,
  mes: number,
  perfil: Perfil | null
): Promise<ResumoMensal> {
  const atual = await transacoesDoMes(usuarioId, ano, mes);
  const mesAnteriorData = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const anterior = await transacoesDoMes(usuarioId, mesAnteriorData.ano, mesAnteriorData.mes);

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
    recomendacoes.push(`Sobraram R$ ${saldo.toFixed(2)} este mês. Que tal guardar uma parte numa meta?`);
  } else if (saldo < 0) {
    recomendacoes.push(`Este mês as saídas passaram as entradas em R$ ${Math.abs(saldo).toFixed(2)}. Vamos ajustar o próximo mês juntos.`);
  }

  let negocio;
  let pessoal;
  if (perfil?.tipo_perfil === "mei" || perfil?.tipo_perfil === "me") {
    const doNegocio = atual.filter((t) => t.tipo_negocio === "negocio");
    const doPessoal = atual.filter((t) => t.tipo_negocio === "pessoal");
    const faturamento = somar(doNegocio, "receita");
    const custos = somar(doNegocio, "despesa");
    negocio = { faturamento, custos, lucroReal: faturamento - custos };
    pessoal = { entradas: somar(doPessoal, "receita"), saidas: somar(doPessoal, "despesa") };
    if (negocio.faturamento > 0) {
      recomendacoes.push(
        `No negócio, o lucro real do mês foi de R$ ${negocio.lucroReal.toFixed(2)} (faturamento menos custos).`
      );
    }
  }

  return { entradas, saidas, saldo, variacaoPercentual, maioresGastos, negocio, pessoal, recomendacoes };
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
