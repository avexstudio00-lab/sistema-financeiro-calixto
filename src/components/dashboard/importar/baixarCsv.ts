import { gerarCsv } from "@/lib/util/csvImportacao";

/** Dispara o download de um CSV gerado no navegador (Blob + link temporário). */
export function baixarCsv(nomeArquivo: string, linhas: string[][]) {
  const blob = new Blob([gerarCsv(linhas)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
