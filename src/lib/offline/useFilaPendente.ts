"use client";

import * as React from "react";
import { listarFila, ouvirMudancaFila, type ItemFila } from "./fila";

/**
 * Lê a fila de anotações pendentes (ver fila.ts) e se mantém atualizado
 * sozinho sempre que algo muda nela -- nova anotação offline, sincronização
 * concluída, item removido -- sem precisar recarregar a página.
 */
export function useFilaPendente(): ItemFila[] {
  const [itens, setItens] = React.useState<ItemFila[]>([]);

  React.useEffect(() => {
    setItens(listarFila());
    return ouvirMudancaFila(() => setItens(listarFila()));
  }, []);

  return itens;
}
