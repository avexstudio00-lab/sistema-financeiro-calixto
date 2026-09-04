"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  AlertTriangle,
  PackageX,
  Receipt,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { gerarResumoEmpresa, type ResumoEmpresa } from "@/lib/data/empresa";
import { listarTransacoes } from "@/lib/data/transacoes";
import { listarProdutos, estoqueBaixo } from "@/lib/data/produtos";
import { listarContasPagar, listarContasReceber } from "@/lib/data/contasEmpresa";
import { formatarMoeda } from "@/lib/format";
import { NovaTransacaoModal } from "@/components/dashboard/NovaTransacaoModal";
import type { Transacao, Produto, ContaPagar, ContaReceber } from "@/lib/data/tipos";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function emBreveOuAtrasada(item: { vencimento: string; status: string }, dias = 7): boolean {
  if (item.status !== "pendente") return false;
  const hoje = new Date();
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const limite = new Date(hojeSemHora);
  limite.setDate(limite.getDate() + dias);
  const vencimento = new Date(item.vencimento + "T00:00:00");
  return vencimento <= limite;
}

export default function PainelEmpresaPage() {
  const { user, perfil } = useAuth();
  const hoje = new Date();
  const [mes, setMes] = React.useState(hoje.getMonth() + 1);
  const [ano, setAno] = React.useState(hoje.getFullYear());
  const [resumo, setResumo] = React.useState<ResumoEmpresa | null>(null);
  const [lancamentos, setLancamentos] = React.useState<Transacao[]>([]);
  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [contasPagar, setContasPagar] = React.useState<ContaPagar[]>([]);
  const [contasReceber, setContasReceber] = React.useState<ContaReceber[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [modalAberto, setModalAberto] = React.useState(false);

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    const inicio = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
    const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
    const [res, lista, listaProdutos, listaPagar, listaReceber] = await Promise.all([
      gerarResumoEmpresa(user.id, ano, mes),
      listarTransacoes(user.id, { inicio, fim }),
      listarProdutos(user.id),
      listarContasPagar(user.id),
      listarContasReceber(user.id),
    ]);
    setResumo(res);
    setLancamentos(lista.filter((t) => t.tipo_negocio === "negocio").slice(0, 8));
    setProdutos(listaProdutos);
    setContasPagar(listaPagar);
    setContasReceber(listaReceber);
    setCarregando(false);
  }, [user, ano, mes]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

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

  const produtosBaixos = produtos.filter((p) => p.ativo && estoqueBaixo(p));
  const contasUrgentes = [
    ...contasPagar.filter((c) => emBreveOuAtrasada(c)).map((c) => ({ ...c, tipo: "pagar" as const })),
    ...contasReceber.filter((c) => emBreveOuAtrasada(c)).map((c) => ({ ...c, tipo: "receber" as const })),
  ];

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 text-foreground">Painel da empresa</h1>
          <p className="text-body text-muted">Como está indo o seu negócio, {perfil?.nome.split(" ")[0]}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1">
            <button onClick={() => mudarMes(-1)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-muted/10">
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-[120px] text-center text-small font-semibold text-foreground">
              {MESES[mes - 1]} {ano}
            </span>
            <button onClick={() => mudarMes(1)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-muted/10">
              <ChevronRight size={18} />
            </button>
          </div>
          <Button size="lg" variant="secondary" onClick={() => setModalAberto(true)} className="hidden sm:inline-flex">
            <Plus size={18} />
            Anotar gasto ou receita
          </Button>
        </div>
      </div>

      <Card className="flex items-start gap-3 border-primary-200 bg-primary-50/60">
        <Receipt size={20} className="mt-0.5 shrink-0 text-primary-600" />
        <div className="flex flex-col gap-1">
          <p className="text-body font-medium text-foreground">Precisa emitir nota fiscal?</p>
          <p className="text-small text-muted">
            A gente ainda não emite nota fiscal por aqui. Pra serviços, use o Emissor Nacional gratuito do
            governo; pra produtos, a nota é emitida pela Sefaz do seu estado.
          </p>
          <a
            href="https://www.nfse.gov.br/EmissorNacional"
            target="_blank"
            rel="noopener noreferrer"
            className="text-small font-medium text-accent-700 hover:underline"
          >
            Abrir o Emissor Nacional de NFS-e ↗
          </a>
        </div>
      </Card>

      {carregando || !resumo ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Faturamento</p>
              <p className="text-h2 text-accent-600">{formatarMoeda(resumo.faturamento)}</p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Custos</p>
              <p className="text-h2 text-red-500">{formatarMoeda(resumo.custos)}</p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Lucro real</p>
              <p className={`text-h2 ${resumo.lucroReal >= 0 ? "text-primary-500" : "text-red-500"}`}>
                {formatarMoeda(resumo.lucroReal)}
              </p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Saldo acumulado da empresa</p>
              <p className="text-h2 text-secondary">{formatarMoeda(resumo.saldoAcumulado)}</p>
            </Card>
          </div>

          {(resumo.variacaoFaturamento !== null || resumo.variacaoCustos !== null) && (
            <Card className="flex flex-col gap-2">
              {resumo.variacaoFaturamento !== null && (
                <div className="flex items-center gap-3">
                  {resumo.variacaoFaturamento >= 0 ? (
                    <TrendingUp size={20} className="text-accent-600" />
                  ) : (
                    <TrendingDown size={20} className="text-red-500" />
                  )}
                  <p className="text-body text-foreground">
                    Você vendeu <strong>{Math.abs(resumo.variacaoFaturamento).toFixed(0)}%</strong>{" "}
                    {resumo.variacaoFaturamento >= 0 ? "a mais" : "a menos"} que no mês passado
                    {resumo.variacaoCustos !== null && (
                      <>
                        , e gastou <strong>{Math.abs(resumo.variacaoCustos).toFixed(0)}%</strong>{" "}
                        {resumo.variacaoCustos >= 0 ? "a mais" : "a menos"}.
                      </>
                    )}
                  </p>
                </div>
              )}
            </Card>
          )}

          {(produtosBaixos.length > 0 || contasUrgentes.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {produtosBaixos.length > 0 && (
                <Card className="flex items-start gap-3 border-amber-200 bg-amber-50/60">
                  <PackageX size={20} className="mt-0.5 shrink-0 text-amber-600" />
                  <div className="flex flex-col gap-1">
                    <p className="text-body font-medium text-foreground">
                      {produtosBaixos.length} produto{produtosBaixos.length > 1 ? "s" : ""} com estoque baixo
                    </p>
                    <p className="text-small text-muted">{produtosBaixos.map((p) => p.nome).join(", ")}</p>
                    <Link href="/dashboard/empresa/produtos" className="text-small font-medium text-accent-700 hover:underline">
                      Ver estoque
                    </Link>
                  </div>
                </Card>
              )}
              {contasUrgentes.length > 0 && (
                <Card className="flex items-start gap-3 border-rose-200 bg-rose-50/60">
                  <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-500" />
                  <div className="flex flex-col gap-1">
                    <p className="text-body font-medium text-foreground">
                      {contasUrgentes.length} conta{contasUrgentes.length > 1 ? "s" : ""} vencendo ou atrasada{contasUrgentes.length > 1 ? "s" : ""}
                    </p>
                    <p className="text-small text-muted">Nos próximos 7 dias, entre a pagar e a receber.</p>
                    <Link href="/dashboard/empresa/contas" className="text-small font-medium text-accent-700 hover:underline">
                      Ver contas
                    </Link>
                  </div>
                </Card>
              )}
            </div>
          )}

          <div className="flex flex-col gap-4">
            <h2 className="text-h3 text-foreground">Lançamentos do negócio</h2>
            {lancamentos.length === 0 ? (
              <Card className="flex flex-col items-center gap-3 py-12 text-center">
                <p className="text-body text-muted">
                  Nenhum lançamento do negócio esse mês ainda. Registre uma venda ou anote um gasto pra começar.
                </p>
                <Button variant="secondary" onClick={() => setModalAberto(true)}>
                  <Plus size={18} />
                  Anotar agora
                </Button>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {lancamentos.map((t) => (
                  <Card key={t.id} padding="sm" className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                          t.tipo === "receita" ? "bg-accent-50 text-accent-600" : "bg-rose-50 text-red-500"
                      }`}
                      >
                        {t.tipo === "receita" ? <ArrowUpCircle size={18} /> : <ArrowDownCircle size={18} />}
                      </span>
                      <div>
                        <p className="text-body font-medium text-foreground">{t.descricao}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-small text-muted">
                            {new Date(t.data + "T00:00:00").toLocaleDateString("pt-BR")}
                          </p>
                          {t.categorias?.nome && (
                            <Badge variant="neutral" size="sm">
                              {t.categorias.nome}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className={`text-body font-semibold ${t.tipo === "receita" ? "text-accent-600" : "text-red-500"}`}>
                      {t.tipo === "receita" ? "+" : "-"}
                      {formatarMoeda(Number(t.valor))}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => setModalAberto(true)}
        aria-label="Anotar gasto ou receita do negócio"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-card-hover transition-transform hover:scale-105 sm:hidden"
      >
        <Plus size={26} />
      </button>

      <NovaTransacaoModal aberto={modalAberto} mundo="negocio" onFechar={() => setModalAberto(false)} onSalvo={carregar} />
    </Container>
  );
}
