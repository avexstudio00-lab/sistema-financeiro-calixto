"use client";

import * as React from "react";
import Link from "next/link";
import { PieChart as IconePizza, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { TIPO_META } from "@/components/dashboard/InvestimentoCard";
import { calcularValorAtualEstimado } from "@/lib/data/investimentos";
import { formatarMoeda } from "@/lib/format";
import type { Compromisso } from "@/lib/data/compromissos";
import type { CotacoesMercado, Investimento } from "@/lib/data/tipos";

const CORES = ["bg-primary-600", "bg-accent-600", "bg-amber-500", "bg-sky-600", "bg-violet-600", "bg-rose-500", "bg-lime-600", "bg-slate-500", "bg-orange-500"];

/**
 * Bloco de investimentos do Painel pessoal (item 5.11 da especificação de
 * 03/out/2026): total investido hoje, distribuição por classe e os 3
 * próximos recebimentos.
 */
export function ResumoInvestimentosPainel({ investimentos, cotacoes, proximos }: {
  investimentos: Investimento[];
  cotacoes?: CotacoesMercado;
  proximos: Compromisso[];
}) {
  const porClasse = React.useMemo(() => {
    const mapa = new Map<Investimento["tipo"], number>();
    for (const inv of investimentos) {
      if (inv.quitado) continue;
      mapa.set(inv.tipo, (mapa.get(inv.tipo) ?? 0) + calcularValorAtualEstimado(inv, undefined, cotacoes));
    }
    return Array.from(mapa.entries())
      .map(([tipo, valor]) => ({ tipo, rotulo: TIPO_META[tipo]?.label ?? tipo, valor }))
      .filter((c) => c.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }, [investimentos, cotacoes]);
  const total = porClasse.reduce((a, c) => a + c.valor, 0);

  if (investimentos.length === 0) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-h3 text-foreground">
          <IconePizza size={18} className="text-primary-700" />
          Investimentos
        </h2>
        <Link href="/dashboard/investimentos" className="flex items-center gap-1 text-small font-semibold text-primary-700 hover:underline">
          Ver todos
          <ChevronRight size={14} />
        </Link>
      </div>
      <div>
        <p className="text-small text-muted">Total aplicado hoje (estimado)</p>
        <p className="text-h2 text-foreground">{formatarMoeda(total)}</p>
      </div>
      {total > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/10">
            {porClasse.map((c, i) => (
              <div key={c.tipo} className={CORES[i % CORES.length]} style={{ width: `${(c.valor / total) * 100}%` }} title={c.rotulo} />
            ))}
          </div>
          <div className="grid gap-1 sm:grid-cols-2">
            {porClasse.map((c, i) => (
              <p key={c.tipo} className="flex items-center gap-2 text-small text-foreground">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${CORES[i % CORES.length]}`} />
                <span className="truncate">{c.rotulo}</span>
                <span className="ml-auto shrink-0 text-muted">
                  {formatarMoeda(c.valor)} · {((c.valor / total) * 100).toFixed(0)}%
                </span>
              </p>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1 border-t border-border/60 pt-3">
        <p className="text-small font-semibold text-foreground">Próximos recebimentos</p>
        {proximos.length === 0 ? (
          <p className="text-small text-muted">Nenhuma parcela a receber nos próximos 30 dias.</p>
        ) : (
          proximos.slice(0, 3).map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-small">
              <span className="truncate text-foreground">
                {p.titulo}
                <span className={p.atrasado ? "text-rose-700" : "text-muted"}>
                  {" "}
                  · {new Date(p.data + "T00:00:00").toLocaleDateString("pt-BR")}
                  {p.atrasado ? " (atrasada)" : ""}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-foreground">{formatarMoeda(p.valor)}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
