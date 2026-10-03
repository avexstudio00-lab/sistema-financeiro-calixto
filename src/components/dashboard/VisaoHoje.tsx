"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatarMoeda } from "@/lib/format";

export interface ItemHoje {
  id: string;
  titulo: string;
  valor: number;
  /** entrada = vai entrar dinheiro; saida = vai sair. */
  sentido: "entrada" | "saida";
  atrasado?: boolean;
  href?: string;
}

/**
 * "Visão Hoje" (item 6.4 da especificação de 03/out/2026): tudo que vence
 * hoje (e o que já passou do prazo) em um só card, com o líquido do dia.
 */
export function VisaoHoje({ itens, cor = "primary" }: { itens: ItemHoje[]; cor?: "primary" | "accent" }) {
  const entradas = itens.filter((i) => i.sentido === "entrada").reduce((a, i) => a + i.valor, 0);
  const saidas = itens.filter((i) => i.sentido === "saida").reduce((a, i) => a + i.valor, 0);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-h3 text-foreground">
          <CalendarCheck size={18} className={cor === "accent" ? "text-accent-700" : "text-primary-700"} />
          Visão de hoje
        </h2>
        {itens.length > 0 && (
          <p className="text-small text-muted">
            Entra <strong className="text-accent-700">{formatarMoeda(entradas)}</strong> · sai{" "}
            <strong className="text-rose-700">{formatarMoeda(saidas)}</strong>
          </p>
        )}
      </div>
      {itens.length === 0 ? (
        <p className="text-small text-muted">Nada vencendo hoje. Dia tranquilo.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {itens.slice(0, 8).map((i) => {
            const conteudo = (
              <div className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-muted/5">
                <div className="flex min-w-0 items-center gap-2">
                  {i.sentido === "entrada" ? (
                    <ArrowUpCircle size={16} className="shrink-0 text-accent-700" />
                  ) : (
                    <ArrowDownCircle size={16} className="shrink-0 text-rose-700" />
                  )}
                  <span className="truncate text-small text-foreground">{i.titulo}</span>
                  {i.atrasado && (
                    <Badge variant="danger" size="sm">
                      Atrasado
                    </Badge>
                  )}
                </div>
                <span className="shrink-0 text-small font-semibold text-foreground">{formatarMoeda(i.valor)}</span>
              </div>
            );
            return i.href ? (
              <Link key={i.id} href={i.href}>
                {conteudo}
              </Link>
            ) : (
              <div key={i.id}>{conteudo}</div>
            );
          })}
          {itens.length > 8 && <p className="px-2 text-xs text-muted">+ {itens.length - 8} item(ns)</p>}
        </div>
      )}
    </Card>
  );
}
