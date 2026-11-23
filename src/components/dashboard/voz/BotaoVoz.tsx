"use client";

import * as React from "react";
import { Mic } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarAnotacoesPendentes } from "@/lib/data/voz";
import { VozModal } from "./VozModal";

/** Evento pra abrir o "Anotar falando" de qualquer tela. */
export const EVENTO_ABRIR_VOZ = "meucontrole:abrir-voz";

/**
 * Microfone no topo (23/nov/2026): abre o "Anotar falando". A bolinha mostra
 * quantas anotações da Siri estão esperando conferência.
 */
export function BotaoVoz() {
  const { user } = useAuth();
  const [aberto, setAberto] = React.useState(false);
  const [pendentes, setPendentes] = React.useState(0);

  React.useEffect(() => {
    if (!user) return;
    let ativo = true;
    const conferir = () => {
      void listarAnotacoesPendentes(user.id).then((l) => {
        if (ativo) setPendentes(l.length);
      });
    };
    conferir();
    // Voltou pro app (ex.: depois de falar com a Siri): confere de novo.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") conferir();
    };
    const abrir = () => setAberto(true);
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener(EVENTO_ABRIR_VOZ, abrir);
    return () => {
      ativo = false;
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener(EVENTO_ABRIR_VOZ, abrir);
    };
  }, [user]);

  const aoMudarPendentes = React.useCallback((n: number) => setPendentes(n), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={pendentes > 0 ? `Anotar falando (${pendentes} da Siri pra conferir)` : "Anotar falando"}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-muted/10 hover:text-foreground"
      >
        <Mic size={18} />
        {pendentes > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
            {pendentes > 9 ? "9+" : pendentes}
          </span>
        )}
      </button>
      <VozModal aberto={aberto} onFechar={() => setAberto(false)} onMudouPendentes={aoMudarPendentes} />
    </>
  );
}
