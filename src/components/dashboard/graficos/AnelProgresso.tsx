"use client";

import * as React from "react";

export interface AnelProgressoProps {
  percentual: number;
  tamanho?: number;
  espessura?: number;
  corTrilha?: string;
  corProgresso?: string;
  children?: React.ReactNode;
}

/**
 * Anel de progresso circular usado nas metas de economia — o percentual
 * concluído fica evidente de relance, com o valor exibido no centro.
 */
export function AnelProgresso({
  percentual,
  tamanho = 96,
  espessura = 10,
  corTrilha = "rgb(var(--muted) / 0.15)",
  corProgresso = "#10b981",
  children,
}: AnelProgressoProps) {
  const clamped = Math.max(0, Math.min(100, percentual));
  const raio = (tamanho - espessura) / 2;
  const circunferencia = 2 * Math.PI * raio;
  const offset = circunferencia - (clamped / 100) * circunferencia;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} className="-rotate-90">
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke={corTrilha}
          strokeWidth={espessura}
        />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          stroke={corProgresso}
          strokeWidth={espessura}
          strokeDasharray={circunferencia}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children ?? (
          <span className="text-body font-semibold text-foreground">{clamped.toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
}
