"use client";

import * as React from "react";
import { formatarMoeda } from "@/lib/format";
import type { DiaHeatmap } from "@/lib/graficos-utils";

export interface HeatmapMensalProps {
  dias: DiaHeatmap[];
  ano: number;
  mesNumero: number;
}

const NIVEL_COR: Record<DiaHeatmap["nivel"], string> = {
  0: "rgb(var(--muted) / 0.12)",
  1: "#a7f3d0",
  2: "#6ee7b7",
  3: "#f59e0b",
  4: "#ef4444",
};

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

/**
 * Calendário do mês com um quadrado por dia, colorido pela intensidade do
 * gasto — verde claro para gastos baixos até vermelho para os mais altos,
 * para o usuário enxergar de relance onde o dinheiro "escapou".
 */
export function HeatmapMensal({ dias, ano, mesNumero }: HeatmapMensalProps) {
  const primeiroDiaSemana = new Date(ano, mesNumero - 1, 1).getDay();
  const celulasVazias = Array.from({ length: primeiroDiaSemana });

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1.5">
        {DIAS_SEMANA.map((d, i) => (
          <span key={i} className="text-center text-xs font-medium text-muted">
            {d}
          </span>
        ))}
        {celulasVazias.map((_, i) => (
          <div key={`vazio-${i}`} />
        ))}
        {dias.map((d) => (
          <div key={`dia-${d.dia}`} className="group relative flex items-center justify-center">
            <div
              className="aspect-square w-full rounded-md transition-transform group-hover:scale-110"
              style={{ background: NIVEL_COR[d.nivel] }}
            />
            <span className="pointer-events-none absolute -top-1 text-[10px] font-medium text-foreground/70 mix-blend-luminosity">
              {d.dia}
            </span>
            {d.valor > 0 && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs text-background opacity-0 shadow-card-hover transition-opacity group-hover:opacity-100">
                Dia {d.dia}: {formatarMoeda(d.valor)}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1.5 text-xs text-muted">
        <span>Menos</span>
        {([0, 1, 2, 3, 4] as const).map((n) => (
          <span key={n} className="h-3 w-3 rounded-sm" style={{ background: NIVEL_COR[n] }} />
        ))}
        <span>Mais</span>
      </div>
    </div>
  );
}
