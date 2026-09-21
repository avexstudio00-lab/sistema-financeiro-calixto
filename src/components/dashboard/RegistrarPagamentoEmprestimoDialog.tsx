"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { cn } from "@/lib/utils";
import { calcularDiasAtraso, calcularValorDiaria } from "@/lib/data/investimentos";
import { formatarMoeda } from "@/lib/format";
import type { Investimento, ParcelaInvestimento } from "@/lib/data/tipos";

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

/** À vista: registra "só juros" (rola o vencimento 1 mês) ou "quitação"
 * (fecha o empréstimo de vez). Quitação antecipada de parcelado: só
 * quitação, cobrindo todas as parcelas em aberto de uma vez. */
export type ContextoPagamentoEmprestimo =
  | { modo: "avista"; investimento: Investimento }
  | { modo: "quitacaoAntecipada"; investimento: Investimento; parcelasEmAberto: ParcelaInvestimento[] };

export interface RegistrarPagamentoEmprestimoDialogProps {
  contexto: ContextoPagamentoEmprestimo;
  salvando: boolean;
  onFechar: () => void;
  onRegistrarJuros: (dados: {
    valorJuros: number;
    valorDiaria: number;
    dataPagamento: string;
  }) => void | Promise<void>;
  onRegistrarQuitacao: (dados: {
    valorPago: number;
    valorDiaria: number;
    dataPagamento: string;
  }) => void | Promise<void>;
}

