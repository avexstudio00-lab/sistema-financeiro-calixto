"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useFilaPendente } from "@/lib/offline/useFilaPendente";
import { sincronizarFila } from "@/lib/offline/sincronizarFila";
import { removerDaFila } from "@/lib/offline/fila";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";

/**
 * Mostra quantas anotações feitas sem internet ainda estão esperando para
 * serem enviadas de verdade ao servidor (ver src/lib/offline/fila.ts). A
 * fila é uma só, compartilhada entre todas as telas que têm o botão "Nova
 * anotação" -- por isso esse banner pode aparecer em qualquer uma delas.
 *
 * `aoSincronizar` é chamado depois de um envio manual bem-sucedido (ou
 * parcial), para a tela recarregar os dados reais do servidor.
 */
export function FilaPendenteBanner({ aoSincronizar }: { aoSincronizar?: () => void }) {
  const itens = useFilaPendente();
  const online = useOnlineStatus();
  const [enviando, setEnviando] = React.useState(false);

  if (itens.length === 0) return null;

  const itemComErro = itens.find((item) => item.ultimoErro);

  async function tentarAgora() {
    setEnviando(true);
    const resultado = await sincronizarFila();
    setEnviando(false);
    if (resultado.status === "ok" || resultado.status === "parcial") {
      aoSincronizar?.();
    }
  }

  return (
    <Card className="flex items-start gap-3 border-amber-200 bg-amber-50/60 print:hidden">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body text-slate-700">
          {itens.length} anotaç{itens.length > 1 ? "ões" : "ão"} aguardando envio
          {!online && " — assim que a internet voltar, envia sozinho"}
          {online && itemComErro && (
            <>
              {" "}
              — não foi possível enviar &ldquo;{itemComErro.dados.descricao}&rdquo; ({itemComErro.ultimoErro})
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {online && (
            <Button variant="tertiary" size="sm" onClick={tentarAgora} disabled={enviando}>
              {enviando ? "Enviando..." : "Tentar agora"}
            </Button>
          )}
          {itemComErro && (
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => removerDaFila(itemComErro.idLocal)}
              className="text-red-500 hover:bg-rose-50"
            >
              Apagar essa anotação
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
