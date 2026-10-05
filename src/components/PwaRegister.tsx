"use client";

import * as React from "react";

/** Evento de instalação do Chrome/Android (não tipado no lib.dom). */
export interface EventoInstalacaoPwa extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __calixtoInstalar?: EventoInstalacaoPwa | null;
  }
}

export function PwaRegister() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    // Android/Chrome: guarda o pedido de instalação pra oferecer um botão
    // "Instalar app" na tela de notificações (item 6.6, "d").
    const guardar = (e: Event) => {
      e.preventDefault();
      window.__calixtoInstalar = e as EventoInstalacaoPwa;
      window.dispatchEvent(new Event("calixto:instalavel"));
    };
    const instalado = () => {
      window.__calixtoInstalar = null;
      window.dispatchEvent(new Event("calixto:instalavel"));
    };
    window.addEventListener("beforeinstallprompt", guardar);
    window.addEventListener("appinstalled", instalado);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Se falhar, o site continua funcionando normalmente pelo navegador.
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", guardar);
      window.removeEventListener("appinstalled", instalado);
    };
  }, []);

  return null;
}
