"use client";

import * as React from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { formatarMoeda, formatarMoedaCompacta } from "@/lib/format";

export interface PontoLinha {
  mes: string;
  valor: number;
}

export interface GraficoLinhaEvolucaoProps {
  dados: PontoLinha[];
  cor?: string;
  rotulo?: string;
  interativo?: boolean;
}

/**
 * Linha de evolução com preenchimento suave abaixo — usada tanto para o
 * saldo ao longo dos meses quanto para o valor total investido.
 */
export function GraficoLinhaEvolucao({
  dados,
  cor = "#10b981",
  rotulo = "Valor",
  interativo = true,
}: GraficoLinhaEvolucaoProps) {
  const gradientId = React.useId().replace(/[:]/g, "");

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={cor} stopOpacity={0.35} />
              <stop offset="95%" stopColor={cor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
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
              formatter={(valor) => [formatarMoeda(Number(valor)), rotulo]}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid rgb(var(--border))",
                background: "rgb(var(--card))",
                fontSize: 13,
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="valor"
            stroke={cor}
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            dot={{ r: 3, fill: cor, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
