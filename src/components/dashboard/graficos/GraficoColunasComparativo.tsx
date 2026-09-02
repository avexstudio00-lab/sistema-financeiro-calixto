"use client";

import * as React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { formatarMoeda, formatarMoedaCompacta } from "@/lib/format";

export interface PontoColuna {
  mes: string;
  entradas: number;
  saidas: number;
}

export interface GraficoColunasComparativoProps {
  dados: PontoColuna[];
  interativo?: boolean;
}

/**
 * Comparativo de entradas x saídas entre o mês atual e o anterior, lado a
 * lado, para o usuário ver rapidamente se está gastando mais ou menos.
 */
export function GraficoColunasComparativo({ dados, interativo }: GraficoColunasComparativoProps) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={8}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--border))" />
          <XAxis
            dataKey="mes"
            tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 12 }}
            axisLine={{ stroke: "rgb(var(--border))" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatarMoedaCompacta(Number(v))}
            width={56}
          />
          {interativo && (
            <Tooltip
              formatter={(valor, nome) => [
                formatarMoeda(Number(valor)),
                nome === "entradas" ? "Entradas" : "Saídas",
              ]}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid rgb(var(--border))",
                background: "rgb(var(--card))",
                fontSize: 13,
              }}
            />
          )}
          <Legend
            formatter={(valor) => (valor === "entradas" ? "Entradas" : "Saídas")}
            wrapperStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="entradas" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={40} />
          <Bar dataKey="saidas" fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
