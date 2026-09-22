"use client";

import * as React from "react";
import { Plus, Wallet, LayoutGrid, Combine } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  listarInvestimentos,
  deletarInvestimento,
  atualizarTaxaInvestimento,
  atualizarValorAtualInvestimento,
  atualizarEmprestimoInvestimento,
  atualizarDataVencimentoParcela,
  atualizarDiariaInvestimento,
  calcularValorAtualEstimado,
  calcularGanhoNoPeriodo,
  calcularEvolucaoInvestimentos,
  listarParcelas,
  marcarParcelaPaga,
  listarPagamentosInvestimento,
  registrarPagamentoJuros,
  registrarQuitacaoEmprestimo,
  registrarQuitacaoAntecipadaParcelado,
} from "@/lib/data/investimentos";
import { formatarMoeda } from "@/lib/format";
import { obterCotacoesMercado } from "@/lib/data/mercado";
import { NovoInvestimentoModal } from "@/components/dashboard/NovoInvestimentoModal";
import { InvestimentoCard, TIPO_META } from "@/components/dashboard/InvestimentoCard";
import type { DadosJurosParcela } from "@/components/dashboard/ParcelasInvestimento";
import { GraficoLinhaEvolucao } from "@/components/dashboard/graficos/GraficoLinhaEvolucao";
import type { Investimento, ParcelaInvestimento, PagamentoInvestimento, CotacoesMercado } from "@/lib/data/tipos";

const ORDEM_TIPOS: Investimento["tipo"][] = ["cdi", "tesouro", "bolsa", "emprestimo", "revenda"];

const OPCOES_PERIODO: { id: number | null; label: string }[] = [
  { id: 3, label: "3 meses" },
  { id: 6, label: "6 meses" },
  { id: 12, label: "12 meses" },
  { id: null, label: "Desde o início" },
];

