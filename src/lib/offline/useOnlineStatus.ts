"use client";

import * as React from "react";

/**
 * Diz se o navegador está com internet agora, atualizando sozinho quando a
 * conexão cai ou volta (eventos `online`/`offline` do navegador).
 *
 * Começa assumindo `true` mesmo em aparelho offline — o valor real só existe
 * no navegador, então isso evita a tela renderizar diferente no servidor e
 * no cliente (hydration mismatch); a primeira execução do efeito já corrige
 * para o valor real assim que a página carrega.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    setOnline(navigator.onLine);

    function aoFicarOnline() {
      setOnline(true);
    }
    function aoFicarOffline() {
      setOnline(false);
    }

    window.addEventListener("online", aoFicarOnline);
    window.addEventListener("offline", aoFicarOffline);
    return () => {
      window.removeEventListener("online", aoFicarOnline);
      window.removeEventListener("offline", aoFicarOffline);
    };
  }, []);

  return online;
}
