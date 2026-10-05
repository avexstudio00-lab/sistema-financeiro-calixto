"use client";

import * as React from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import type { LancamentoLido, LinhaRejeitada } from "@/lib/util/csvImportacao";

const POR_PAGINA = 100;

function dataBr(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Passo 3: conferência obrigatória antes de gravar. */
export function ConferenciaImportacao({
  validos,
  rejeitados,
  duplicadas,
  selecionados,
  onSelecionados,
  importando,
  onVoltar,
  onCancelar,
  onConfirmar,
}: {
  validos: LancamentoLido[];
  rejeitados: LinhaRejeitada[];
  duplicadas: Set<number>;
  selecionados: Set<number>;
  onSelecionados: (s: Set<number>) => void;
  importando: boolean;
  onVoltar: () => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const [visiveis, setVisiveis] = React.useState(POR_PAGINA);
  const [verRejeitadas, setVerRejeitadas] = React.useState(false);
  const duplicadasIncluidas = Array.from(duplicadas).filter((i) => selecionados.has(i)).length;
  const incluirDuplicadas = duplicadas.size > 0 && duplicadasIncluidas === duplicadas.size;
  const total = selecionados.size;
  const liquido = Array.from(selecionados).reduce((acc, i) => acc + (validos[i].tipo === "receita" ? validos[i].valor : -validos[i].valor), 0);

  function alternar(i: number) {
    const novo = new Set(selecionados);
    if (novo.has(i)) novo.delete(i);
    else novo.add(i);
    onSelecionados(novo);
  }

  function alternarDuplicadas(incluir: boolean) {
    const novo = new Set(selecionados);
    duplicadas.forEach((i) => (incluir ? novo.add(i) : novo.delete(i)));
    onSelecionados(novo);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card padding="lg" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted">Prontos para importar</p>
          <p className="text-h2 text-foreground">{total}</p>
          <p className="text-xs text-muted">Efeito no saldo: {liquido >= 0 ? "+" : "−"}{formatarMoeda(Math.abs(liquido))}</p>
        </div>
        <div className="rounded-xl border border-amber-300 p-3 dark:border-amber-700">
          <p className="text-xs text-muted">Possíveis duplicadas</p>
          <p className="text-h2 text-foreground">{duplicadas.size}</p>
          <p className="text-xs text-muted">Já existe lançamento igual nesta carteira.</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted">Linhas descartadas</p>
          <p className="text-h2 text-foreground">{rejeitados.length}</p>
          {rejeitados.length > 0 && (
            <button type="button" onClick={() => setVerRejeitadas((v) => !v)} className="text-xs font-medium text-primary-700 hover:underline dark:text-primary-300">
              {verRejeitadas ? "Esconder motivos" : "Ver motivos"}
            </button>
          )}
        </div>
      </Card>

      {verRejeitadas && rejeitados.length > 0 && (
        <Card padding="lg" className="flex min-w-0 flex-col gap-2">
          <h3 className="text-body font-semibold text-foreground">Linhas que não serão importadas</h3>
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-small">
            {rejeitados.map((r) => (
              <li key={r.linha} className="flex flex-wrap gap-x-2 border-b border-border py-1 last:border-0">
                <span className="font-medium text-foreground">Linha {r.linha}:</span>
                <span className="text-rose-700 dark:text-rose-300">{r.motivo}</span>
                <span className="w-full truncate text-xs text-muted" title={r.conteudo}>
                  {r.conteudo}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padding="lg" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-body font-semibold text-foreground">Lançamentos</h3>
          {duplicadas.size > 0 && (
            <label className="flex items-center gap-2 text-small text-foreground">
              <input type="checkbox" className="h-4 w-4" checked={incluirDuplicadas} onChange={(e) => alternarDuplicadas(e.target.checked)} />
              Incluir também as duplicadas
            </label>
          )}
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {validos.slice(0, visiveis).map((l, i) => {
            const dup = duplicadas.has(i);
            return (
              <li key={i}>
                <label className={cn("flex cursor-pointer items-center gap-3 py-2", !selecionados.has(i) && "opacity-60")}>
                  <input type="checkbox" className="h-4 w-4 shrink-0" checked={selecionados.has(i)} onChange={() => alternar(i)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small font-medium text-foreground" title={l.descricao}>
                      {l.descricao}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      {dataBr(l.data)}
                      {l.categoriaTexto ? <span className="truncate">· {l.categoriaTexto.replace(/^'/, "")}</span> : null}
                      {dup && (
                        <Badge variant="warning" size="sm">
                          Duplicada
                        </Badge>
                      )}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-small font-semibold",
                      l.tipo === "receita" ? "text-primary-700 dark:text-primary-300" : "text-rose-700 dark:text-rose-300"
                    )}
                  >
                    {l.tipo === "receita" ? "+" : "−"}
                    {formatarMoeda(l.valor)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {visiveis < validos.length && (
          <Button type="button" variant="tertiary" size="sm" onClick={() => setVisiveis((v) => v + POR_PAGINA)} className="self-center">
            Mostrar mais ({validos.length - visiveis} restantes)
          </Button>
        )}
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="tertiary" disabled={importando} onClick={onVoltar}>
            <ArrowLeft size={18} /> Voltar ao mapeamento
          </Button>
          <Button type="button" variant="tertiary" disabled={importando} onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
        <Button type="button" size="lg" disabled={total === 0 || importando} onClick={onConfirmar}>
          {importando ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          {importando ? "Importando..." : `Confirmar e importar ${total} ${total === 1 ? "transação" : "transações"}`}
        </Button>
      </div>
    </div>
  );
}
