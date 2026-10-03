"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Período em meses (null = "Todos"). */
export type PeriodoMeses = 3 | 6 | 12 | null;

export const OPCOES_PERIODO: { valor: PeriodoMeses; rotulo: string }[] = [
  { valor: 3, rotulo: "3 meses" },
  { valor: 6, rotulo: "6 meses" },
  { valor: 12, rotulo: "12 meses" },
  { valor: null, rotulo: "Todos" },
];

/** true se a data (ISO) está dentro do período: dos últimos N meses até
 * qualquer data futura. `null` = sem corte. */
export function dentroDoPeriodo(dataIso: string | null | undefined, periodo: PeriodoMeses): boolean {
  if (!periodo || !dataIso) return true;
  const limite = new Date();
  limite.setMonth(limite.getMonth() - periodo);
  limite.setHours(0, 0, 0, 0);
  return new Date(dataIso + "T00:00:00") >= limite;
}

interface Props {
  periodo: PeriodoMeses;
  onPeriodo: (p: PeriodoMeses) => void;
  quitadas: boolean;
  onQuitadas: (v: boolean) => void;
  /** Rótulo do botão de histórico (padrão "Quitadas"). */
  rotuloQuitadas?: string;
  totalQuitadas?: number;
}

/**
 * Barra de filtros padrão das listas de operações (item 5.2 da especificação
 * de 03/out/2026): período (3/6/12 meses/Todos) + o comutador "Quitadas".
 * Por padrão a lista mostra só o que está em aberto; com "Quitadas" ligado,
 * mostra só o histórico já liquidado (pra auditar, reabrir ou corrigir).
 */
export function FiltrosLista({ periodo, onPeriodo, quitadas, onQuitadas, rotuloQuitadas = "Quitadas", totalQuitadas }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1 rounded-full bg-muted/10 p-1">
        {OPCOES_PERIODO.map((o) => (
          <button
            key={o.rotulo}
            type="button"
            onClick={() => onPeriodo(o.valor)}
            className={cn(
              "rounded-full px-3 py-1.5 text-small font-medium transition-colors",
              periodo === o.valor ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
            )}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={quitadas}
        onClick={() => onQuitadas(!quitadas)}
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-small font-semibold transition-colors",
          quitadas ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border text-foreground hover:bg-muted/10"
        )}
      >
        <CheckCircle2 size={14} />
        {rotuloQuitadas}
        {typeof totalQuitadas === "number" && totalQuitadas > 0 && <span className="text-xs">({totalQuitadas})</span>}
      </button>
    </div>
  );
}

/** Abas "À vista" / "Parceladas" (item 5.2). */
export function AbasVistaParcelado({
  valor,
  onChange,
  totalVista,
  totalParcelado,
}: {
  valor: "vista" | "parcelado";
  onChange: (v: "vista" | "parcelado") => void;
  totalVista?: number;
  totalParcelado?: number;
}) {
  return (
    <div className="flex gap-1 self-start rounded-xl border border-border p-1">
      {(["vista", "parcelado"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "rounded-lg px-4 py-2 text-small font-semibold transition-colors",
            valor === v ? "bg-accent-50 text-accent-700" : "text-muted hover:text-foreground"
          )}
        >
          {v === "vista" ? "À vista" : "Parceladas"}
          {v === "vista" && typeof totalVista === "number" ? ` (${totalVista})` : ""}
          {v === "parcelado" && typeof totalParcelado === "number" ? ` (${totalParcelado})` : ""}
        </button>
      ))}
    </div>
  );
}
