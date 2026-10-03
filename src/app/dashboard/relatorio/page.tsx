"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarTransacoes } from "@/lib/data/transacoes";
import { listarMetas } from "@/lib/data/metas";
import { listarLimites } from "@/lib/data/limitesCategoria";
import { listarDividasComProgresso } from "@/lib/data/dividas";
import { listarInvestimentos, calcularValorAtualEstimado } from "@/lib/data/investimentos";
import { listarContas } from "@/lib/data/contas";
import { gerarResumoEmpresa, type ResumoEmpresa } from "@/lib/data/empresa";
import { TIPO_META } from "@/components/dashboard/InvestimentoCard";
import { formatarMoeda, NOMES_MES } from "@/lib/format";
import type { Conta, DividaComProgresso, Investimento, LimiteCategoria, Meta, Transacao } from "@/lib/data/tipos";

interface DadosRelatorio {
  transacoes: Transacao[];
  metas: Meta[];
  limites: LimiteCategoria[];
  dividas: DividaComProgresso[];
  investimentos: Investimento[];
  contas: Conta[];
  empresa: ResumoEmpresa | null;
}

/**
 * Relatório mensal para baixar em PDF (item 6.9 da especificação de
 * 03/out/2026). Sem biblioteca nova: a página é montada para impressão e o
 * botão usa a impressão do navegador ("Salvar como PDF").
 */
