"use client";

// Movido de src/app/dashboard/meu-relatorio/page.tsx pra ser usado também em
// /dashboard/empresa/relatorio (o menu da empresa continua aberto lá).

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2, Info, Lock, TriangleAlert } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { podeAcessarNegocio } from "@/lib/planos";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { frequenciaRelatorio, periodoDaChave, periodosDisponiveis, type PeriodoRelatorio } from "@/lib/relatorio/periodo";
import { carregarDadosRelatorio, montarRelatorio, type Relatorio, type SecaoRelatorio } from "@/lib/data/relatorioInteligente";

/**
 * "Meu relatório" (09/nov/2026): relatório explicado do período, com Minha
 * vida, Investimentos e Minha empresa. É a página que a notificação push
 * "Seu relatório está pronto" abre — mensal a partir do plano Completo,
 * quinzenal a partir do Avançado (ver src/lib/relatorio/periodo.ts).
 */
export function RelatorioView({ escopoFixo }: { escopoFixo?: "empresa" }) {
  return (
    <React.Suspense fallback={null}>
      <ConteudoRelatorio escopoFixo={escopoFixo} />
    </React.Suspense>
  );
}

function ConteudoRelatorio({ escopoFixo }: { escopoFixo?: "empresa" }) {
  const { user, perfil, negocio, papel } = useAuth();
  const params = useSearchParams();
  const comEmpresa = !!negocio && podeAcessarNegocio(negocio.plano) && papel !== "funcionario";
  const planoEfetivo = comEmpresa && negocio ? negocio.plano : perfil?.plano;
  const frequencia = frequenciaRelatorio(planoEfetivo);
  const opcoes = React.useMemo(() => periodosDisponiveis(new Date(), frequencia), [frequencia]);
  const [chave, setChave] = React.useState<string | null>(null);
  const periodo: PeriodoRelatorio | null = periodoDaChave(chave ?? params.get("p")) ?? opcoes[0] ?? null;
  const escopo = escopoFixo ?? params.get("escopo");

  const [relatorio, setRelatorio] = React.useState<Relatorio | null>(null);
  const [carregando, setCarregando] = React.useState(true);

  React.useEffect(() => {
    if (!user || !periodo || !frequencia) return;
    let cancelado = false;
    setCarregando(true);
    carregarDadosRelatorio(user.id, periodo, comEmpresa && negocio ? negocio.usuarioId : null).then((dados) => {
      if (cancelado) return;
      setRelatorio(montarRelatorio(dados, periodo));
      setCarregando(false);
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, periodo?.chave, frequencia, comEmpresa, negocio?.usuarioId]);

  if (!perfil) return null;

  if (!frequencia) {
    return (
      <Container className="flex flex-col items-center gap-6 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
          <Lock size={28} />
        </span>
        <div>
          <h1 className="text-h2 text-foreground">Relatório explicado a partir do plano Completo</h1>
          <p className="mx-auto mt-2 max-w-md text-body text-muted">
            Todo mês (ou a cada 15 dias no Avançado) chega uma notificação com o seu relatório: quanto entrou, onde dá pra
            economizar, quanto seus investimentos renderam e como foram as vendas da empresa.
          </p>
        </div>
        <Link href="/dashboard/plano">
          <Button size="lg">Ver planos</Button>
        </Link>
      </Container>
    );
  }

  const secoes: SecaoRelatorio[] = relatorio
    ? escopo === "empresa" && relatorio.empresa
      ? [relatorio.empresa]
      : ([relatorio.vida, relatorio.investimentos, relatorio.empresa].filter(Boolean) as SecaoRelatorio[])
    : [];

  return (
    <Container full className="flex flex-col gap-6 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-h2 text-foreground">{escopo === "empresa" ? "Relatório da empresa" : "Meu relatório"}</h1>
          <p className="text-body text-muted">
            {periodo ? `${periodo.rotulo.charAt(0).toUpperCase()}${periodo.rotulo.slice(1)}` : ""} · comparado com {periodo?.anterior.rotulo}.
            {frequencia === "quinzenal" ? " Chega a cada 15 dias." : " Chega todo mês."}
          </p>
        </div>
        <select
          value={periodo?.chave ?? ""}
          onChange={(e) => setChave(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-small text-foreground sm:w-auto"
          aria-label="Período do relatório"
        >
          {opcoes.map((o) => (
            <option key={o.chave} value={o.chave}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </div>

      <Card className="flex flex-col gap-3 border-primary-200 bg-primary-50/60 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-small text-foreground">
          Faltou lançar alguma coisa? Jogue o extrato do banco ou a fatura do cartão dos últimos dias — o app lança tudo sozinho e o
          relatório fica completo.
        </p>
        <Link href={escopo === "empresa" ? "/dashboard/importar?mundo=negocio" : "/dashboard/importar"} className="shrink-0">
          <Button size="sm">Importar extrato</Button>
        </Link>
      </Card>

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Montando seu relatório...</p>
      ) : (
        secoes.map((s) => (
          <Card key={s.titulo} padding="lg" className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <BarChart3 size={18} />
              </span>
              <h2 className="text-h3 text-foreground">{s.titulo}</h2>
            </div>
            {s.numeros.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {s.numeros.map((n) => {
                  const ruim = n.variacao != null && (n.subirEhRuim ? n.variacao > 0 : n.variacao < 0);
                  return (
                    <div key={n.rotulo} className="min-w-0 rounded-xl bg-muted/5 p-3">
                      <p className="text-xs text-muted">{n.rotulo}</p>
                      <p className="break-words text-body font-semibold text-foreground">{formatarMoeda(n.valor)}</p>
                      {n.variacao != null && (
                        <p className={cn("flex items-center gap-0.5 text-xs font-medium", ruim ? "text-rose-600" : "text-primary-600")}>
                          {n.variacao >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          {Math.abs(n.variacao).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {s.insights.map((i, idx) => (
                <li key={idx} className="flex items-start gap-2 text-small text-foreground">
                  {i.tom === "bom" ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-primary-600" />
                  ) : i.tom === "atencao" ? (
                    <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  ) : (
                    <Info size={16} className="mt-0.5 shrink-0 text-muted" />
                  )}
                  <span className="min-w-0">{i.texto}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
      <p className="text-xs text-muted">
        Transferências entre suas carteiras, aplicar/resgatar investimento e empréstimo pego não contam como entrada nem saída.
        Ative as notificações em Meu perfil → Segurança pra receber o aviso quando o relatório ficar pronto.
      </p>
    </Container>
  );
}
