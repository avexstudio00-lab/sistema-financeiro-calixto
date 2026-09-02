"use client";

import * as React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatarMoeda } from "@/lib/format";
import type { FatiaCategoria } from "@/lib/graficos-utils";

export interface GraficoDonutCategoriasProps {
  dados: FatiaCategoria[];
  total: number;
  interativo?: boolean;
  categoriaAtiva?: string;
  onFatiaClick?: (id: string) => void;
}

/**
 * Visão geral "para onde foi o dinheiro" no mês, em forma de rosca — o
 * total fica destacado no centro e cada fatia representa uma categoria.
 */
export function GraficoDonutCategorias({
  dados,
  total,
  interativo,
  categoriaAtiva,
  onFatiaClick,
}: GraficoDonutCategoriasProps) {
  if (dados.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center">
        <p className="text-small text-muted">Sem gastos registrados neste período.</p>
      </div>
    );
  }

  function aoClicarFatia(entrada: unknown) {
    if (!interativo || !onFatiaClick) return;
    const payload = entrada as { id?: string } | undefined;
    if (payload?.id && payload.id !== "outros") onFatiaClick(payload.id);
  }

  return (
    <div className="relative mx-auto h-56 w-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={dados}
            dataKey="valor"
            nameKey="nome"
            innerRadius="62%"
            outerRadius="94%"
            paddingAngle={2}
            stroke="none"
            onClick={interativo ? aoClicarFatia : undefined}
          >
            {dados.map((fatia) => (
              <Cell
                key={fatia.id}
                fill={fatia.cor}
                opacity={categoriaAtiva && categoriaAtiva !== fatia.id ? 0.35 : 1}
                style={{ cursor: interativo && fatia.id !== "outros" ? "pointer" : "default" }}
              />
            ))}
          </Pie>
          {interativo && (
            <Tooltip
              formatter={(valor, nome) => [formatarMoeda(Number(valor)), String(nome)]}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid rgb(var(--border))",
                background: "rgb(var(--card))",
                fontSize: 13,
              }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted">Total</span>
        <span className="text-h3 font-semibold text-foreground">{formatarMoeda(total)}</span>
      </div>
    </div>
  );
}
