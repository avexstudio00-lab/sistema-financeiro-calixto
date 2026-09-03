"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Lock,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { gerarResumoMensal, salvarAnaliseMensal, listarHistoricoAnalises, type ResumoMensal } from "@/lib/data/analises";
import { listarTransacoes } from "@/lib/data/transacoes";
import { podeUsarRecurso } from "@/lib/planos";
import type { AnaliseIA, Transacao } from "@/lib/data/tipos";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ResumoMensalPage() {
  const { user, perfil } = useAuth();
  const hoje = new Date();
  const [mes, setMes] = React.useState(hoje.getMonth() + 1);
  const [ano, setAno] = React.useState(hoje.getFullYear());
  const [resumo, setResumo] = React.useState<ResumoMensal | null>(null);
  const [transacoesMes, setTransacoesMes] = React.useState<Transacao[]>([]);
  const [historico, setHistorico] = React.useState<AnaliseIA[]>([]);
  const [carregando, setCarregando] = React.useState(true);

  const temAnaliseIA = perfil ? podeUsarRecurso(perfil.plano, "analiseIA") : false;
  const temAvancado = perfil ? podeUsarRecurso(perfil.plano, "dashboardAvancado") : false;

  React.useEffect(() => {
    if (!user || !perfil || !temAnaliseIA) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    (async () => {
      const res = await gerarResumoMensal(user.id, ano, mes, perfil);
      setResumo(res);
      await salvarAnaliseMensal(user.id, ano, mes, res);
      const hist = await listarHistoricoAnalises(user.id);
      setHistorico(hist);

      const inicio = new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
      const fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
      const trans = await listarTransacoes(user.id, { inicio, fim });
      setTransacoesMes(trans);

      setCarregando(false);
    })();
  }, [user, perfil, ano, mes, temAnaliseIA]);

  function mudarMes(delta: number) {
    let novoMes = mes + delta;
    let novoAno = ano;
    if (novoMes > 12) {
      novoMes = 1;
      novoAno += 1;
    } else if (novoMes < 1) {
      novoMes = 12;
      novoAno -= 1;
    }
    setMes(novoMes);
    setAno(novoAno);
  }

  if (!temAnaliseIA) {
    return (
      <Container className="flex flex-col items-center gap-6 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
          <Lock size={28} />
        </span>
        <div>
          <h1 className="text-h2 text-foreground">A análise de IA é exclusiva dos planos pagos</h1>
          <p className="mx-auto mt-2 max-w-md text-body text-muted">
            Assine um plano pago (Mensal, CLT ou Avançado) para receber, todo mês, um resumo simples
            do que entrou, saiu, sobrou e como isso se compara ao mês anterior.
          </p>
        </div>
        <Link href="/dashboard/plano">
          <Button size="lg">Ver planos</Button>
        </Link>
      </Container>
    );
  }

  // Dados para o dashboard avançado (calculados a partir das transações reais do mês).
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const diasPassados = ano === hoje.getFullYear() && mes === hoje.getMonth() + 1 ? hoje.getDate() : diasNoMes;
  const gastoMedioDiario = resumo && diasPassados > 0 ? resumo.saidas / diasPassados : 0;
  const projecaoFimMes = gastoMedioDiario * diasNoMes;
  const percentualOrcamento = resumo && resumo.entradas > 0 ? (resumo.saidas / resumo.entradas) * 100 : null;

  const porCategoria = new Map<string, number>();
  const porFormaPagamento = new Map<string, number>();
  transacoesMes
    .filter((t) => t.tipo === "despesa" && t.tipo_negocio !== "negocio")
    .forEach((t) => {
      const cat = t.categorias?.nome ?? "Outros";
      porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + Number(t.valor));
      const forma = t.forma_pagamento ?? "outro";
      porFormaPagamento.set(forma, (porFormaPagamento.get(forma) ?? 0) + Number(t.valor));
    });
  const maxCategoria = Math.max(1, ...Array.from(porCategoria.values()));
  const maxForma = Math.max(1, ...Array.from(porFormaPagamento.values()));

  return (
    <Container className="flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 text-foreground">Resumo do mês</h1>
          <p className="text-body text-muted">Sua análise de IA, feita com seus dados reais.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1">
          <button onClick={() => mudarMes(-1)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-muted/10">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-[140px] text-center text-small font-semibold text-foreground">
            {MESES[mes - 1]} {ano}
          </span>
          <button onClick={() => mudarMes(1)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-muted/10">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {carregando || !resumo ? (
        <p className="py-8 text-center text-body text-muted">Analisando seus dados...</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Entradas</p>
              <p className="text-h2 text-primary-500">{formatarMoeda(resumo.entradas)}</p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Saídas</p>
              <p className="text-h2 text-red-500">{formatarMoeda(resumo.saidas)}</p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Sobrou</p>
              <p className="text-h2 text-secondary">{formatarMoeda(resumo.saldo)}</p>
            </Card>
          </div>

          {resumo.variacaoPercentual !== null && (
            <Card className="flex items-center gap-3">
              {resumo.variacaoPercentual > 0 ? (
                <TrendingUp size={20} className="text-red-500" />
              ) : (
                <TrendingDown size={20} className="text-primary-500" />
              )}
              <p className="text-body text-foreground">
                Você gastou{" "}
                <strong>{Math.abs(resumo.variacaoPercentual).toFixed(0)}%</strong>{" "}
                {resumo.variacaoPercentual > 0 ? "a mais" : "a menos"} que no mês anterior.
              </p>
            </Card>
          )}

          {resumo.recomendacoes.length > 0 && (
            <Card className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-primary-600" />
                <h2 className="text-h3 text-foreground">O que a IA notou</h2>
              </div>
              <ul className="flex flex-col gap-2">
                {resumo.recomendacoes.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-body text-muted">
                    <Lightbulb size={16} className="mt-1 shrink-0 text-accent-500" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {resumo.maioresGastos.length > 0 && (
            <Card className="flex flex-col gap-3">
              <h2 className="text-h3 text-foreground">Maiores gastos do mês</h2>
              <ul className="flex flex-col gap-2">
                {resumo.maioresGastos.map((g) => (
                  <li key={g.categoria} className="flex items-center justify-between text-body">
                    <span className="text-foreground">{g.categoria}</span>
                    <span className="font-semibold text-red-500">{formatarMoeda(g.valor)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {!temAvancado && (
            <Card className="flex flex-wrap items-center justify-between gap-4 border-2 border-dashed border-accent-200 bg-accent-50/40">
              <div>
                <p className="text-body font-semibold text-foreground">
                  Quer ver seu dashboard ao vivo, dia a dia?
                </p>
                <p className="text-small text-muted">
                  Os planos CLT e Avançado mostram projeção de fim de mês, gráficos por categoria e sugestões de corte.
                </p>
              </div>
              <Link href="/dashboard/plano">
                <Button variant="secondary">Ver os planos</Button>
              </Link>
            </Card>
          )}

          {temAvancado && (
            <div className="flex flex-col gap-4">
              <h2 className="text-h3 text-foreground">Dashboard avançado</h2>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="flex flex-col gap-1">
                  <p className="text-small text-muted">Gasto médio por dia</p>
                  <p className="text-h3 text-foreground">{formatarMoeda(gastoMedioDiario)}</p>
                </Card>
                <Card className="flex flex-col gap-1">
                  <p className="text-small text-muted">Projeção de saídas até o fim do mês</p>
                  <p className="text-h3 text-foreground">{formatarMoeda(projecaoFimMes)}</p>
                </Card>
                <Card className="flex flex-col gap-1">
                  <p className="text-small text-muted">% das entradas já comprometido</p>
                  <p className="text-h3 text-foreground">
                    {percentualOrcamento !== null ? `${percentualOrcamento.toFixed(0)}%` : "—"}
                  </p>
                </Card>
              </div>

              {porCategoria.size > 0 && (
                <Card className="flex flex-col gap-4">
                  <h3 className="text-h3 text-foreground">Gastos por categoria</h3>
                  <div className="flex flex-col gap-3">
                    {Array.from(porCategoria.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([nome, valor]) => (
                        <div key={nome} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-small">
                            <span className="text-foreground">{nome}</span>
                            <span className="font-medium text-muted">{formatarMoeda(valor)}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted/15">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-primary-500 to-accent-400"
                              style={{ width: `${(valor / maxCategoria) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </Card>
              )}

              {porFormaPagamento.size > 0 && (
                <Card className="flex flex-col gap-4">
                  <h3 className="text-h3 text-foreground">Gastos por forma de pagamento</h3>
                  <div className="flex flex-col gap-3">
                    {Array.from(porFormaPagamento.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([nome, valor]) => (
                        <div key={nome} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-small">
                            <span className="capitalize text-foreground">{nome}</span>
                            <span className="font-medium text-muted">{formatarMoeda(valor)}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted/15">
                            <div
                              className="h-2 rounded-full bg-accent-500"
                              style={{ width: `${(valor / maxForma) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {historico.length > 1 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-h3 text-foreground">Meses anteriores</h2>
          <div className="flex flex-col gap-2">
            {historico
              .filter((h) => !(h.mes === mes && h.ano === ano))
              .slice(0, 6)
              .map((h) => (
                <Card key={h.id} padding="sm" className="flex items-center justify-between">
                  <p className="text-body text-foreground">
                    {MESES[h.mes - 1]} {h.ano}
                  </p>
                  <p className={`text-body font-semibold ${h.saldo >= 0 ? "text-primary-600" : "text-red-500"}`}>
                    {formatarMoeda(h.saldo)}
                  </p>
                </Card>
              ))}
            </div>
        </div>
      )}
    </Container>
  );
}
