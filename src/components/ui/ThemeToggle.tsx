"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const [escuro, setEscuro] = React.useState(false);
  const [montado, setMontado] = React.useState(false);

  React.useEffect(() => {
    setMontado(true);

    let escolhaManual: string | null = null;
    try {
      escolhaManual = localStorage.getItem("tema");
    } catch {
      // localStorage indisponível — segue só o que já está aplicado na página
    }

    setEscuro(document.documentElement.classList.contains("dark"));

    // Se a pessoa nunca trocou o tema manualmente aqui no app, o app
    // continua acompanhando o modo claro/escuro do próprio celular ao
    // vivo -- inclusive o "Automático" do iOS/Android, que escurece
    // sozinho por horário. Depois do primeiro toque manual no botão
    // abaixo, a escolha da pessoa passa a valer sempre, sem mais seguir
    // o sistema (não seria legal o app voltar sozinho pro que ela não
    // escolheu). Não dá pra ler o sensor de luz de verdade do celular
    // pelo navegador -- só o Chrome/Android tem isso, de forma
    // experimental, e nem o Safari nem o iOS oferecem essa leitura pra
    // páginas web -- por isso a gente segue o ajuste de aparência do
    // próprio aparelho, que é o que dá pra fazer sem precisar de um app
    // nativo.
    if (escolhaManual) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function seguirSistema(e: MediaQueryListEvent) {
      setEscuro(e.matches);
      document.documentElement.classList.toggle("dark", e.matches);
    }
    media.addEventListener("change", seguirSistema);
    return () => media.removeEventListener("change", seguirSistema);
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
