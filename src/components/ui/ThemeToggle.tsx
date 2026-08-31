"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const [escuro, setEscuro] = React.useState(false);
  const [montado, setMontado] = React.useState(false);

  React.useEffect(() => {
    setMontado(true);
    setEscuro(document.documentElement.classList.contains("dark"));
  }, []);

  function alternar() {
    const novoEscuro = !escuro;
    setEscuro(novoEscuro);
    document.documentElement.classList.toggle("dark", novoEscuro);
    try {
      localStorage.setItem("tema", novoEscuro ? "escuro" : "claro");
    } catch {
      // localStorage indisponível — segue sem persistir
    }
  }

  if (!montado) {
    return <div className={cn("h-9 w-9", className)} aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={escuro ? "Mudar para tema claro" : "Mudar para tema escuro"}
      title={escuro ? "Tema claro" : "Tema escuro"}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-muted/10 hover:text-foreground",
        className
      )}
    >
      {escuro ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
    </button>
  );
}
