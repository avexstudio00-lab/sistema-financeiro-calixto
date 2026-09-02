"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import { parcelaEstaAtrasada, resumirParcelas } from "@/lib/data/investimentos";
import type { ParcelaInvestimento } from "@/lib/data/tipos";

export interface ParcelasInvestimentoProps {
  parcelas: ParcelaInvestimento[];
  periodicidade?: "mensal" | "quinzenal" | "semanal" | null;
  salvando: boolean;
  onAlternarPaga: (parcela: ParcelaInvestimento) => void;
}

const LABEL_PERIODICIDADE: Record<"quinzenal" | "semanal", string> = {
  quinzenal: "quinzenais",
  semanal: "semanais",
};

export function ParcelasInvestimento({ parcelas, periodicidade, salvando, onAlternarPaga }: ParcelasInvestimentoProps) {
  const [expandido, setExpandido] = React.useState(false);
  const resumo = React.useMemo(() => resumirParcelas(parcelas), [parcelas]);
  const sufixoPeriodicidade =
    periodicidade === "quinzenal" || periodicidade === "semanal" ? ` ${LABEL_PERIODICIDADE[periodicidade]}` : "";

  if (parcelas.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="flex items-center justify-between gap-2 text-left"
      >
        <div className="flex flex-1 flex-col gap-1">
          <span className="flex items-center gap-2 text-xs font-medium text-foreground">
            {resumo.pagas} de {resumo.total} parcelas{sufixoPeriodicidade} pagas
            {resumo.atrasadas > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-red-600">
                <AlertCircle size={11} />
                {resumo.atrasadas === 1 ? "1 em atraso" : `${resumo.atrasadas} em atraso`}
              </span>
            )}
          </span>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/10">
            <div
              className="h-full rounded-full bg-primary-500 transition-all"
              style={{ width: `${resumo.total ? (resumo.pagas / resumo.total) * 100 : 0}%` }}
            />
          </div>
        </div>
        {expandido ? (
          <ChevronUp size={16} className="shrink-0 text-muted" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-muted" />
        )}
      </button>

      {expandido && (
        <div className="flex flex-col gap-1.5">
          {parcelas.map((parcela) => {
            const atrasada = parcelaEstaAtrasada(parcela);
            return (
              <div
                key={parcela.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs",
                  parcela.pago ? "bg-primary-50/60" : atrasada ? "bg-rose-50" : "bg-muted/5"
                )}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">
                    Parcela {parcela.numero} · {formatarMoeda(Number(parcela.valor))}
                  </span>
                  <span className={cn("text-xs", atrasada ? "text-red-600" : "text-muted")}>
                    Vence {new Date(parcela.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                    {atrasada ? " · atrasada" : ""}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => onAlternarPaga(parcela)}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all",
                    parcela.pago
                      ? "bg-primary-500 text-white hover:bg-primary-600"
                      : "bg-white text-muted ring-1 ring-inset ring-border hover:bg-muted/10"
                  )}
                >
                  <Check size={11} />
                  {parcela.pago ? "Paga" : "Marcar paga"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
