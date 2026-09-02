import { supabase } from "@/lib/supabase/client";
import { NOMES_MES } from "@/lib/format";

export interface PontoEvolucaoMensal {
  mes: string;
  ano: number;
  mesNumero: number;
  entradas: number;
  saidas: number;
  saldo: number;
}

interface LinhaTransacaoResumida {
  tipo: "receita" | "despesa";
  valor: number;
  data: string;
  tipo_negocio: "pessoal" | "negocio" | null;
}

/**
 * Busca os totais de entradas/saídas/saldo dos últimos `meses` meses
 * (incluindo o mês atual), usados nos gráficos de coluna comparativa,
 * na linha de evolução do saldo e nos sparklines dos cartões do painel.
 */
export async function listarEvolucaoMensal(
  usuarioId: string,
  meses = 6,
  modo: "tudo" | "pessoal" | "negocio" = "tudo"
): Promise<PontoEvolucaoMensal[]> {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - (meses - 1), 1)
    .toISOString()
    .slice(0, 10);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("transacoes")
    .select("tipo, valor, data, tipo_negocio")
    .eq("usuario_id", usuarioId)
    .gte("data", inicio)
    .lte("data", fim);

  let linhas = (data as LinhaTransacaoResumida[]) ?? [];
  if (modo !== "tudo") {
    linhas = linhas.filter((t) => t.tipo_negocio === modo);
  }

  const pontos: PontoEvolucaoMensal[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const ano = d.getFullYear();
    const mesNumero = d.getMonth() + 1;
    const doMes = linhas.filter((t) => {
      const dt = new Date(t.data + "T00:00:00");
      return dt.getFullYear() === ano && dt.getMonth() + 1 === mesNumero;
    });
    const entradas = doMes.filter((t) => t.tipo === "receita").reduce((acc, t) => acc + Number(t.valor), 0);
    const saidas = doMes.filter((t) => t.tipo === "despesa").reduce((acc, t) => acc + Number(t.valor), 0);
    pontos.push({ mes: NOMES_MES[mesNumero - 1], ano, mesNumero, entradas, saidas, saldo: entradas - saidas });
  }
  return pontos;
}
