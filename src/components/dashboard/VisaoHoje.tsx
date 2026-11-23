"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, ArrowUpCircle, ArrowDownCircle, CheckCircle2, ChevronDown } from "lucide-react";
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
  /** Já recebido/pago hoje: aparece riscado, fora dos totais. */
  quitado?: boolean;
}

/**
 * "Visão Hoje" (item 6.4 da especificação de 03/out/2026): tudo que vence
 * hoje (e o que já passou do prazo) em um só card, com o líquido do dia.
 */
export function VisaoHoje({ itens, cor = "primary" }: { itens: ItemHoje[]; cor?: "primary" | "accent" }) {
  const abertos = itens.filter((i) => !i.quitado);
  const entradas = abertos.filter((i) => i.sentido === "entrada").reduce((a, i) => a + i.valor, 0);
  const saidas = abertos.filter((i) => i.sentido === "saida").reduce((a, i) => a + i.valor, 0);
  // O que já foi recebido/pago hoje sai da lista principal (23/nov/2026: "pra
  // não ficar poluído") — fica só uma linha "✓ N já recebidos hoje" que abre
  // se tocar, pra não parecer que sumiu por erro (motivo do item 5.1).
  const quitados = itens.filter((i) => i.quitado);
  const [verQuitados, setVerQuitados] = React.useState(false);
  // Mostra 8 e deixa abrir o resto (antes o "+ N itens" não abria nada e
  // escondia o que passasse disso — 09/nov/2026).
  const [todos, setTodos] = React.useState(false);
  const visiveis = todos ? abertos : abertos.slice(0, 8);

  function linha(i: ItemHoje) {
    const conteudo = (
      <div className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-muted/5">
        <div className="flex min-w-0 items-center gap-2">
          {i.sentido === "entrada" ? (
            <ArrowUpCircle size={16} className="shrink-0 text-accent-700" />
          ) : (
            <ArrowDownCircle size={16} className="shrink-0 text-rose-700" />
          )}
          <span className={i.quitado ? "truncate text-small text-muted line-through" : "truncate text-small text-foreground"}>{i.titulo}</span>
          {i.quitado && (
            <Badge variant="primary" size="sm">
              {i.sentido === "entrada" ? "Recebido" : "Pago"}
            </Badge>
          )}
          {i.atrasado && !i.quitado && (
            <Badge variant="danger" size="sm">
              Atrasado
            </Badge>
          )}
        </div>
        <span className={i.quitado ? "shrink-0 text-small text-muted" : "shrink-0 text-small font-semibold text-foreground"}>{formatarMoeda(i.valor)}</span>
      </div>
    );
    return i.href ? (
      <Link key={i.id} href={i.href}>
        {conteudo}
      </Link>
    ) : (
      <div key={i.id}>{conteudo}</div>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-h3 text-foreground">
          <CalendarCheck size={18} className={cor === "accent" ? "text-accent-700" : "text-primary-700"} />
          Visão de hoje
        </h2>
        {abertos.length > 0 && (
          <p className="text-small text-muted">
            Entra <strong className="text-accent-700">{formatarMoeda(entradas)}</strong> · sai{" "}
            <strong className="text-rose-700">{formatarMoeda(saidas)}</strong>
          </p>
        )}
      </div>
      {abertos.length === 0 && quitados.length === 0 ? (
        <p className="text-small text-muted">Nada vencendo hoje. Dia tranquilo.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {abertos.length === 0 && <p className="px-2 py-1 text-small text-muted">Tudo de hoje já foi resolvido.</p>}
          {visiveis.map(linha)}
          {abertos.length > 8 && (
            <button
              type="button"
              onClick={() => setTodos((v) => !v)}
              className="self-start rounded-lg px-2 py-1 text-xs font-medium text-primary-700 hover:bg-muted/10 dark:text-primary-300"
            >
              {todos ? "Mostrar menos" : `Ver mais ${abertos.length - 8} ${abertos.length - 8 === 1 ? "item" : "itens"}`}
            </button>
          )}
          {quitados.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setVerQuitados((v) => !v)}
                className="flex items-center gap-1.5 self-start rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-muted/10"
              >
                <CheckCircle2 size={14} className="text-accent-700" />
                {quitados.length} {quitados.length === 1 ? "já resolvido" : "já resolvidos"} hoje
                <ChevronDown size={14} className={verQuitados ? "rotate-180 transition-transform" : "transition-transform"} />
              </button>
              {verQuitados && quitados.map(linha)}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
