"use client";

import * as React from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from "recharts";
import { AlertTriangle, LineChart as IconeLinha } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatarMoeda, formatarMoedaCompacta } from "@/lib/format";

export interface MovimentoPrevisto {
  /** yyyy-mm-dd */
  data: string;
  /** positivo entra, negativo sai */
  valor: number;
}

export interface PontoProjecao {
  data: string;
  rotulo: string;
  saldo: number;
}

/** Saldo dia a dia nos próximos `dias` dias somando os compromissos
 * previstos. Vencidos (data < hoje) contam no primeiro dia. */
export function projetarSaldo(saldoAtual: number, movimentos: MovimentoPrevisto[], dias = 30): PontoProjecao[] {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const hojeIso = iso(hoje);
  let saldo = saldoAtual + movimentos.filter((m) => m.data < hojeIso).reduce((a, m) => a + m.valor, 0);
  const pontos: PontoProjecao[] = [];
  for (let i = 0; i <= dias; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    const chave = iso(d);
    saldo += movimentos.filter((m) => m.data === chave).reduce((a, m) => a + m.valor, 0);
    pontos.push({ data: chave, rotulo: `${d.getDate()}/${d.getMonth() + 1}`, saldo: Number(saldo.toFixed(2)) });
  }
  return pontos;
}

/**
 * Projeção de liquidez de 30 dias (item 6.5 da especificação de
 * 03/out/2026), com alerta quando o saldo previsto fica negativo.
 */
export function ProjecaoLiquidez({ saldoAtual, movimentos, titulo = "Projeção dos próximos 30 dias" }: {
  saldoAtual: number;
  movimentos: MovimentoPrevisto[];
  titulo?: string;
}) {
  const pontos = React.useMemo(() => projetarSaldo(saldoAtual, movimentos), [saldoAtual, movimentos]);
  const primeiroNegativo = pontos.find((p) => p.saldo < 0);
  const menor = pontos.reduce((m, p) => (p.saldo < m.saldo ? p : m), pontos[0]);
  const final = pontos[pontos.length - 1];

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-h3 text-foreground">
          <IconeLinha size={18} className="text-primary-700" />
          {titulo}
        </h2>
        <p className="text-small text-muted">
          Em 30 dias: <strong className={final.saldo < 0 ? "text-rose-700" : "text-foreground"}>{formatarMoeda(final.saldo)}</strong>
        </p>
      </div>
      {primeiroNegativo && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-700" />
          <p className="text-small text-rose-900">
            Atenção: pelos compromissos lançados, o saldo fica negativo em <strong>{primeiroNegativo.rotulo}</strong>. Menor ponto:{" "}
            <strong>{formatarMoeda(menor.saldo)}</strong> em {menor.rotulo}.
          </p>
        </div>
      )}
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={pontos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--border))" />
            <XAxis dataKey="rotulo" tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11 }} tickLine={false} interval={4} />
            <YAxis
              tick={{ fill: "rgb(var(--muted-foreground))", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => formatarMoedaCompacta(Number(v))}
              width={56}
            />
            <Tooltip
              formatter={(v: number) => [formatarMoeda(Number(v)), "Saldo previsto"]}
              contentStyle={{ borderRadius: 12, border: "1px solid rgb(var(--border))", background: "rgb(var(--card))", fontSize: 13 }}
            />
            <ReferenceLine y={0} stroke="#be123c" strokeDasharray="4 4" />
            <Area type="stepAfter" dataKey="saldo" stroke="#047857" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted">Considera o saldo atual e os compromissos pendentes lançados no sistema.</p>
    </Card>
  );
}