export default function InvestimentosPage() {
  const { user } = useAuth();
  const [investimentos, setInvestimentos] = React.useState<Investimento[]>([]);
  const [parcelas, setParcelas] = React.useState<ParcelaInvestimento[]>([]);
  const [pagamentos, setPagamentos] = React.useState<PagamentoInvestimento[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [modalAberto, setModalAberto] = React.useState(false);
  const [salvandoAcao, setSalvandoAcao] = React.useState(false);
  // Cotações ao vivo (CDI, câmbio, títulos do Tesouro) -- busca sozinha ao
  // entrar na tela, sem travar o carregamento dos investimentos em si; até
  // chegar (ou se falhar), os cálculos caem pro comportamento legado por
  // taxa gravada (ver `calcularValorAtualEstimado` em src/lib/data/investimentos.ts).
  const [cotacoes, setCotacoes] = React.useState<CotacoesMercado | undefined>(undefined);

  // Cada tipo de investimento (CDI, empréstimo etc.) tem seu próprio
  // mini-dashboard, separado dos outros — só se combinam quando a pessoa
  // pede explicitamente pra ver tudo junto. Ver seção sobre isso pedida
  // pelo usuário: "eles só se misturam caso a pessoa peça pra ver o ganho
  // em todos".
  const [modoVisualizacao, setModoVisualizacao] = React.useState<"porTipo" | "combinado">("porTipo");
  const [periodoMeses, setPeriodoMeses] = React.useState<number | null>(6);

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    const [listaInvestimentos, listaParcelas, listaPagamentos] = await Promise.all([
      listarInvestimentos(user.id),
      listarParcelas(user.id),
      listarPagamentosInvestimento(user.id),
    ]);
    setInvestimentos(listaInvestimentos);
    setParcelas(listaParcelas);
    setPagamentos(listaPagamentos);
    setCarregando(false);
  }, [user]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  React.useEffect(() => {
    obterCotacoesMercado().then(setCotacoes);
  }, []);

  const parcelasPorInvestimento = React.useMemo(() => {
    const mapa = new Map<string, ParcelaInvestimento[]>();
    for (const parcela of parcelas) {
      const lista = mapa.get(parcela.investimento_id) ?? [];
      lista.push(parcela);
      mapa.set(parcela.investimento_id, lista);
    }
    return mapa;
  }, [parcelas]);

  const pagamentosPorInvestimento = React.useMemo(() => {
    const mapa = new Map<string, PagamentoInvestimento[]>();
    for (const pagamento of pagamentos) {
      const lista = mapa.get(pagamento.investimento_id) ?? [];
      lista.push(pagamento);
      mapa.set(pagamento.investimento_id, lista);
    }
    return mapa;
  }, [pagamentos]);

  const grupos = React.useMemo(() => {
    const mapa = new Map<Investimento["tipo"], Investimento[]>();
    for (const inv of investimentos) {
      const lista = mapa.get(inv.tipo) ?? [];
      lista.push(inv);
      mapa.set(inv.tipo, lista);
    }
    return ORDEM_TIPOS.map((tipo) => ({ tipo, itens: mapa.get(tipo) ?? [] })).filter((g) => g.itens.length > 0);
  }, [investimentos]);

  function calcularResumo(lista: Investimento[]) {
    let totalInvestido = 0;
    let totalAtual = 0;
    for (const inv of lista) {
      totalInvestido += Number(inv.valor_investido);
      totalAtual += calcularValorAtualEstimado(inv, undefined, cotacoes);
    }
    const ganhoTotal = totalAtual - totalInvestido;
    const ganhoPeriodo = periodoMeses == null ? ganhoTotal : calcularGanhoNoPeriodo(lista, periodoMeses, cotacoes);
    return { totalInvestido, totalAtual, ganhoTotal, ganhoPeriodo };
  }

  const resumoGeral = React.useMemo(() => calcularResumo(investimentos), [investimentos, periodoMeses, cotacoes]);

  const linhaEvolucao = React.useMemo(() => {
    return calcularEvolucaoInvestimentos(investimentos, periodoMeses ?? 12, cotacoes).map((p) => ({
      mes: p.mes,
      valor: p.total,
    }));
  }, [investimentos, periodoMeses, cotacoes]);

  const labelGanho = periodoMeses == null ? "Ganho estimado" : `Ganho nos últimos ${periodoMeses} meses`;

  async function handleSalvarTaxa(inv: Investimento, novaTaxa: number) {
    setSalvandoAcao(true);
    await atualizarTaxaInvestimento(inv.id, novaTaxa);
    setSalvandoAcao(false);
    carregar();
  }

  async function handleAtualizarValor(inv: Investimento, novoValor: number) {
    setSalvandoAcao(true);
    await atualizarValorAtualInvestimento(inv.id, novoValor);
    setSalvandoAcao(false);
    carregar();
  }

  async function handleEditarEmprestimo(
    inv: Investimento,
    dados: { valorRetornavel: number; dataVencimentoFinal: string }
  ) {
    setSalvandoAcao(true);
    await atualizarEmprestimoInvestimento(inv.id, {
      valor_retornavel: dados.valorRetornavel,
      data_vencimento_final: dados.dataVencimentoFinal,
    });
    setSalvandoAcao(false);
    carregar();
  }

  async function handleAlternarParcela(parcela: ParcelaInvestimento) {
    setSalvandoAcao(true);
    await marcarParcelaPaga(parcela.id, !parcela.pago);
    setSalvandoAcao(false);
    carregar();
  }

  async function handleEditarDataParcela(parcela: ParcelaInvestimento, novaDataIso: string) {
    setSalvandoAcao(true);
    const { error } = await atualizarDataVencimentoParcela(parcela.id, parcela.investimento_id, novaDataIso);
    if (error) {
      // Não bloqueia o usuário (a UI já otimisticamente fecha o campo de
      // edição), mas garante que uma falha nessa escrita em duas etapas
      // (parcela + recálculo do vencimento final do investimento) fique
      // registrada em vez de silenciosamente inconsistente.
      console.error("Erro ao editar data da parcela:", error);
    }
    setSalvandoAcao(false);
    carregar();
  }

  async function handleAtualizarDiaria(inv: Investimento, valorDiaria: number | null) {
    setSalvandoAcao(true);
    await atualizarDiariaInvestimento(inv.id, valorDiaria);
    setSalvandoAcao(false);
    carregar();
  }

  async function handleRegistrarJurosAvista(
    inv: Investimento,
    dados: { valorJuros: number; valorDiaria: number; dataPagamento: string }
  ) {
    if (!user || !inv.data_vencimento_final) return;
    setSalvandoAcao(true);
    await registrarPagamentoJuros({
      investimentoId: inv.id,
      usuarioId: user.id,
      parcelaId: null,
      vencimentoAtual: inv.data_vencimento_final,
      valorJuros: dados.valorJuros,
      valorDiaria: dados.valorDiaria,
      dataPagamento: dados.dataPagamento,
    });
    setSalvandoAcao(false);
    carregar();
  }

  async function handleRegistrarQuitacao(
    inv: Investimento,
    dados: { valorPago: number; valorDiaria: number; dataPagamento: string }
  ) {
    if (!user || !inv.data_vencimento_final) return;
    setSalvandoAcao(true);
    await registrarQuitacaoEmprestimo({
      investimentoId: inv.id,
      usuarioId: user.id,
      vencimentoAtual: inv.data_vencimento_final,
      valorPago: dados.valorPago,
      valorDiaria: dados.valorDiaria,
      dataPagamento: dados.dataPagamento,
    });
    setSalvandoAcao(false);
    carregar();
  }

  async function handleRegistrarQuitacaoAntecipada(
    inv: Investimento,
    parcelasEmAberto: ParcelaInvestimento[],
    dados: { valorPago: number; valorDiaria: number; dataPagamento: string }
  ) {
    if (!user) return;
    setSalvandoAcao(true);
    await registrarQuitacaoAntecipadaParcelado(
      inv.id,
      user.id,
      parcelasEmAberto,
      dados.valorPago,
      dados.valorDiaria,
      dados.dataPagamento
    );
    setSalvandoAcao(false);
    carregar();
  }

  async function handleRegistrarJurosParcela(parcela: ParcelaInvestimento, dados: DadosJurosParcela) {
    if (!user) return;
    setSalvandoAcao(true);
    await registrarPagamentoJuros({
      investimentoId: parcela.investimento_id,
      usuarioId: user.id,
      parcelaId: parcela.id,
      vencimentoAtual: parcela.data_vencimento,
      valorJuros: dados.valorJuros,
      valorDiaria: dados.valorDiaria,
      dataPagamento: dados.dataPagamento,
      empurrarSeguintes: dados.empurrarSeguintes,
    });
    setSalvandoAcao(false);
    carregar();
  }

  async function handleExcluir(inv: Investimento) {
    setSalvandoAcao(true);
    await deletarInvestimento(inv.id);
    setSalvandoAcao(false);
    carregar();
  }

  function renderCartoesStats(resumo: ReturnType<typeof calcularResumo>) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <p className="text-small text-muted">Total investido</p>
          <p className="text-h2 text-foreground">{formatarMoeda(resumo.totalInvestido)}</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <p className="text-small text-muted">{labelGanho}</p>
          <p className={`text-h2 ${resumo.ganhoPeriodo >= 0 ? "text-primary-500" : "text-red-500"}`}>
            {resumo.ganhoPeriodo >= 0 ? "+" : ""}
            {formatarMoeda(resumo.ganhoPeriodo)}
          </p>
        </Card>
        <Card className="flex flex-col gap-2">
          <p className="text-small text-muted">Total projetado</p>
          <p className="text-h2 text-secondary">{formatarMoeda(resumo.totalAtual)}</p>
        </Card>
      </div>
    );
  }

  function renderGradeCartoes(itens: Investimento[]) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {itens.map((inv) => (
          <InvestimentoCard
            key={inv.id}
            inv={inv}
            parcelas={parcelasPorInvestimento.get(inv.id) ?? []}
            pagamentos={pagamentosPorInvestimento.get(inv.id) ?? []}
            cotacoes={cotacoes}
            salvando={salvandoAcao}
            onSalvarTaxa={handleSalvarTaxa}
            onAtualizarValor={handleAtualizarValor}
            onEditarEmprestimo={handleEditarEmprestimo}
            onExcluir={handleExcluir}
            onAlternarParcela={handleAlternarParcela}
            onEditarDataParcela={handleEditarDataParcela}
            onAtualizarDiaria={handleAtualizarDiaria}
            onRegistrarJurosAvista={handleRegistrarJurosAvista}
            onRegistrarQuitacao={handleRegistrarQuitacao}
            onRegistrarQuitacaoAntecipada={handleRegistrarQuitacaoAntecipada}
            onRegistrarJurosParcela={handleRegistrarJurosParcela}
          />
        ))}
      </div>
    );
  }

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Meus investimentos</h1>
          <p className="text-body text-muted">Acompanhe tudo o que você guarda ou empresta, num só lugar.</p>
        </div>
        <Button size="lg" onClick={() => setModalAberto(true)}>
          <Plus size={18} />
          Adicionar investimento
        </Button>
      </div>

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : investimentos.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
            <Wallet size={26} />
          </span>
          <p className="text-body text-muted">
            Você ainda não tem investimentos cadastrados. Pode ser uma reserva, um título público ou até um
            empréstimo — vamos começar?
          </p>
          <Button onClick={() => setModalAberto(true)}>
            <Plus size={18} />
            Adicionar meu primeiro investimento
          </Button>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="flex gap-1.5 rounded-xl bg-muted/10 p-1">
              <button
                type="button"
                onClick={() => setModoVisualizacao("porTipo")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-small font-medium transition-all",
                  modoVisualizacao === "porTipo" ? "bg-card text-primary-700 shadow-sm" : "text-muted"
                )}
              >
                <LayoutGrid size={14} />
                Por tipo
              </button>
              <button
                type="button"
                onClick={() => setModoVisualizacao("combinado")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-small font-medium transition-all",
                  modoVisualizacao === "combinado" ? "bg-card text-primary-700 shadow-sm" : "text-muted"
                )}
              >
                <Combine size={14} />
                Todos juntos
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted/10 p-1">
              {OPCOES_PERIODO.map((opcao) => (
                <button
                  key={opcao.label}
                  type="button"
                  onClick={() => setPeriodoMeses(opcao.id)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-small font-medium transition-all",
                    periodoMeses === opcao.id ? "bg-card text-primary-700 shadow-sm" : "text-muted"
                  )}
                >
                  {opcao.label}
                </button>
              ))}
            </div>
          </div>

          {modoVisualizacao === "combinado" ? (
            <>
              {renderCartoesStats(resumoGeral)}

              {linhaEvolucao.length > 1 && (
                <Card padding="lg">
                  <h2 className="mb-4 text-h3 text-foreground">Evolução dos investimentos</h2>
                  <GraficoLinhaEvolucao dados={linhaEvolucao} cor="#065f46" rotulo="Total investido" />
                </Card>
              )}

              {renderGradeCartoes(investimentos)}
            </>
          ) : (
            <div className="flex flex-col gap-8">
              {grupos.map(({ tipo, itens }) => {
                const Icone = TIPO_META[tipo].icone;
                const resumo = calcularResumo(itens);
                return (
                  <div key={tipo} className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                        <Icone size={16} />
                      </span>
                      <h2 className="text-h3 text-foreground">{TIPO_META[tipo].label}</h2>
                      <span className="text-small text-muted">
                        {itens.length === 1 ? "1 investimento" : `${itens.length} investimentos`}
                      </span>
                    </div>
                    {renderCartoesStats(resumo)}
                    {renderGradeCartoes(itens)}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <NovoInvestimentoModal aberto={modalAberto} onFechar={() => setModalAberto(false)} onSalvo={carregar} />
    </Container>
  );
}
