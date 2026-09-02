"use client";

import * as React from "react";
import { formatarMoeda } from "@/lib/format";
import type { FatiaCategoria } from "@/lib/graficos-utils";
import { cn } from "@/lib/utils";

export interface GraficoRankingGastosProps {
  dados: FatiaCategoria[];
  interativo?: boolean;
  categoriaAtiva?: string;
  onCategoriaClick?: (id: string) => void;
}

/**
 * Ranking dos maiores gastos do mês, em ordem decrescente — pensado para
 * rolagem vertical no celular, com cada barra colorida pela categoria e o
 * valor exibido ao lado.
 */
export function GraficoRankingGastos({
  dados,
  interativo,
  categoriaAtiva,
  onCategoriaClick,
}: GraficoRankingGastosProps) {
  const maiorValor = Math.max(1, ...dados.map((d) => d.valor));

  if (dados.length === 0) {
    return <p className="py-6 text-center text-small text-muted">Sem gastos registrados neste período.</p>;
  }

  return (
    <div className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
      {dados.map((item) => {
        const largura = Math.max(4, (item.valor / maiorValor) * 100);
        const ativo = categoriaAtiva === item.id;
        const clicavel = interativo && !!onCategoriaClick && item.id !== "outros";
        return (
          <button
            key={item.id}
            type="button"
            disabled={!clicavel}
            onClick={() => onCategoriaClick?.(item.id)}
            className={cn(
              "flex flex-col gap-1 rounded-xl px-1 py-0.5 text-left transition-opacity",
              clicavel && "cursor-pointer hover:opacity-80",
              !clicavel && "cursor-default",
              categoriaAtiva && !ativo && "opacity-40"
            )}
          >
            <div className="flex items-center justify-between gap-2 text-small">
              <span className="font-medium text-foreground">{item.nome}</span>
              <span className="shrink-0 font-semibold text-foreground">{formatarMoeda(item.valor)}</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted/10">
              <div
                className="h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${largura}%`, background: item.cor }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
