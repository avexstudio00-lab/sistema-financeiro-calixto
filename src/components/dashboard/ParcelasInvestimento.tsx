"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Check, AlertCircle, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import { parcelaEstaAtrasada, resumirParcelas } from "@/lib/data/investimentos";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import type { ParcelaInvestimento } from "@/lib/data/tipos";

export interface ParcelasInvestimentoProps {
  parcelas: ParcelaInvestimento[];
  periodicidade?: "mensal" | "quinzenal" | "semanal" | null;
  salvando: boolean;
  onAlternarPaga: (parcela: ParcelaInvestimento) => void;
  /** Edita manualmente o vencimento de uma parcela já criada — usado
   * quando o combinado real tem frequência mista (ex: uma parcela ficou
   * quinzenal e as outras mensais) e precisa de ajuste depois de cadastrar. */
  onEditarData?: (parcela: ParcelaInvestimento, novaDataIso: string) => void;
}

const LABEL_PERIODICIDADE: Record<"quinzenal" | "semanal", string> = {
  quinzenal: "quinzenais",
  semanal: "semanais",
};

export function ParcelasInvestimento({
  parcelas,
  periodicidade,
  salvando,
  onAlternarPaga,
  onEditarData,
}: ParcelasInvestimentoProps) {
  const [expandido, setExpandido] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
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
            const editando = editandoId === parcela.id;
            return (
              <div
                key={parcela.id}
                className={cn(
                  "flex flex-col gap-2 rounded-lg px-2.5 py-1.5 text-xs",
                  parcela.pago ? "bg-primary-50/60" : atrasada ? "bg-rose-50" : "bg-muted/5"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      Parcela {parcela.numero} · {formatarMoeda(Number(parcela.valor))}
                    </span>
                    {!editando && (
                      <span className={cn("text-xs", atrasada ? "text-red-600" : "text-muted")}>
                        Vence {new Date(parcela.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                        {atrasada ? " · atrasada" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {onEditarData && !editando && (
                      <button
                        type="button"
                        aria-label="Editar data de vencimento"
                        disabled={salvando}
                        onClick={() => setEditandoId(parcela.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-muted/10"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
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
                </div>
                {editando && onEditarData && (
                  <div className="flex items-end gap-2">
                    <div className="w-36">
                      <DateMaskInput
                        value={parcela.data_vencimento}
                        onChange={(iso) => {
                          if (!iso) return;
                          onEditarData(parcela, iso);
                          setEditandoId(null);
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditandoId(null)}
                      className="h-11 rounded-xl px-3 text-xs font-medium text-muted hover:bg-muted/10"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
