"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DateMaskInputProps {
  /** Data em ISO "YYYY-MM-DD", ou "" quando ainda não tem uma data válida. */
  value: string;
  /** Chamado só quando os três campos (dia/mês/ano) formam uma data válida
   * completa, ou quando os três são apagados por completo (nesse caso
   * recebe ""). Nunca é chamado com uma data incompleta/inválida, pra não
   * propagar lixo pro resto do formulário. */
  onChange: (isoOuVazio: string) => void;
  id?: string;
  label?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

interface PartesData {
  dia: string;
  mes: string;
  ano: string;
}

function isoParaPartes(iso: string): PartesData {
  if (!iso) return { dia: "", mes: "", ano: "" };
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return { dia: "", mes: "", ano: "" };
  return { dia, mes, ano };
}

/** Converte dia/mês/ano (strings de dígitos) pra ISO "YYYY-MM-DD", validando
 * que a data existe de verdade (ex: rejeita 31/02/2026) — devolve null se
 * incompleta ou inválida. */
function partesParaIsoValido({ dia, mes, ano }: PartesData): string | null {
  if (dia.length !== 2 || mes.length !== 2 || ano.length !== 4) return null;
  const diaNum = Number(dia);
  const mesNum = Number(mes);
  const anoNum = Number(ano);
  if (mesNum < 1 || mesNum > 12) return null;
  const ultimoDiaDoMes = new Date(anoNum, mesNum, 0).getDate();
  if (diaNum < 1 || diaNum > ultimoDiaDoMes) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${anoNum}-${pad(mesNum)}-${pad(diaNum)}`;
}

function apenasDigitos(texto: string, max: number): string {
  return texto.replace(/\D/g, "").slice(0, max);
}

const classeCaixa =
  "h-11 rounded-xl border bg-card text-center text-small text-foreground placeholder:text-muted/70 transition-all duration-200 ease-smooth border-border focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-muted/10 disabled:text-muted";

/**
 * Campo de data em 3 caixinhas independentes — Dia / Mês / Ano — em vez de
 * um único campo de texto. Cada caixinha só aceita dígitos, avança sozinha
 * pra próxima ao completar (dia → mês → ano), e Backspace numa caixinha
 * vazia volta o foco pra anterior. Clicar em qualquer uma delas edita só
 * aquela parte — nunca mexe nas outras (era o problema do campo de texto
 * único anterior: clicar no meio pra corrigir só o dia podia embaralhar o
 * mês/ano inteiros, obrigando a pessoa a apagar tudo e digitar de novo).
 * Guarda o valor internamente como 3 strings de dígitos, e só avisa o
 * formulário pai via `onChange` quando os 8 dígitos (dia+mês+ano) formarem
 * uma data real.
 */
export function DateMaskInput({
  value,
  onChange,
  id,
  label,
  helperText,
  error,
  disabled,
  className,
  ...aria
}: DateMaskInputProps) {
  const [partes, setPartes] = React.useState<PartesData>(() => isoParaPartes(value));
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  const diaRef = React.useRef<HTMLInputElement>(null);
  const mesRef = React.useRef<HTMLInputElement>(null);
  const anoRef = React.useRef<HTMLInputElement>(null);

  // Sincroniza quando o valor vem de fora (ex: geração automática das datas
  // sugeridas ao mudar periodicidade) — mas nunca enquanto a pessoa ainda
  // está no meio de digitar algo que já diverge (evita "brigar" com o
  // teclado dela).
  React.useEffect(() => {
    setPartes(isoParaPartes(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /** Avisa o formulário pai só quando as 3 partes formam uma data válida
   * completa, ou quando as 3 estão vazias (campo limpo por completo). Uma
   * combinação parcial (ex: só o dia preenchido) nunca dispara `onChange` —
   * o valor anterior do pai continua valendo até a pessoa terminar. */
  function commitar(novasPartes: PartesData) {
    const { dia, mes, ano } = novasPartes;
    if (dia === "" && mes === "" && ano === "") {
      onChange("");
      return;
    }
    const iso = partesParaIsoValido(novasPartes);
    if (iso) onChange(iso);
  }

  function handleChangeDia(e: React.ChangeEvent<HTMLInputElement>) {
    const dia = apenasDigitos(e.target.value, 2);
    const novasPartes = { ...partes, dia };
    setPartes(novasPartes);
    commitar(novasPartes);
    if (dia.length === 2) mesRef.current?.focus();
  }

  function handleChangeMes(e: React.ChangeEvent<HTMLInputElement>) {
    const mes = apenasDigitos(e.target.value, 2);
    const novasPartes = { ...partes, mes };
    setPartes(novasPartes);
    commitar(novasPartes);
    if (mes.length === 2) anoRef.current?.focus();
  }

  function handleChangeAno(e: React.ChangeEvent<HTMLInputElement>) {
    const ano = apenasDigitos(e.target.value, 4);
    const novasPartes = { ...partes, ano };
    setPartes(novasPartes);
    commitar(novasPartes);
  }

  /** Backspace numa caixinha já vazia pula pra caixinha anterior, em vez de
   * ficar "preso" — assim dá pra apagar a data inteira só segurando
   * Backspace, sem precisar clicar em cada caixinha na mão. */
  function handleKeyDownMes(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && partes.mes === "") diaRef.current?.focus();
  }
  function handleKeyDownAno(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && partes.ano === "") mesRef.current?.focus();
  }

  const dataInvalida =
    partes.dia.length === 2 &&
    partes.mes.length === 2 &&
    partes.ano.length === 4 &&
    !partesParaIsoValido(partes);

  const grupoAriaLabel = aria["aria-label"] ?? label;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-small font-medium text-foreground">
          {label}
        </label>
      )}
      <div
        role="group"
        aria-label={grupoAriaLabel}
        className={cn(
          "flex w-fit shrink-0 items-center gap-0.5",
          (error || dataInvalida) && "[&_input]:border-rose-400 [&_input]:focus:border-rose-500 [&_input]:focus:ring-rose-100"
        )}
      >
        <input
          id={inputId}
          ref={diaRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={partes.dia}
          onChange={handleChangeDia}
          placeholder="DD"
          disabled={disabled}
          maxLength={2}
          aria-label="Dia"
          aria-invalid={!!error || dataInvalida}
          className={cn(classeCaixa, "w-8 px-0", className)}
        />
        <span aria-hidden className="text-small text-muted">
          /
        </span>
        <input
          ref={mesRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={partes.mes}
          onChange={handleChangeMes}
          onKeyDown={handleKeyDownMes}
          placeholder="MM"
          disabled={disabled}
          maxLength={2}
          aria-label="Mês"
          aria-invalid={!!error || dataInvalida}
          className={cn(classeCaixa, "w-8 px-0", className)}
        />
        <span aria-hidden className="text-small text-muted">
          /
        </span>
        <input
          ref={anoRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={partes.ano}
          onChange={handleChangeAno}
          onKeyDown={handleKeyDownAno}
          placeholder="AAAA"
          disabled={disabled}
          maxLength={4}
          aria-label="Ano"
          aria-invalid={!!error || dataInvalida}
          className={cn(classeCaixa, "w-11 px-0", className)}
        />
      </div>
      {(helperText || error || dataInvalida) && (
        <p className={cn("text-small", error || dataInvalida ? "text-rose-600" : "text-muted")}>
          {dataInvalida ? "Data inválida." : error || helperText}
        </p>
      )}
    </div>
  );
}
