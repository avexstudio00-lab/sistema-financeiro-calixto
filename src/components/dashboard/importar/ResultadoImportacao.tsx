"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileUp, ScrollText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button, buttonVariants } from "@/components/ui/Button";
import { baixarCsv } from "./baixarCsv";

export interface ResumoResultado {
  inseridos: number;
  ignoradosDuplicidade: number;
  /** Linhas descartadas (validação) + lotes que o banco recusou. */
  falhas: { linha: number; motivo: string; conteudo?: string }[];
}

/** Passo 4: números finais + CSV de auditoria das linhas com falha. */
export function ResultadoImportacao({
  resultado,
  nomeArquivo,
  linkExtrato,
  onNovaImportacao,
}: {
  resultado: ResumoResultado;
  nomeArquivo: string;
  linkExtrato: string;
  onNovaImportacao: () => void;
}) {
  function baixarFalhas() {
    const base = nomeArquivo.replace(/\.csv$/i, "");
    baixarCsv(`falhas-${base}.csv`, [
      ["Linha", "Motivo", "Conteúdo original"],
      ...resultado.falhas.sort((a, b) => a.linha - b.linha).map((f) => [String(f.linha), f.motivo, f.conteudo ?? ""]),
    ]);
  }

  return (
    <Card padding="lg" className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 size={28} className="shrink-0 text-primary-700 dark:text-primary-300" />
        <div className="min-w-0">
          <h2 className="text-h3 text-foreground">Importação concluída</h2>
          <p className="text-small text-muted">O saldo da carteira já foi ajustado e os lançamentos aparecem no extrato, no painel e no fluxo de caixa.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted">Importados</p>
          <p className="text-h2 text-primary-700 dark:text-primary-300">{resultado.inseridos}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted">Ignorados (duplicados)</p>
          <p className="text-h2 text-foreground">{resultado.ignoradosDuplicidade}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted">Com erro</p>
          <p className="text-h2 text-foreground">{resultado.falhas.length}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {resultado.falhas.length > 0 && (
          <Button type="button" variant="secondary" onClick={baixarFalhas}>
            <Download size={18} /> Baixar relatório de falhas
          </Button>
        )}
        <Link href={linkExtrato} className={buttonVariants({ className: "w-full sm:w-auto" })}>
          <ScrollText size={18} /> Ver no extrato
        </Link>
        <Button type="button" variant="tertiary" onClick={onNovaImportacao}>
          <FileUp size={18} /> Importar outro arquivo
        </Button>
      </div>
    </Card>
  );
}
