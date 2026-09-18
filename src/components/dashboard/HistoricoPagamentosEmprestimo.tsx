"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import type { PagamentoInvestimento } from "@/lib/data/tipos";

export interface HistoricoPagamentosEmprestimoProps {
  pagamentos: PagamentoInvestimento[];
}

/** Histórico visível dos eventos "só juros" / "quitação" registrados nesse
 * empréstimo (pedido do usuário — ver `registrarPagamentoJuros` e
 * `registrarQuitacaoEmprestimo`/`registrarQuitacaoAntecipadaParcelado` em
 * src/lib/data/investimentos.ts). Só aparece quando existe pelo menos um
 * evento — empréstimos que nunca tiveram "só juros" nem quitação não
 * mostram nada aqui. */
export function HistoricoPagamentosEmprestimo({ pagamentos }: HistoricoPagamentosEmprestimoProps) {
  const [expandido, setExpandido] = React.useState(false);

  if (pagamentos.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <History size={13} className="text-muted" />
          Histórico de pagamentos ({pagamentos.length})
        </span>
        {expandido ? (
          <ChevronUp size={16} className="shrink-0 text-muted" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-muted" />
        )}
      </button>

      {expandido && (
        <div className="flex flex-col gap-1.5">
          {pagamentos.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/5 px-2.5 py-1.5 text-xs">
              <div className="flex flex-col">
                <span className="font-medium text-foreground">
                  {p.tipo === "juros" ? "Só juros" : "Quitação"} · {formatarMoeda(Number(p.valor_pago))}
                </span>
                <span className="text-muted">
                  {new Date(p.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR")}
                  {p.dias_atraso > 0 ? ` · ${p.dias_atraso} dia${p.dias_atraso === 1 ? "" : "s"} de atraso` : ""}
                  {p.valor_diaria ? ` · diária ${formatarMoeda(Number(p.valor_diaria))}` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