export default function RelatorioMensalPage() {
  const { user, perfil, negocio, podeAcessarMinhaEmpresa, papel } = useAuth();
  const hoje = new Date();
  const [mes, setMes] = React.useState(hoje.getMonth() + 1);
  const [ano, setAno] = React.useState(hoje.getFullYear());
  const [dados, setDados] = React.useState<DadosRelatorio | null>(null);

  React.useEffect(() => {
    if (!user) return;
    setDados(null);
    const inicio = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
    const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
    const incluiEmpresa = podeAcessarMinhaEmpresa && negocio && papel !== "funcionario";
    (async () => {
      const [transacoes, metas, limites, dividas, investimentos, contas, empresa] = await Promise.all([
        listarTransacoes(user.id, { inicio, fim }),
        listarMetas(user.id),
        listarLimites(user.id),
        listarDividasComProgresso(user.id),
        listarInvestimentos(user.id),
        listarContas(user.id),
        incluiEmpresa ? gerarResumoEmpresa(negocio.usuarioId, ano, mes) : Promise.resolve(null),
      ]);
      setDados({ transacoes, metas, limites, dividas, investimentos, contas, empresa });
    })();
  }, [user, ano, mes, negocio, podeAcessarMinhaEmpresa, papel]);

  function mudarMes(delta: number) {
    const d = new Date(ano, mes - 1 + delta, 1);
    setMes(d.getMonth() + 1);
    setAno(d.getFullYear());
  }

  const pessoais = (dados?.transacoes ?? []).filter((t) => t.tipo_negocio !== "negocio");
  const entradas = pessoais.filter((t) => t.tipo === "receita").reduce((a, t) => a + Number(t.valor), 0);
  const saidas = pessoais.filter((t) => t.tipo === "despesa").reduce((a, t) => a + Number(t.valor), 0);
  const porCategoria = new Map<string, { nome: string; valor: number }>();
  for (const t of pessoais.filter((x) => x.tipo === "despesa")) {
    const chave = t.categoria_id ?? "sem";
    const atual = porCategoria.get(chave) ?? { nome: t.categorias?.nome ?? "Sem categoria", valor: 0 };
    atual.valor += Number(t.valor);
    porCategoria.set(chave, atual);
  }
  const categorias = Array.from(porCategoria.entries()).sort((a, b) => b[1].valor - a[1].valor);
  const maioresGastos = pessoais.filter((t) => t.tipo === "despesa").sort((a, b) => Number(b.valor) - Number(a.valor)).slice(0, 10);
  const totalContas = (dados?.contas ?? []).filter((c) => c.tipo !== "cartao_credito").reduce((a, c) => a + Number(c.saldo_atual), 0);
  const investimentosAtivos = (dados?.investimentos ?? []).filter((i) => !i.quitado);
  const totalInvestido = investimentosAtivos.reduce((a, i) => a + calcularValorAtualEstimado(i), 0);
  const dividasAbertas = (dados?.dividas ?? []).filter((d) => !d.quitada);
  const totalDividas = dividasAbertas.reduce((a, d) => a + Number(d.valor_restante), 0);
  const limitePorCategoria = new Map((dados?.limites ?? []).map((l) => [l.categoria_id, Number(l.limite_mensal)]));

  const th = "border-b border-border py-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-muted";
  const td = "border-b border-border/60 py-2 pr-3 text-small text-foreground";

  return (
    <Container full className="flex flex-col gap-6 py-8 print:gap-4 print:py-0">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Relatório mensal</h1>
          <p className="text-body text-muted">
            {perfil?.nome} · {NOMES_MES[mes - 1]} de {ano}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1">
            <button onClick={() => mudarMes(-1)} aria-label="Mês anterior" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-muted/10">
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-[130px] text-center text-small font-semibold text-foreground">
              {NOMES_MES[mes - 1]} {ano}
            </span>
            <button onClick={() => mudarMes(1)} aria-label="Próximo mês" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-muted/10">
              <ChevronRight size={18} />
            </button>
          </div>
          <Button onClick={() => window.print()} disabled={!dados}>
            <Printer size={16} />
            Baixar PDF
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted print:hidden">
        Dica: na janela que abrir, escolha &quot;Salvar como PDF&quot; como destino.
      </p>

      {!dados ? (
        <p className="py-8 text-center text-body text-muted">Montando relatório...</p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3 print:grid-cols-3">
            <Card className="flex flex-col gap-1 print:shadow-none">
              <p className="text-small text-muted">Entradas</p>
              <p className="text-h3 text-accent-700">{formatarMoeda(entradas)}</p>
            </Card>
            <Card className="flex flex-col gap-1 print:shadow-none">
              <p className="text-small text-muted">Saídas</p>
              <p className="text-h3 text-rose-700">{formatarMoeda(saidas)}</p>
            </Card>
            <Card className="flex flex-col gap-1 print:shadow-none">
              <p className="text-small text-muted">Sobrou</p>
              <p className={`text-h3 ${entradas - saidas >= 0 ? "text-foreground" : "text-rose-700"}`}>{formatarMoeda(entradas - saidas)}</p>
            </Card>
          </section>

          <section className="grid gap-4 sm:grid-cols-3 print:grid-cols-3">
            <Card className="flex flex-col gap-1 print:shadow-none">
              <p className="text-small text-muted">Saldo nas carteiras (hoje)</p>
              <p className="text-h3 text-foreground">{formatarMoeda(totalContas)}</p>
            </Card>
            <Card className="flex flex-col gap-1 print:shadow-none">
              <p className="text-small text-muted">Investido (estimado hoje)</p>
              <p className="text-h3 text-foreground">{formatarMoeda(totalInvestido)}</p>
            </Card>
            <Card className="flex flex-col gap-1 print:shadow-none">
              <p className="text-small text-muted">Dívidas em aberto</p>
              <p className="text-h3 text-foreground">{formatarMoeda(totalDividas)}</p>
            </Card>
          </section>

          <Card className="flex flex-col gap-2 print:break-inside-avoid print:shadow-none">
            <h2 className="text-h3 text-foreground">Gastos por categoria</h2>
            {categorias.length === 0 ? (
              <p className="text-small text-muted">Nenhum gasto no mês.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead>
                    <tr>
                      <th className={th}>Categoria</th>
                      <th className={th}>Gasto</th>
                      <th className={th}>% do total</th>
                      <th className={th}>Limite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categorias.map(([id, c]) => {
                      const limite = limitePorCategoria.get(id);
                      return (
                        <tr key={id}>
                          <td className={td}>{c.nome}</td>
                          <td className={td}>{formatarMoeda(c.valor)}</td>
                          <td className={td}>{saidas > 0 ? ((c.valor / saidas) * 100).toFixed(1) : "0"}%</td>
                          <td className={td}>
                            {limite ? `${formatarMoeda(limite)} (${Math.round((c.valor / limite) * 100)}%)` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-2 print:break-inside-avoid print:shadow-none">
            <h2 className="text-h3 text-foreground">Maiores gastos do mês</h2>
            {maioresGastos.length === 0 ? (
              <p className="text-small text-muted">Nenhum gasto no mês.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead>
                    <tr>
                      <th className={th}>Data</th>
                      <th className={th}>Descrição</th>
                      <th className={th}>Categoria</th>
                      <th className={th}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maioresGastos.map((t) => (
                      <tr key={t.id}>
                        <td className={td}>{new Date(t.data + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                        <td className={td}>{t.descricao}</td>
                        <td className={td}>{t.categorias?.nome ?? "—"}</td>
                        <td className={td}>{formatarMoeda(Number(t.valor))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
            <Card className="flex flex-col gap-2 print:break-inside-avoid print:shadow-none">
              <h2 className="text-h3 text-foreground">Metas</h2>
              {dados.metas.length === 0 ? (
                <p className="text-small text-muted">Nenhuma meta cadastrada.</p>
              ) : (
                dados.metas.map((m) => {
                  const pct = Number(m.valor_meta) > 0 ? Math.min(100, (Number(m.valor_atual) / Number(m.valor_meta)) * 100) : 0;
                  return (
                    <div key={m.id} className="flex items-center justify-between gap-2 text-small">
                      <span className="truncate text-foreground">{m.nome}</span>
                      <span className="shrink-0 text-muted">
                        {formatarMoeda(Number(m.valor_atual))} de {formatarMoeda(Number(m.valor_meta))} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                  );
                })
              )}
            </Card>
            <Card className="flex flex-col gap-2 print:break-inside-avoid print:shadow-none">
              <h2 className="text-h3 text-foreground">Investimentos por classe</h2>
              {investimentosAtivos.length === 0 ? (
                <p className="text-small text-muted">Nenhum investimento ativo.</p>
              ) : (
                Object.entries(
                  investimentosAtivos.reduce<Record<string, number>>((acc, i) => {
                    const rotulo = TIPO_META[i.tipo]?.label ?? i.tipo;
                    acc[rotulo] = (acc[rotulo] ?? 0) + calcularValorAtualEstimado(i);
                    return acc;
                  }, {})
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([rotulo, valor]) => (
                    <div key={rotulo} className="flex items-center justify-between gap-2 text-small">
                      <span className="text-foreground">{rotulo}</span>
                      <span className="text-muted">
                        {formatarMoeda(valor)} · {totalInvestido > 0 ? ((valor / totalInvestido) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  ))
              )}
            </Card>
          </div>

          {dividasAbertas.length > 0 && (
            <Card className="flex flex-col gap-2 print:break-inside-avoid print:shadow-none">
              <h2 className="text-h3 text-foreground">Dívidas em aberto</h2>
              {dividasAbertas.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 text-small">
                  <span className="text-foreground">{d.nome}</span>
                  <span className="text-muted">
                    Falta {formatarMoeda(Number(d.valor_restante))} de {formatarMoeda(Number(d.valor_total))}
                  </span>
                </div>
              ))}
            </Card>
          )}

          {dados.empresa && (
            <Card className="flex flex-col gap-2 print:break-inside-avoid print:shadow-none">
              <h2 className="text-h3 text-foreground">Empresa no mês</h2>
              <div className="grid gap-2 text-small sm:grid-cols-4 print:grid-cols-4">
                <p className="text-muted">Faturamento: <strong className="text-foreground">{formatarMoeda(dados.empresa.faturamento)}</strong></p>
                <p className="text-muted">Custos: <strong className="text-foreground">{formatarMoeda(dados.empresa.custos)}</strong></p>
                <p className="text-muted">Lucro real: <strong className="text-foreground">{formatarMoeda(dados.empresa.lucroReal)}</strong></p>
                <p className="text-muted">Saldo acumulado: <strong className="text-foreground">{formatarMoeda(dados.empresa.saldoAcumulado)}</strong></p>
              </div>
            </Card>
          )}

          <p className="text-xs text-muted">Gerado em {new Date().toLocaleString("pt-BR")} · Meu Controle</p>
        </>
      )}
    </Container>
  );
}
