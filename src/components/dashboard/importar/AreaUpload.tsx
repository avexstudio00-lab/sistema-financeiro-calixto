"use client";

import * as React from "react";
import { FileUp, Loader2, Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { MODELO_CSV } from "@/lib/util/csvImportacao";
import { baixarCsv } from "./baixarCsv";

/** Passo 1: soltar ou escolher o .csv (até 5 MB). */
export function AreaUpload({ lendo, onArquivo }: { lendo: boolean; onArquivo: (arquivo: File) => void }) {
  const [arrastando, setArrastando] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function escolher(lista: FileList | null) {
    const arquivo = lista?.[0];
    if (arquivo) onArquivo(arquivo);
  }

  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Escolher arquivo CSV"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          escolher(e.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          arrastando ? "border-primary-500 bg-primary-50" : "border-border hover:bg-muted/5"
        )}
      >
        {lendo ? <Loader2 size={32} className="animate-spin text-primary-700" /> : <FileUp size={32} className="text-primary-700 dark:text-primary-300" />}
        <div>
          <p className="text-body font-semibold text-foreground">{lendo ? "Lendo o arquivo..." : "Solte o arquivo .csv aqui ou toque para escolher"}</p>
          <p className="text-small text-muted">Extrato do banco (Nubank, Itaú, Inter, Bradesco, Santander, BB, Caixa, C6, Mercado Pago) ou o CSV exportado pelo próprio app. Até 5 MB e 5.000 linhas.</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            escolher(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted">
          O arquivo é lido aqui no seu aparelho. Nada é gravado antes da sua confirmação.
        </p>
        <Button type="button" variant="tertiary" size="sm" onClick={() => baixarCsv("modelo-importacao-calixto.csv", MODELO_CSV)}>
          <Download size={16} /> Baixar modelo CSV
        </Button>
      </div>
    </Card>
  );
}