export function RegistrarPagamentoEmprestimoDialog({
  contexto,
  salvando,
  onFechar,
  onRegistrarJuros,
  onRegistrarQuitacao,
}: RegistrarPagamentoEmprestimoDialogProps) {
  const ehAvista = contexto.modo === "avista";
  const inv = contexto.investimento;

  const [acao, setAcao] = React.useState<"juros" | "quitacao">("juros");
  const [dataPagamento, setDataPagamento] = React.useState(hojeIso());
  const [diariaTexto, setDiariaTexto] = React.useState("0,00");
  const [diariaEditadaManualmente, setDiariaEditadaManualmente] = React.useState(false);
  const [jurosTexto, setJurosTexto] = React.useState("");
  const [valorPagoTexto, setValorPagoTexto] = React.useState("");
  const [valorPagoEditadoManualmente, setValorPagoEditadoManualmente] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const parcelasEmAberto = contexto.modo === "quitacaoAntecipada" ? contexto.parcelasEmAberto : [];

  const vencimentoReferencia = ehAvista
    ? inv.data_vencimento_final
    : parcelasEmAberto.reduce(
        (maisAntiga, p) => (p.data_vencimento < maisAntiga ? p.data_vencimento : maisAntiga),
        parcelasEmAberto[0]?.data_vencimento ?? hojeIso()
      );

  const diasAtraso = vencimentoReferencia ? calcularDiasAtraso(vencimentoReferencia, dataPagamento) : 0;

  const jurosCombinado =
    inv.valor_retornavel != null ? Math.max(0, Number(inv.valor_retornavel) - Number(inv.valor_investido)) : 0;

  const totalParcelasEmAberto = parcelasEmAberto.reduce((acc, p) => acc + Number(p.valor), 0);

  const diariaSugerida = calcularValorDiaria(diasAtraso, inv.valor_diaria);

  // Recalcula a diária sugerida sempre que a data (e portanto os dias de
  // atraso) muda — a menos que a pessoa já tenha editado o campo à mão (ex:
  // combinaram um valor diferente do R$/dia padrão desse empréstimo).
  React.useEffect(() => {
    if (diariaEditadaManualmente) return;
    setDiariaTexto(formatarValorParaInput(diariaSugerida));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diariaSugerida, diariaEditadaManualmente]);

  // Prefill do juros combinado, uma vez (não recalcula depois — se a pessoa
  // editar, o valor digitado é o que vale).
  React.useEffect(() => {
    setJurosTexto(formatarValorParaInput(jurosCombinado));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const diariaNumero = parsearValor(diariaTexto || "0") || 0;
  const jurosNumero = parsearValor(jurosTexto || "0") || 0;

  const valorPagoSugerido = (ehAvista ? Number(inv.valor_retornavel ?? 0) : totalParcelasEmAberto) + diariaNumero;

  React.useEffect(() => {
    if (valorPagoEditadoManualmente) return;
    setValorPagoTexto(formatarValorParaInput(valorPagoSugerido));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorPagoSugerido, valorPagoEditadoManualmente]);

  const totalJuros = jurosNumero + diariaNumero;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dataPagamento) {
      setErro("Escolha a data do pagamento.");
      return;
    }
    if (ehAvista && acao === "juros") {
      if (!jurosNumero || jurosNumero <= 0) {
        setErro("Digite o valor do juros pago.");
        return;
      }
      setErro(null);
      await onRegistrarJuros({ valorJuros: jurosNumero, valorDiaria: diariaNumero, dataPagamento });
      return;
    }
    const valorPagoNumero = parsearValor(valorPagoTexto || "0");
    if (!valorPagoNumero || valorPagoNumero <= 0) {
      setErro("Digite o valor total pago.");
      return;
    }
    setErro(null);
    await onRegistrarQuitacao({ valorPago: valorPagoNumero, valorDiaria: diariaNumero, dataPagamento });
  }

  const mostrarQuitacao = !ehAvista || acao === "quitacao";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl bg-card p-6 shadow-card-hover sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-h3 text-foreground">{ehAvista ? "Registrar pagamento" : "Quitar parcelas em aberto"}</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {ehAvista && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAcao("juros")}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2 text-small font-medium transition-all",
                  acao === "juros" ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border text-muted"
                )}
              >
                Só juros
              </button>
              <button
                type="button"
                onClick={() => setAcao("quitacao")}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2 text-small font-medium transition-all",
                  acao === "quitacao"
                    ? "border-primary-500 bg-primary-50 text-primary-700"
                    : "border-border text-muted"
                )}
              >
                Quitação total
              </button>
            </div>
          )}

          {!ehAvista && (
            <p className="text-small text-muted">
              Fecha de uma vez as {parcelasEmAberto.length} parcela{parcelasEmAberto.length === 1 ? "" : "s"} ainda em
              aberto (soma combinada: {formatarMoeda(totalParcelasEmAberto)}).
            </p>
          )}

          <DateMaskInput label="Data do pagamento" value={dataPagamento} onChange={setDataPagamento} />

          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-foreground">
              Diária de atraso {diasAtraso > 0 ? `(${diasAtraso} dia${diasAtraso === 1 ? "" : "s"} de atraso)` : ""}
            </span>
            <Input
              inputMode="decimal"
              value={diariaTexto}
              onChange={(e) => {
                setDiariaTexto(e.target.value);
                setDiariaEditadaManualmente(true);
              }}
              placeholder="0,00"
              helperText={
                diasAtraso > 0
                  ? "Já somada a diária combinada pra esse empréstimo — pode ajustar se combinaram outro valor."
                  : "Sem atraso até essa data — sem diária."
              }
            />
          </div>

          {!mostrarQuitacao ? (
            <>
              <Input
                label="Valor do juros pago"
                inputMode="decimal"
                value={jurosTexto}
                onChange={(e) => setJurosTexto(e.target.value)}
                placeholder="0,00"
                helperText="O combinado de juros dessa rodada — pode ajustar se ficou diferente."
              />
              <div className="rounded-xl bg-muted/5 p-3 text-small text-foreground">
                Total a receber agora: <span className="font-semibold">{formatarMoeda(totalJuros)}</span>
                <p className="mt-1 text-xs text-muted">
                  A dívida continua em aberto — o vencimento passa 1 mês pra frente.
                </p>
              </div>
            </>
          ) : (
            <Input
              label="Valor total pago"
              inputMode="decimal"
              value={valorPagoTexto}
              onChange={(e) => {
                setValorPagoTexto(e.target.value);
                setValorPagoEditadoManualmente(true);
              }}
              placeholder="0,00"
              helperText="Fecha o empréstimo — pode ser igual ao combinado ou outro valor renegociado."
            />
          )}

          {erro && <p className="text-small text-rose-600">{erro}</p>}

          <Button type="submit" size="lg" disabled={salvando} className="mt-1 w-full">
            {salvando ? "Salvando..." : mostrarQuitacao ? "Registrar quitação" : "Registrar juros"}
          </Button>
        </form>
      </div>
    </div>
  );
}
