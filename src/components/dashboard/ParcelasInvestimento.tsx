"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Check, AlertCircle, Pencil, Percent, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import { parcelaEstaAtrasada, resumirParcelas, calcularDiasAtraso, calcularValorDiaria, adicionarMeses } from "@/lib/data/investimentos";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SeletorCarteira } from "@/components/dashboard/SeletorCarteira";
import type { ParcelaInvestimento } from "@/lib/data/tipos";

export interface DadosJurosParcela {
  valorJuros: number;
  valorDiaria: number;
  dataPagamento: string;
  empurrarSeguintes: boolean;
  /** 5.10: carteira onde o juros entrou. */
  contaId?: string | null;
}

export interface DadosEdicaoParcela {
  novaData: string;
  novoValor: number;
  /** true = aplica `novoValor` nessa parcela E em todas as seguintes ainda
   * não pagas (renegociação pra frente); false = só nessa parcela. */
  aplicarSeguintes: boolean;
}

export interface ParcelasInvestimentoProps {
  parcelas: ParcelaInvestimento[];
  periodicidade?: "mensal" | "quinzenal" | "semanal" | null;
  /** Diária combinada pra esse empréstimo (R$/dia) — usada só pra sugerir o
   * valor no formulário de "só juros"; nula = sem diária configurada. */
  valorDiariaPorDia?: number | null;
  salvando: boolean;
  onAlternarPaga: (parcela: ParcelaInvestimento) => void;
  /** Edita manualmente a data e/ou o valor de uma parcela já criada — usado
   * tanto quando o combinado real tem frequência mista (ex: uma parcela
   * ficou quinzenal e as outras mensais) quanto pra corrigir um valor
   * digitado errado ao cadastrar, ou renegociar o valor das próximas
   * parcelas (ver `DadosEdicaoParcela.aplicarSeguintes`). */
  onEditarParcela?: (parcela: ParcelaInvestimento, dados: DadosEdicaoParcela) => void | Promise<void>;
  /** "Só juros" nessa parcela — a dívida dela continua em aberto e o
   * vencimento rola 1 mês pra frente (só dela, ou dela em diante — ver
   * `empurrarSeguintes`). Só aparece pra empréstimos parcelados. */
  onRegistrarJuros?: (parcela: ParcelaInvestimento, dados: DadosJurosParcela) => void | Promise<void>;
  /** Acrescenta uma parcela nova no fim (23/nov/2026). */
  onAdicionarParcela?: (dados: { data: string; valor: number }) => void | Promise<void>;
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
  onEditarParcela,
  onRegistrarJuros,
  onAdicionarParcela,
}: ParcelasInvestimentoProps) {
  // Acrescentar juros na edição da parcela (R$ ou %), somado ao valor.
  const [acrescimoTexto, setAcrescimoTexto] = React.useState("");
  const [acrescimoEmPct, setAcrescimoEmPct] = React.useState(false);
  // Nova parcela no fim.
  const [adicionando, setAdicionando] = React.useState(false);
  const [novaData, setNovaData] = React.useState("");
  const [novoValor, setNovoValor] = React.useState("");
  const [erroNova, setErroNova] = React.useState<string | null>(null);
  const [expandido, setExpandido] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [dataEmEdicao, setDataEmEdicao] = React.useState("");
  const [valorEmEdicao, setValorEmEdicao] = React.useState("");
  const [aplicarValorSeguintes, setAplicarValorSeguintes] = React.useState(false);
  const [erroEdicao, setErroEdicao] = React.useState<string | null>(null);
  const [jurosId, setJurosId] = React.useState<string | null>(null);
  const [dataPagamentoJuros, setDataPagamentoJuros] = React.useState(hojeIso());
  const [jurosTexto, setJurosTexto] = React.useState("");
  const [diariaTexto, setDiariaTexto] = React.useState("0,00");
  const [diariaEditadaManualmente, setDiariaEditadaManualmente] = React.useState(false);
  const [empurrarSeguintes, setEmpurrarSeguintes] = React.useState(false);
  const [erroJuros, setErroJuros] = React.useState<string | null>(null);
  const [contaJuros, setContaJuros] = React.useState("");
  const resumo = React.useMemo(() => resumirParcelas(parcelas), [parcelas]);
  const sufixoPeriodicidade =
    periodicidade === "quinzenal" || periodicidade === "semanal" ? ` ${LABEL_PERIODICIDADE[periodicidade]}` : "";

  const parcelaEmJuros = jurosId ? parcelas.find((p) => p.id === jurosId) ?? null : null;
  const temSeguintes = parcelaEmJuros
    ? parcelas.some((p) => p.numero > parcelaEmJuros.numero && !p.pago)
    : false;
  const diasAtrasoJuros = parcelaEmJuros ? calcularDiasAtraso(parcelaEmJuros.data_vencimento, dataPagamentoJuros) : 0;
  const diariaSugerida = calcularValorDiaria(diasAtrasoJuros, valorDiariaPorDia ?? null);

  const parcelaEmEdicao = editandoId ? parcelas.find((p) => p.id === editandoId) ?? null : null;
  const temSeguintesParaEdicao = parcelaEmEdicao
    ? parcelas.some((p) => p.numero > parcelaEmEdicao.numero && !p.pago)
    : false;

  React.useEffect(() => {
    if (diariaEditadaManualmente) return;
    setDiariaTexto(formatarValorParaInput(diariaSugerida));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diariaSugerida, diariaEditadaManualmente]);

  function abrirEdicao(parcela: ParcelaInvestimento) {
    setJurosId(null);
    setEditandoId(parcela.id);
    setDataEmEdicao(parcela.data_vencimento);
    setValorEmEdicao(formatarValorParaInput(Number(parcela.valor)));
    setAplicarValorSeguintes(false);
    setErroEdicao(null);
    setAcrescimoTexto("");
  }

  function aplicarAcrescimo() {
    if (!parcelaEmEdicao) return;
    const n = parsearValor(acrescimoTexto || "0");
    if (!(n > 0)) return;
    const atual = parsearValor(valorEmEdicao || "0") || Number(parcelaEmEdicao.valor);
    const soma = acrescimoEmPct ? atual * (1 + n / 100) : atual + n;
    setValorEmEdicao(formatarValorParaInput(soma));
    setAcrescimoTexto("");
  }

  function abrirNovaParcela() {
    const ultima = [...parcelas].sort((a, b) => b.numero - a.numero)[0];
    setNovaData(ultima ? adicionarMeses(ultima.data_vencimento, 1) : hojeIso());
    setNovoValor(ultima ? formatarValorParaInput(Number(ultima.valor)) : "");
    setErroNova(null);
    setAdicionando(true);
  }

  async function confirmarNovaParcela() {
    if (!onAdicionarParcela) return;
    const v = parsearValor(novoValor || "0");
    if (!(v > 0) || !novaData) {
      setErroNova("Digite data e valor da parcela.");
      return;
    }
    await onAdicionarParcela({ data: novaData, valor: v });
    setAdicionando(false);
  }

  function fecharEdicao() {
    setEditandoId(null);
    setErroEdicao(null);
  }

  async function confirmarEdicao() {
    if (!parcelaEmEdicao || !onEditarParcela) return;
    const novoValor = parsearValor(valorEmEdicao || "0");
    if (!novoValor || novoValor <= 0) {
      setErroEdicao("Digite um valor válido pra parcela.");
      return;
    }
    if (!dataEmEdicao) {
      setErroEdicao("Escolha a data de vencimento.");
      return;
    }
    setErroEdicao(null);
    await onEditarParcela(parcelaEmEdicao, {
      novaData: dataEmEdicao,
      novoValor,
      aplicarSeguintes: aplicarValorSeguintes,
    });
    setEditandoId(null);
  }

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
    if (!contaJuros) {
      setErroJuros("Escolha em qual carteira o dinheiro entrou.");
      return;
    }
    setErroJuros(null);
    await onRegistrarJuros(parcelaEmJuros, {
      valorJuros,
      valorDiaria,
      dataPagamento: dataPagamentoJuros,
      empurrarSeguintes,
      contaId: contaJuros,
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
                      {!parcela.pago && Number(parcela.valor_recebido ?? 0) > 0 ? (
                        <span className="ml-1 text-xs font-normal text-amber-800 dark:text-amber-200">
                          (recebido {formatarMoeda(Number(parcela.valor_recebido))}, faltam {formatarMoeda(Number(parcela.valor) - Number(parcela.valor_recebido))})
                        </span>
                      ) : null}
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
                    {onEditarParcela && !editando && !emJuros && (
                      <button
                        type="button"
                        aria-label="Editar parcela"
                        disabled={salvando}
                        onClick={() => abrirEdicao(parcela)}
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
                {editando && onEditarParcela && (
                  <div className="flex flex-col gap-2 rounded-lg bg-white p-2.5 ring-1 ring-inset ring-border">
                    <div className="flex flex-wrap items-end gap-2">
                      <DateMaskInput label="Vencimento" value={dataEmEdicao} onChange={setDataEmEdicao} />
                      <div className="w-28">
                        <Input
                          label="Valor"
                          inputMode="decimal"
                          value={valorEmEdicao}
                          onChange={(e) => setValorEmEdicao(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-28">
                        <Input
                          label="Acrescentar juros"
                          inputMode="decimal"
                          value={acrescimoTexto}
                          onChange={(e) => setAcrescimoTexto(e.target.value)}
                          placeholder={acrescimoEmPct ? "10" : "0,00"}
                        />
                      </div>
                      <div className="flex gap-1 rounded-lg bg-muted/10 p-1">
                        {([false, true] as const).map((pct) => (
                          <button
                            key={String(pct)}
                            type="button"
                            onClick={() => setAcrescimoEmPct(pct)}
                            className={cn("rounded-md px-2 py-1 text-xs font-medium", acrescimoEmPct === pct ? "bg-card text-primary-700 shadow-sm" : "text-muted")}
                          >
                            {pct ? "%" : "R$"}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={aplicarAcrescimo}
                        className="h-9 rounded-xl px-3 text-xs font-medium text-primary-700 ring-1 ring-inset ring-border hover:bg-muted/10"
                      >
                        Somar ao valor
                      </button>
                    </div>
                    {temSeguintesParaEdicao && (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-foreground">Aplicar esse valor em</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAplicarValorSeguintes(false)}
                            className={cn(
                              "rounded-lg border px-2.5 py-1 text-xs font-medium transition-all",
                              !aplicarValorSeguintes
                                ? "border-primary-500 bg-primary-50 text-primary-700"
                                : "border-border text-muted"
                            )}
                          >
                            Só essa parcela
                          </button>
                          <button
                            type="button"
                            onClick={() => setAplicarValorSeguintes(true)}
                            className={cn(
                              "rounded-lg border px-2.5 py-1 text-xs font-medium transition-all",
                              aplicarValorSeguintes
                                ? "border-primary-500 bg-primary-50 text-primary-700"
                                : "border-border text-muted"
                            )}
                          >
                            Essa e as seguintes
                          </button>
                        </div>
                      </div>
                    )}
                    {erroEdicao && <p className="text-xs text-rose-600">{erroEdicao}</p>}
                    <div className="flex items-center gap-2 pt-1">
                      <Button type="button" size="sm" variant="secondary" disabled={salvando} onClick={confirmarEdicao}>
                        Salvar
                      </Button>
                      <button
                        type="button"
                        onClick={fecharEdicao}
                        className="h-9 rounded-xl px-3 text-xs font-medium text-muted hover:bg-muted/10"
                      >
                        Cancelar
                      </button>
                    </div>
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
                    <SeletorCarteira valor={contaJuros} onChange={setContaJuros} ajuda="" />
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
          {onAdicionarParcela &&
            (adicionando ? (
              <div className="flex flex-col gap-2 rounded-lg bg-white p-2.5 ring-1 ring-inset ring-border dark:bg-card">
                <span className="text-xs font-medium text-foreground">Nova parcela {parcelas.length + 1}</span>
                <div className="flex flex-wrap items-end gap-2">
                  <DateMaskInput label="Vencimento" value={novaData} onChange={setNovaData} />
                  <div className="w-28">
                    <Input label="Valor" inputMode="decimal" value={novoValor} onChange={(e) => setNovoValor(e.target.value)} placeholder="0,00" />
                  </div>
                </div>
                {erroNova && <p className="text-xs text-rose-600">{erroNova}</p>}
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="secondary" disabled={salvando} onClick={confirmarNovaParcela}>
                    Adicionar
                  </Button>
                  <button type="button" onClick={() => setAdicionando(false)} className="h-9 rounded-xl px-3 text-xs font-medium text-muted hover:bg-muted/10">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={salvando}
                onClick={abrirNovaParcela}
                className="flex items-center gap-1.5 self-start rounded-full px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-muted/10 dark:text-primary-300"
              >
                <Plus size={12} /> Adicionar parcela
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
