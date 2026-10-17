"use client";

import * as React from "react";
import { PlusCircle, RotateCcw, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { formatarMoeda } from "@/lib/format";
import {
  arredondar2,
  gerarParcelasFiado,
  somaParcelas,
  vencimentoDaParcela,
  type PeriodicidadeFiado,
} from "@/lib/util/fiado";
import type { Conta } from "@/lib/data/tipos";

export const FORMAS_ENTRADA = [
  { id: "pix", label: "Pix" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
  { id: "boleto", label: "Boleto" },
] as const;

export type FormaEntrada = (typeof FORMAS_ENTRADA)[number]["id"];

/** Estado editável das condições do fiado (tudo em texto, como na tela). */
export interface EstadoFiado {
  temEntrada: boolean;
  entradaValor: string;
  entradaForma: FormaEntrada;
  entradaContaId: string;
  numeroParcelas: string;
  periodicidade: PeriodicidadeFiado;
  primeiroVencimento: string;
  parcelas: { vencimento: string; valor: string }[];
  /** true depois que a pessoa mexe numa parcela à mão: aí a lista para de
   * ser recalculada sozinha (até tocar em "Recalcular"). */
  parcelasEditadas: boolean;
  salvarComoPadrao: boolean;
}

/** "1.234,56" / "1234,56" / "1234.56" → número. */
export function lerValorDigitado(texto: string): number {
  const t = texto.trim();
  if (!t) return 0;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const paraTexto = (v: number) => v.toFixed(2).replace(".", ",");

export function parcelasPadrao(valorAParcelar: number, n: number, primeiro: string, periodicidade: PeriodicidadeFiado) {
  return gerarParcelasFiado(valorAParcelar, n, primeiro, periodicidade).map((p) => ({ vencimento: p.vencimento, valor: paraTexto(p.valor) }));
}

const SELECT =
  "h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100";

/**
 * Condições do fiado em aberto (seção 15.2, 15/out/2026): entrada opcional,
 * número de parcelas, periodicidade, 1º vencimento e o valor de cada
 * parcela — tudo editável na hora da venda, para cada cliente.
 */
export function CondicoesFiado({
  total,
  estado,
  onChange,
  contas,
  temPadraoCliente,
}: {
  total: number;
  estado: EstadoFiado;
  onChange: (novo: EstadoFiado) => void;
  contas: Conta[];
  temPadraoCliente: boolean;
}) {
  const entrada = estado.temEntrada ? lerValorDigitado(estado.entradaValor) || 0 : 0;
  const aParcelar = arredondar2(Math.max(0, total - entrada));
  const parcelasNumericas = estado.parcelas.map((p) => ({ vencimento: p.vencimento, valor: lerValorDigitado(p.valor) }));
  const soma = somaParcelas(parcelasNumericas);
  const falta = arredondar2(aParcelar - soma);

  // Recalcula as parcelas sozinho enquanto a pessoa não editou nenhuma.
  const { parcelasEditadas, numeroParcelas, primeiroVencimento, periodicidade } = estado;
  const n = Math.min(120, Math.max(1, Number(numeroParcelas) || 1));
  React.useEffect(() => {
    if (parcelasEditadas || !/^\d{4}-\d{2}-\d{2}$/.test(primeiroVencimento)) return;
    const novas = parcelasPadrao(aParcelar, n, primeiroVencimento, periodicidade);
    const iguais =
      novas.length === estado.parcelas.length &&
      novas.every((p, i) => p.vencimento === estado.parcelas[i].vencimento && p.valor === estado.parcelas[i].valor);
    if (!iguais) onChange({ ...estado, parcelas: novas });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelasEditadas, aParcelar, n, primeiroVencimento, periodicidade]);

  const editarParcela = (i: number, campo: "vencimento" | "valor", valor: string) =>
    onChange({
      ...estado,
      parcelasEditadas: true,
      parcelas: estado.parcelas.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)),
    });

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-3">
      <p className="text-small font-semibold text-foreground">Condições do fiado</p>

      <label className="flex items-center gap-2 text-small text-foreground">
        <input
          type="checkbox"
          checked={estado.temEntrada}
          onChange={(e) => onChange({ ...estado, temEntrada: e.target.checked })}
          className="h-4 w-4 accent-emerald-600"
        />
        Cliente deu uma entrada agora
      </label>
      {estado.temEntrada && (
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3">
          <Input
            label="Valor da entrada"
            inputMode="decimal"
            value={estado.entradaValor}
            onChange={(e) => onChange({ ...estado, entradaValor: e.target.value })}
            placeholder="0,00"
          />
          <label className="flex flex-col gap-1.5 text-small font-medium text-foreground">
            Forma
            <select
              value={estado.entradaForma}
              onChange={(e) => onChange({ ...estado, entradaForma: e.target.value as FormaEntrada })}
              className={SELECT}
            >
              {FORMAS_ENTRADA.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-small font-medium text-foreground">
            Entrou em qual carteira?
            <select
              value={estado.entradaContaId}
              onChange={(e) => onChange({ ...estado, entradaContaId: e.target.value })}
              className={SELECT}
            >
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 min-[520px]:grid-cols-3">
        <Input
          label="Parcelas"
          inputMode="numeric"
          value={estado.numeroParcelas}
          onChange={(e) => onChange({ ...estado, numeroParcelas: e.target.value.replace(/\D/g, "").slice(0, 3), parcelasEditadas: false })}
        />
        <label className="flex flex-col gap-1.5 text-small font-medium text-foreground">
          A cada
          <select
            value={estado.periodicidade}
            onChange={(e) => onChange({ ...estado, periodicidade: e.target.value as PeriodicidadeFiado, parcelasEditadas: false })}
            className={SELECT}
          >
            <option value="mensal">Mês</option>
            <option value="quinzenal">15 dias</option>
            <option value="semanal">Semana</option>
          </select>
        </label>
        <div className="col-span-2 min-[520px]:col-span-1">
          <DateMaskInput
            label="1º vencimento"
            value={estado.primeiroVencimento}
            onChange={(v) => onChange({ ...estado, primeiroVencimento: v, parcelasEditadas: false })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-small font-medium text-foreground">Parcelas (pode mudar data e valor de cada uma)</p>
          {estado.parcelasEditadas && (
            <button
              type="button"
              onClick={() => onChange({ ...estado, parcelasEditadas: false })}
              className="flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
            >
              <RotateCcw size={13} /> Recalcular em partes iguais
            </button>
          )}
        </div>
        {estado.parcelas.map((p, i) => (
          <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto] items-end gap-2">
            <span className="pb-3 text-xs font-semibold text-muted">{i + 1}ª</span>
            <DateMaskInput aria-label={`Vencimento da ${i + 1}ª parcela`} value={p.vencimento} onChange={(v) => editarParcela(i, "vencimento", v)} />
            <Input aria-label={`Valor da ${i + 1}ª parcela`} inputMode="decimal" value={p.valor} onChange={(e) => editarParcela(i, "valor", e.target.value)} placeholder="0,00" />
            <button
              type="button"
              aria-label={`Remover parcela ${i + 1}`}
              disabled={estado.parcelas.length <= 1}
              onClick={() =>
                onChange({
                  ...estado,
                  parcelasEditadas: true,
                  numeroParcelas: String(estado.parcelas.length - 1),
                  parcelas: estado.parcelas.filter((_, j) => j !== i),
                })
              }
              className="mb-0.5 flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            const ultima = estado.parcelas[estado.parcelas.length - 1];
            const vencimento = ultima
              ? vencimentoDaParcela(ultima.vencimento, 1, estado.periodicidade)
              : estado.primeiroVencimento;
            onChange({
              ...estado,
              parcelasEditadas: true,
              numeroParcelas: String(estado.parcelas.length + 1),
              parcelas: [...estado.parcelas, { vencimento, valor: falta > 0 ? paraTexto(falta) : "" }],
            });
          }}
          className="flex items-center gap-1.5 self-start text-xs font-semibold text-primary-700 hover:underline"
        >
          <PlusCircle size={14} /> Adicionar parcela
        </button>
        <p className={`text-xs ${Math.abs(falta) < 0.01 ? "text-primary-700" : "text-amber-800 dark:text-amber-200"}`}>
          {entrada > 0 ? `Entrada ${formatarMoeda(entrada)} · ` : ""}A receber: {formatarMoeda(aParcelar)} · Parcelas somam{" "}
          {formatarMoeda(soma)}
          {Math.abs(falta) >= 0.01 ? ` — ${falta > 0 ? "faltam" : "sobram"} ${formatarMoeda(Math.abs(falta))}` : " — confere"}
        </p>
      </div>

      <label className="flex items-center gap-2 text-small text-foreground">
        <input
          type="checkbox"
          checked={estado.salvarComoPadrao}
          onChange={(e) => onChange({ ...estado, salvarComoPadrao: e.target.checked })}
          className="h-4 w-4 accent-emerald-600"
        />
        {temPadraoCliente ? "Atualizar o padrão de fiado deste cliente" : "Guardar estas condições como padrão deste cliente"}
      </label>
      <p className="text-xs text-muted">
        As parcelas viram contas a receber no nome do cliente, com lembrete de cobrança quando vencerem.
      </p>
    </div>
  );
}
