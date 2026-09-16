"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface DateMaskInputProps {
  /** Data em ISO "YYYY-MM-DD", ou "" quando ainda não tem uma data válida. */
  value: string;
  /** Chamado só quando o valor digitado forma uma data válida completa (ou
   * quando o campo é apagado por completo — nesse caso recebe ""). Nunca é
   * chamado com uma data incompleta/inválida, pra não propagar lixo pro
   * resto do formulário. */
  onChange: (isoOuVazio: string) => void;
  id?: string;
  label?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

function isoParaDigitos(iso: string): string {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return "";
  return `${dia}${mes}${ano}`;
}

function digitosParaExibicao(digitos: string): string {
  const dia = digitos.slice(0, 2);
  const mes = digitos.slice(2, 4);
  const ano = digitos.slice(4, 8);
  return [dia, mes, ano].filter(Boolean).join("/");
}

/** Converte 8 dígitos DDMMYYYY pra ISO "YYYY-MM-DD", validando que a data
 * existe de verdade (ex: rejeita 31/02/2026) — devolve null se inválida. */
function digitosParaIsoValido(digitos: string): string | null {
  if (digitos.length !== 8) return null;
  const dia = Number(digitos.slice(0, 2));
  const mes = Number(digitos.slice(2, 4));
  const ano = Number(digitos.slice(4, 8));
  if (mes < 1 || mes > 12) return null;
  const ultimoDiaDoMes = new Date(ano, mes, 0).getDate();
  if (dia < 1 || dia > ultimoDiaDoMes) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ano}-${pad(mes)}-${pad(dia)}`;
}

/**
 * Campo de data onde a pessoa só digita números — o app insere as barras
 * sozinho (ex: digitar "16092026" vira "16/09/2026" na tela). Guarda o
 * valor internamente como texto (dígitos), e só avisa o formulário pai via
 * `onChange` quando os 8 dígitos formarem uma data real. Pensado pro caso de
 * preencher várias datas de parcela seguidas rapidamente, sem depender do
 * seletor nativo de calendário do navegador.
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
  const [digitos, setDigitos] = React.useState(() => isoParaDigitos(value));
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  // Sincroniza quando o valor vem de fora (ex: geração automática das datas
  // sugeridas ao mudar periodicidade) — mas nunca enquanto a pessoa ainda
  // está no meio de digitar algo que já diverge (evita "brigar" com o
  // teclado dela).
  React.useEffect(() => {
    setDigitos(isoParaDigitos(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const somenteDigitos = e.target.value.replace(/\D/g, "").slice(0, 8);
    setDigitos(somenteDigitos);
    if (somenteDigitos.length === 0) {
      onChange("");
      return;
    }
    if (somenteDigitos.length === 8) {
      const iso = digitosParaIsoValido(somenteDigitos);
      if (iso) onChange(iso);
    }
  }

  const dataInvalida = digitos.length === 8 && !digitosParaIsoValido(digitos);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-small font-medium text-foreground">
          {label}
        </label>
      )}
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={digitosParaExibicao(digitos)}
        onChange={handleChange}
        placeholder="DD/MM/AAAA"
        disabled={disabled}
        maxLength={10}
        aria-invalid={!!error || dataInvalida}
        className={cn(
          "h-11 w-full rounded-xl border bg-card px-4 text-body text-foreground placeholder:text-muted transition-all duration-200 ease-smooth",
          "border-border focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100",
          "disabled:cursor-not-allowed disabled:bg-muted/10 disabled:text-muted",
          (error || dataInvalida) && "border-rose-400 focus:border-rose-500 focus:ring-rose-100",
          className
        )}
        {...aria}
      />
      {(helperText || error || dataInvalida) && (
        <p className={cn("text-small", error || dataInvalida ? "text-rose-600" : "text-muted")}>
          {dataInvalida ? "Data inválida." : error || helperText}
        </p>
      )}
    </div>
  );
}
