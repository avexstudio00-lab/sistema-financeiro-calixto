"use client";

import * as React from "react";
import { FileUp, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

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
        aria-label="Escolher arquivo do extrato"
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
          <p className="text-body font-semibold text-foreground">{lendo ? "Lendo o extrato..." : "Solte o extrato aqui ou toque para escolher"}</p>
          <p className="text-small text-muted">Extrato da conta ou fatura do cartão (Nubank, Itaú, Inter, Bradesco, Santander, BB, Caixa, C6, Mercado Pago) em PDF, OFX, CSV ou Excel (.xlsx). A gente separa PIX, cartão, boleto e fatura, sugere a categoria e liga às suas dívidas. Até 5 MB e 5.000 linhas.</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          // Sem filtro de tipo de propósito (09/nov/2026): com filtro, o
          // Windows/celular deixava o arquivo "apagado" sem explicar nada.
          // A validação de verdade acontece depois, com mensagem clara.
          className="hidden"
          onChange={(e) => {
            escolher(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <p className="text-xs text-muted">
        Como baixar: no app ou site do banco, entre em Extrato (ou Fatura do cartão) → Exportar/Compartilhar. PDF funciona; OFX ou Excel
        costumam vir ainda mais certinhos. O arquivo é lido aqui no seu aparelho e nada é gravado antes da sua confirmação.
      </p>
    </Card>
  );
}
