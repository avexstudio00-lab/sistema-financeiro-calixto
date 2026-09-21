"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Check, AlertCircle, Pencil, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import { parcelaEstaAtrasada, resumirParcelas, calcularDiasAtraso, calcularValorDiaria } from "@/lib/data/investimentos";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { ParcelaInvestimento } from "@/lib/data/tipos";

export interface DadosJurosParcela {
  valorJuros: number;
  valorDiaria: number;
  dataPagamento: string;
  empurrarSeguintes: boolean;
}

export interface ParcelasInvestimentoProps {
  parcelas: ParcelaInvestimento[];
  periodicidade?: "mensal" | "quinzenal" | "semanal" | null;
  /** Diária combinada pra esse empréstimo (R$/dia) — usada só pra sugerir o
   * valor no formulário de "só juros"; nula = sem diária configurada. */
  valorDiariaPorDia?: number | null;
  salvando: boolean;
  onAlternarPaga: (parcela: ParcelaInvestimento) => void;
  /** Edita manualmente o vencimento de uma parcela já criada — usado
   * quando o combinado real tem frequência mista (ex: uma parcela ficou
   * quinzenal e as outras mensais) e precisa de ajuste depois de cadastrar. */
  onEditarData?: (parcela: ParcelaInvestimento, novaDataIso: string) => void;
  /** "Só juros" nessa parcela — a dívida dela continua em aberto e o
   * vencimento rola 1 mês pra frente (só dela, ou dela em diante — ver
   * `empurrarSeguintes`). Só aparece pra empréstimos parcelados. */
  onRegistrarJuros?: (parcela: ParcelaInvestimento, dados: DadosJurosParcela) => void | Promise<void>;
}

const LABEL_PERIODICIDADE: Record<"quinzenal" | "semanal", string> = {
  quinzenal: "quinzenais",
  semanal: "semanais",
};

function parsearValor(texto: string): number {
  const v = texto.trim().replace(/\./g, "").replace(",", ".");
  return Number(v);
}

