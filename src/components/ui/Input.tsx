"use client";

import * as React from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, helperText, error, leftIcon, rightIcon, id, type, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    // Campo de senha ganha automaticamente o botão de "olhinho" pra
    // mostrar/ocultar a senha digitada — pedido do usuário (16/set/2026).
    // Só entra em cena quando ninguém já pediu um rightIcon próprio (hoje
    // nenhum campo de senha do app usa rightIcon, então isso nunca conflita).
    const ehCampoDeSenha = type === "password";
    const [mostrarSenha, setMostrarSenha] = React.useState(false);
    const tipoReal = ehCampoDeSenha ? (mostrarSenha ? "text" : "password") : type;
    const mostrarBotaoOlho = ehCampoDeSenha && !rightIcon;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-small font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <Icon
              icon={leftIcon}
              size="sm"
              className="pointer-events-none absolute left-3.5 text-muted"
            />
          )}
          <input
            id={inputId}
            ref={ref}
            type={tipoReal}
            className={cn(
              "h-11 w-full rounded-xl border bg-card px-4 text-body text-foreground placeholder:text-muted transition-all duration-200 ease-smooth",
              "border-border focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100",
              "disabled:cursor-not-allowed disabled:bg-muted/10 disabled:text-muted",
              leftIcon && "pl-10",
              (rightIcon || mostrarBotaoOlho) && "pr-10",
              error && "border-rose-400 focus:border-rose-500 focus:ring-rose-100",
              className
            )}
            aria-invalid={!!error}
            {...props}
          />
          {mostrarBotaoOlho ? (
            <button
              type="button"
              onClick={() => setMostrarSenha((atual) => !atual)}
              className="absolute right-3.5 text-muted transition-colors hover:text-foreground"
              aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              tabIndex={-1}
            >
              <Icon icon={mostrarSenha ? EyeOff : Eye} size="sm" />
            </button>
          ) : (
            rightIcon && (
              <Icon
                icon={rightIcon}
                size="sm"
                className="pointer-events-none absolute right-3.5 text-muted"
              />
            )
          )}
        </div>
        {(helperText || error) && (
          <p className={cn("text-small", error ? "text-rose-600" : "text-muted")}>
            {error ?? helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
