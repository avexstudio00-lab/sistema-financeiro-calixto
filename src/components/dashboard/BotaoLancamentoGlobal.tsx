"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { NovaTransacaoModal } from "@/components/dashboard/NovaTransacaoModal";
import { contarTransacoesDoMes } from "@/lib/data/transacoes";
import { LIMITE_TRANSACOES_GRATIS } from "@/lib/planos";
import { cn } from "@/lib/utils";
import type { ModeloLancamento } from "@/lib/data/tipos";

/** Evento disparado sempre que um lançamento é salvo por um atalho global
 * (FAB ou lançamento rápido) — as telas que mostram saldos escutam e
 * recarregam sozinhas. */
export const EVENTO_LANCAMENTO_SALVO = "meucontrole:lancamento-salvo";

export function avisarLancamentoSalvo() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_LANCAMENTO_SALVO));
}

/** Evento pra abrir o modal global já com um modelo de lançamento rápido. */
export const EVENTO_ABRIR_LANCAMENTO = "meucontrole:abrir-lancamento";

export function abrirLancamentoRapido(modelo: ModeloLancamento) {
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_LANCAMENTO, { detail: modelo }));
}

/**
 * Botão de ação flutuante transversal (item 6.3 da especificação de
 * 03/out/2026): presente em todas as telas internas, no celular e no
 * computador. Sensível ao contexto: dentro de "Minha empresa" abre o
 * lançamento do negócio; no resto, o lançamento pessoal.
 */
export function BotaoLancamentoGlobal() {
  const pathname = usePathname();
  const { user, perfil } = useAuth();
  const [aberto, setAberto] = React.useState(false);
  const [bloqueado, setBloqueado] = React.useState(false);
  const [modelo, setModelo] = React.useState<ModeloLancamento | null>(null);
  const mundo: "pessoal" | "negocio" = pathname?.startsWith("/dashboard/empresa") ? "negocio" : "pessoal";

  const abrir = React.useCallback(
    async (comModelo: ModeloLancamento | null) => {
      setModelo(comModelo);
      // Plano Grátis tem limite de lançamentos pessoais por mês — o atalho
      // global respeita a mesma regra do painel.
      if (mundo === "pessoal" && perfil?.plano === "gratis" && user) {
        const agora = new Date();
        const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString().slice(0, 10);
        const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);
        const usados = await contarTransacoesDoMes(user.id, inicio, fim);
        setBloqueado(usados >= LIMITE_TRANSACOES_GRATIS);
      } else {
        setBloqueado(false);
      }
      setAberto(true);
    },
    [mundo, perfil, user]
  );

  React.useEffect(() => {
    function aoPedir(e: Event) {
      const detalhe = (e as CustomEvent<ModeloLancamento>).detail;
      void abrir(detalhe ?? null);
    }
    window.addEventListener(EVENTO_ABRIR_LANCAMENTO, aoPedir);
    return () => window.removeEventListener(EVENTO_ABRIR_LANCAMENTO, aoPedir);
  }, [abrir]);

  return (
    <>
      <button
        type="button"
        onClick={() => void abrir(null)}
        aria-label={mundo === "negocio" ? "Novo lançamento da empresa" : "Novo lançamento"}
        title={mundo === "negocio" ? "Novo lançamento da empresa" : "Novo lançamento"}
        className={cn(
          "fixed bottom-24 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-card-hover transition-transform hover:scale-105 md:bottom-8 md:right-8 print:hidden",
          mundo === "negocio" ? "bg-accent-700 hover:bg-accent-800" : "bg-primary-700 hover:bg-primary-800"
        )}
      >
        <Plus size={26} />
      </button>
      <NovaTransacaoModal
        aberto={aberto}
        mundo={mundo}
        bloqueado={bloqueado}
        modelo={modelo}
        onFechar={() => {
          setAberto(false);
          setModelo(null);
        }}
        onSalvo={avisarLancamentoSalvo}
      />
    </>
  );
}
