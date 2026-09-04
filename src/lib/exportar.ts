import type { Transacao } from "@/lib/data/tipos";

const LABEL_FORMA_PAGAMENTO: Record<string, string> = {
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
  dinheiro: "Dinheiro",
  boleto: "Boleto",
};

function formatarDataBR(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Formato brasileiro (vírgula decimal) — o separador de campo do CSV é
 * ";", não ",", então usar vírgula no valor não confunde o Excel em pt-BR
 * (que aliás é o que ele espera por padrão). */
function formatarValorCSV(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

function escaparCampoCSV(campo: string): string {
  if (campo.includes(";") || campo.includes('"') || campo.includes("\n")) {
    return `"${campo.replace(/"/g, '""')}"`;
  }
  return campo;
}

/**
 * Monta um CSV (separador ";", padrão do Excel em pt-BR) e dispara o
 * download direto no navegador. Não depende de nenhuma biblioteca externa
 * — só Blob + link temporário, então não precisa instalar nada pra isso
 * funcionar no build da Vercel.
 */
function baixarCSV(nomeArquivo: string, cabecalho: string[], linhas: string[][]) {
  const todasLinhas = [cabecalho, ...linhas];
  const conteudo = todasLinhas.map((linha) => linha.map(escaparCampoCSV).join(";")).join("\r\n");
  // BOM UTF-8 no início — sem isso o Excel abre os acentos quebrados.
  const blob = new Blob(["\uFEFF" + conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Exporta as transações de um mês em CSV, pronto pra abrir no Excel ou
 * Google Sheets. */
export function exportarTransacoesCSV(transacoes: Transacao[], nomeMes: string, ano: number) {
  const cabecalho = ["Data", "Tipo", "Categoria", "Descrição", "Forma de pagamento", "Valor (R$)"];
  const linhas = transacoes
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((t) => [
      formatarDataBR(t.data),
      t.tipo === "receita" ? "Receita" : "Despesa",
      t.categorias?.nome ?? "Outros",
      t.descricao ?? "",
      t.forma_pagamento ? LABEL_FORMA_PAGAMENTO[t.forma_pagamento] ?? t.forma_pagamento : "",
      formatarValorCSV(Number(t.valor)),
    ]);

  const nomeArquivo = `relatorio-${nomeMes.toLowerCase()}-${ano}.csv`;
  baixarCSV(nomeArquivo, cabecalho, linhas);
}