function formatarValorParaInput(valor: number): string {
  return (Number.isFinite(valor) ? valor : 0).toFixed(2).replace(".", ",");
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ParcelasInvestimento({
  parcelas,
  periodicidade,
  valorDiariaPorDia,
  salvando,
  onAlternarPaga,
  onEditarData,
  onRegistrarJuros,
}: ParcelasInvestimentoProps) {
  const [expandido, setExpandido] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [jurosId, setJurosId] = React.useState<string | null>(null);
  const [dataPagamentoJuros, setDataPagamentoJuros] = React.useState(hojeIso());
  const [jurosTexto, setJurosTexto] = React.useState("");
  const [diariaTexto, setDiariaTexto] = React.useState("0,00");
  const [diariaEditadaManualmente, setDiariaEditadaManualmente] = React.useState(false);
  const [empurrarSeguintes, setEmpurrarSeguintes] = React.useState(false);
  const [erroJuros, setErroJuros] = React.useState<string | null>(null);
  const resumo = React.useMemo(() => resumirParcelas(parcelas), [parcelas]);
  const sufixoPeriodicidade =
    periodicidade === "quinzenal" || periodicidade === "semanal" ? ` ${LABEL_PERIODICIDADE[periodicidade]}` : "";

  const parcelaEmJuros = jurosId ? parcelas.find((p) => p.id === jurosId) ?? null : null;
  const temSeguintes = parcelaEmJuros
    ? parcelas.some((p) => p.numero > parcelaEmJuros.numero && !p.pago)
    : false;
  const diasAtrasoJuros = parcelaEmJuros ? calcularDiasAtraso(parcelaEmJuros.data_vencimento, dataPagamentoJuros) : 0;
  const diariaSugerida = calcularValorDiaria(diasAtrasoJuros, valorDiariaPorDia ?? null);

  React.useEffect(() => {
    if (diariaEditadaManualmente) return;
    setDiariaTexto(formatarValorParaInput(diariaSugerida));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diariaSugerida, diariaEditadaManualmente]);

  function abrirJuros(parcela: ParcelaInvestimento) {
    setEditandoId(null);
    setJurosId(parcela.id);
    setDataPagamentoJuros(hojeIso());
    setJurosTexto(formatarValorParaInput(Number(parcela.valor)));
    setDiariaEditadaManualmente(false);
    setEmpurrarSeguintes(false);
    setErroJuros(null);
  }

  function fecharJuros() {
    setJurosId(null);
    setErroJuros(null);
  }

  async function confirmarJuros() {
    if (!parcelaEmJuros || !onRegistrarJuros) return;
    const valorJuros = parsearValor(jurosTexto || "0");
    if (!valorJuros || valorJuros <= 0) {
      setErroJuros("Digite o valor do juros pago.");
      return;
    }
    const valorDiaria = parsearValor(diariaTexto || "0") || 0;
    setErroJuros(null);
    await onRegistrarJuros(parcelaEmJuros, {
      valorJuros,
      valorDiaria,
      dataPagamento: dataPagamentoJuros,
      empurrarSeguintes,
    });
    setJurosId(null);
  }

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
            const emJuros = jurosId === parcela.id;
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
                    {!editando && !emJuros && (
                      <span className={cn("text-xs", atrasada ? "text-red-600" : "text-muted")}>
                        Vence {new Date(parcela.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                        {atrasada ? " · atrasada" : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!parcela.pago && onRegistrarJuros && !editando && !emJuros && (
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() => abrirJuros(parcela)}
                        className="flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted hover:bg-muted/10"
                      >
                        <Percent size={11} />
                        Juros
                      </button>
                    )}
                    {onEditarData && !editando && !emJuros && (
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
                    {!emJuros && (
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
                    )}
                  </div>
                </div>
                {editando && onEditarData && (
                  <div className="flex flex-wrap items-end gap-2">
                    <DateMaskInput
                      value={parcela.data_vencimento}
                      onChange={(iso) => {
                        if (!iso) return;
                        onEditarData(parcela, iso);
                        setEditandoId(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setEditandoId(null)}
                      className="h-11 rounded-xl px-3 text-xs font-medium text-muted hover:bg-muted/10"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
                {emJuros && (
                  <div className="flex flex-col gap-2 rounded-lg bg-white p-2.5 ring-1 ring-inset ring-border">
                    <div className="flex flex-wrap items-end gap-2">
                      <DateMaskInput label="Data do pagamento" value={dataPagamentoJuros} onChange={setDataPagamentoJuros} />
                      <div className="w-28">
                        <Input
                          label="Diária"
                          inputMode="decimal"
                          value={diariaTexto}
                          onChange={(e) => {
                            setDiariaTexto(e.target.value);
                            setDiariaEditadaManualmente(true);
                          }}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="w-28">
                        <Input
                          label="Valor do juros"
                          inputMode="decimal"
                          value={jurosTexto}
                          onChange={(e) => setJurosTexto(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                    {diasAtrasoJuros > 0 && (
                      <span className="text-xs text-muted">
                        {diasAtrasoJuros} dia{diasAtrasoJuros === 1 ? "" : "s"} de atraso até essa data.
                      </span>
                    )}
                    {temSeguintes && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-foreground">Empurrar 1 mês</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEmpurrarSeguintes(false)}
                            className={cn(
                              "rounded-lg border px-2.5 py-1 text-xs font-medium transition-all",
                              !empurrarSeguintes
                                ? "border-primary-500 bg-primary-50 text-primary-700"
                                : "border-border text-muted"
                            )}
                          >
                            Só essa parcela
                          </button>
                          <button
                            type="button"
                            onClick={() => setEmpurrarSeguintes(true)}
                            className={cn(
                              "rounded-lg border px-2.5 py-1 text-xs font-medium transition-all",
                              empurrarSeguintes
                                ? "border-primary-500 bg-primary-50 text-primary-700"
                                : "border-border text-muted"
                            )}
                          >
                            Essa e as seguintes
                          </button>
                        </div>
                      </div>
                    )}
                    {erroJuros && <p className="text-xs text-rose-600">{erroJuros}</p>}
                    <div className="flex items-center gap-2 pt-1">
                      <Button type="button" size="sm" variant="secondary" disabled={salvando} onClick={confirmarJuros}>
                        Registrar juros
                      </Button>
                      <button
                        type="button"
                        onClick={fecharJuros}
                        className="h-9 rounded-xl px-3 text-xs font-medium text-muted hover:bg-muted/10"
                      >
                        Cancelar
                      </button>
                    </div>
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
