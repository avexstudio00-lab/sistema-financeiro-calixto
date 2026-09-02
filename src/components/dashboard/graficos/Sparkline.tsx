"use client";

import * as React from "react";

export interface SparklineProps {
  dados: number[];
  cor?: string;
  altura?: number;
  className?: string;
}

/**
 * Mini gráfico de linha discreto, usado dentro dos cartões de KPI do painel
 * para mostrar a tendência dos últimos meses sem poluir a leitura do valor.
 */
export function Sparkline({ dados, cor = "#10b981", altura = 32, className }: SparklineProps) {
  const largura = 100;

  if (dados.length < 2) {
    return <div style={{ height: altura }} className={className} />;
  }

  const minimo = Math.min(...dados);
  const maximo = Math.max(...dados);
  const amplitude = maximo - minimo || 1;

  const pontos = dados.map((valor, i) => {
    const x = (i / (dados.length - 1)) * largura;
    const y = altura - ((valor - minimo) / amplitude) * altura;
    return { x, y };
  });

  const linha = pontos.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `0,${altura} ${linha} ${largura},${altura}`;
  const ultimo = pontos[pontos.length - 1];

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: "100%", height: altura, display: "block", overflow: "visible" }}
    >
      <polygon points={area} fill={cor} opacity={0.12} />
      <polyline points={linha} fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ultimo.x} cy={ultimo.y} r={2.5} fill={cor} />
    </svg>
  );
}
