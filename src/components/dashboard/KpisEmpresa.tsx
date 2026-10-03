"use client";

import * as React from "react";
import { BarChart, Bar, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { Activity, Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatarMoeda, formatarMoedaCompacta } from "@/lib/format";
import type { PontoRitmoDiario, PontoTicketMedio } from "@/lib/data/vendas";

const ESTILO_TOOLTIP = { borderRadius: 12, border: "1px solid rgb(var(--border))", background: "rgb(var(--card))", fontSize: 13 };
const EIXO = { fill: "rgb(var(--muted-foreground))", fontSize: 11 };

/** Diagnóstico em linguagem simples a partir dos indicadores (5.16). */
export function diagnosticar(ticket: PontoTicketMedio[], ritmo: PontoRitmoDiario[]): string[] {
  const frases: string[] = [];
  const comVendas = ticket.filter((t) => t.vendas > 0);
  if (comVendas.length >= 2) {
    const atual = comVendas[comVendas.length - 1];
    const anterior = comVendas[comVendas.length - 2];
    const varTicket = anterior.ticketMedio > 0 ? ((atual.ticketMedio - anterior.ticketMedio) / anterior.ticketMedio) * 100 : 0;
    const varQtd = anterior.vendas > 0 ? ((atual.vendas - anterior.vendas) / anterior.vendas) * 100 : 0;
    if (varTicket < -10 && varQtd > 0) frases.push("Você está vendendo mais vezes, mas cada venda está menor. Vale oferecer combos ou um item a mais no fechamento.");
    else if (varTicket > 10 && varQtd < 0) frases.push("Cada venda está maior, mas o número de vendas caiu. Hora de buscar mais clientes ou reativar os antigos.");
    else if (varTicket > 0 && varQtd > 0) frases.push("Ticket médio e quantidade de vendas subindo juntos. Ótimo sinal, mantenha o ritmo.");
    else if (varTicket < 0 && varQtd < 0) frases.push("Ticket médio e número de vendas caíram em relação ao mês anterior. Revise preços, divulgação e follow-up dos orçamentos.");
  }
  const diasPassados = ritmo.filter((r) => r.dia <= new Date().getDate());
  if (diasPassados.length >= 7) {
    const ultima = diasPassados[diasPassados.length - 1].mediaMovel;
    const semanaAntes = diasPassados[diasPassados.length - 7].mediaMovel;
    if (semanaAntes > 0 && ultima < semanaAntes * 0.8) frases.push("O ritmo diário de vendas desacelerou na última semana.");
    if (semanaAntes > 0 && ultima > semanaAntes * 1.2) frases.push("O ritmo diário de vendas acelerou na última semana.");
  }
  if (frases.length === 0) frases.push("Ainda há poucos dados para um diagnóstico. Continue registrando as vendas.");
  return frases;
}

export function KpisEmpresa({ ticket, ritmo }: { ticket: PontoTicketMedio[]; ritmo: PontoRitmoDiario[] }) {
  const frases = diagnosticar(ticket, ritmo);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-h3 text-foreground">
        <Activity size={18} className="text-accent-700" />
        Indicadores de vendas
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <p className="text-small font-semibold text-foreground">Ticket médio (6 meses)</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ticket} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--border))" />
                <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} />
                <YAxis tick={EIXO} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => formatarMoedaCompacta(Number(v))} />
                <Tooltip
                  formatter={(v: number, _n: string, item: { payload?: PontoTicketMedio }) => [
                    `${formatarMoeda(Number(v))} (${item?.payload?.vendas ?? 0} vendas)`,
                    "Ticket médio",
                  ]}
                  contentStyle={ESTILO_TOOLTIP}
                />
                <Bar dataKey="ticketMedio" fill="#0f766e" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="flex flex-col gap-2">
          <p className="text-small font-semibold text-foreground">Ritmo diário do mês (média móvel 7 dias)</p>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={ritmo} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--border))" />
                <XAxis dataKey="dia" tick={EIXO} tickLine={false} interval={4} />
                <YAxis tick={EIXO} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => formatarMoedaCompacta(Number(v))} />
                <Tooltip
                  formatter={(v: number, nome: string) => [formatarMoeda(Number(v)), nome === "valor" ? "Vendas do dia" : "Média móvel"]}
                  labelFormatter={(d: number) => `Dia ${d}`}
                  contentStyle={ESTILO_TOOLTIP}
                />
                <Bar dataKey="valor" fill="#5eead4" radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Line type="monotone" dataKey="mediaMovel" stroke="#b45309" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card className="flex items-start gap-3 border-amber-200 bg-amber-50/60">
        <Lightbulb size={20} className="mt-0.5 shrink-0 text-amber-700" />
        <div className="flex flex-col gap-1">
          <p className="text-body font-medium text-foreground">Diagnóstico</p>
          {frases.map((f) => (
            <p key={f} className="text-small text-foreground">
              {f}
            </p>
          ))}
        </div>
      </Card>
    </div>
  );
}
