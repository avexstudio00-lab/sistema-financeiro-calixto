"use client";

import * as React from "react";
import { Zap, X } from "lucide-react";
import { listarModelos, removerModelo } from "@/lib/data/modelosLancamento";
import { abrirLancamentoRapido, EVENTO_LANCAMENTO_SALVO } from "@/components/dashboard/BotaoLancamentoGlobal";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ModeloLancamento } from "@/lib/data/tipos";

/**
 * Chips de lançamento rápido (item 6.1 da especificação de 03/out/2026).
 * Um toque abre o modal global já preenchido — só falta digitar o valor.
 * Os modelos nascem no próprio modal ("Salvar como lançamento rápido").
 */
export function AtalhosLancamento({ usuarioId, mundo }: { usuarioId: string; mundo: "pessoal" | "negocio" }) {
  const [modelos, setModelos] = React.useState<ModeloLancamento[]>([]);
  const [editando, setEditando] = React.useState(false);

  const carregar = React.useCallback(() => {
    listarModelos(usuarioId, mundo).then(setModelos);
  }, [usuarioId, mundo]);

  React.useEffect(() => {
    carregar();
    window.addEventListener(EVENTO_LANCAMENTO_SALVO, carregar);
    return () => window.removeEventListener(EVENTO_LANCAMENTO_SALVO, carregar);
  }, [carregar]);

  async function remover(id: string) {
    await removerModelo(id);
    carregar();
  }

  if (modelos.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-small font-semibold text-foreground">
          <Zap size={14} className="text-primary-700" />
          Lançamento rápido
        </p>
        <button type="button" onClick={() => setEditando((v) => !v)} className="text-xs font-semibold text-accent-700 hover:underline">
          {editando ? "Concluir" : "Gerenciar"}
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {modelos.map((m) => (
          <div key={m.id} className="flex shrink-0 items-center">
            <button
              type="button"
              disabled={editando}
              onClick={() => abrirLancamentoRapido(m)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2 text-small font-medium transition-colors",
                m.tipo === "receita"
                  ? "border-accent-200 bg-accent-50 text-accent-800 hover:bg-accent-100"
                  : "border-border bg-card text-foreground hover:bg-muted/10",
                editando && "opacity-60"
              )}
            >
              {m.nome}
              {m.ultimo_valor != null && <span className="text-xs text-muted">{formatarMoeda(Number(m.ultimo_valor))}</span>}
            </button>
            {editando && (
              <button
                type="button"
                onClick={() => remover(m.id)}
                aria-label={`Remover atalho ${m.nome}`}
                className="-ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
