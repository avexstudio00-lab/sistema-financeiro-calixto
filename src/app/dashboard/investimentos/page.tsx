"use client";

import * as React from "react";
import {
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  TrendingUp,
  Landmark,
  LineChart as LineChartIcon,
  Boxes,
  HandCoins,
  ShoppingBag,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  listarInvestimentos,
  deletarInvestimento,
  atualizarTaxaInvestimento,
  atualizarValorAtualInvestimento,
  calcularValorAtualEstimado,
  calcularGanhoEstimado,
  calcularPercentualGanho,
  calcularEvolucaoInvestimentos,
  temCalculoAutomatico,
  ehTipoRevenda,
  listarParcelas,
  marcarParcelaPaga,
} from "@/lib/data/investimentos";
import { formatarMoeda } from "@/lib/format";
import { NovoInvestimentoModal } from "@/components/dashboard/NovoInvestimentoModal";
import { ParcelasInvestimento } from "@/components/dashboard/ParcelasInvestimento";
import { GraficoLinhaEvolucao } from "@/components/dashboard/graficos/GraficoLinhaEvolucao";
import type { Investimento, ParcelaInvestimento } from "@/lib/data/tipos";

const TIPO_META: Record<Investimento["tipo"], { label: string; icone: LucideIcon }> = {
  cdi: { label: "CDI", icone: TrendingUp },
  tesouro: { label: "Tesouro Direto", icone: Landmark },
  bolsa: { label: "Bolsa de Valores", icone: LineChartIcon },
  proprio: { label: "Investimento próprio", icone: Boxes },
  emprestimo: { label: "Empréstimo", icone: HandCoins },
  revenda: { label: "Compra e revenda", icone: ShoppingBag },
};

export default function InvestimentosPage() {
  const { user } = useAuth();
  const [investimentos, setInvestimentos] = React.useState<Investimento[]>([]);
  const [parcelas, setParcelas] = React.useState<ParcelaInvestimento[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [modalAberto, setModalAberto] = React.useState(false);

  const [editandoTaxaId, setEditandoTaxaId] = React.useState<string | null>(null);
  const [taxaEmEdicao, setTaxaEmEdicao] = React.useState("");
  const [editandoValorId, setEditandoValorId] = React.useState<string | null>(null);
  const [valorEmEdicao, setValorEmEdicao] = React.useState("");
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = React.useState<string | null>(null);
  const [salvandoAcao, setSalvandoAcao] = React.useState(false);

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    const [listaInvestimentos, listaParcelas] = await Promise.all([
      listarInvestimentos(user.id),
      listarParcelas(user.id),
    ]);
    setInvestimentos(listaInvestimentos);
    setParcelas(listaParcelas);
    setCarregando(false);
  }, [user]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const parcelasPorInvestimento = React.useMemo(() => {
    const mapa = new Map<string, ParcelaInvestimento[]>();
    for (const parcela of parcelas) {
      const lista = mapa.get(parcela.investimento_id) ?? [];
      lista.push(parcela);
      mapa.set(parcela.investimento_id, lista);
    }
    return mapa;
  }, [parcelas]);

  const resumo = React.useMemo(() => {
    let totalInvestido = 0;
    let totalAtual = 0;
    for (const inv of investimentos) {
      totalInvestido += Number(inv.valor_investido);
      totalAtual += calcularValorAtualEstimado(inv);
    }
    return { totalInvestido, totalAtual, ganho: totalAtual - totalInvestido };
  }, [investimentos]);

  const linhaEvolucao = React.useMemo(() => {
    return calcularEvolucaoInvestimentos(investimentos, 6).map((p) => ({ mes: p.mes, valor: p.total }));
  }, [investimentos]);

  async function handleSalvarTaxa(inv: Investimento) {
    const valor = Number(taxaEmEdicao.replace(",", "."));
    if (Number.isNaN(valor)) return;
    setSalvandoAcao(true);
    await atualizarTaxaInvestimento(inv.id, valor);
    setSalvandoAcao(false);
    setEditandoTaxaId(null);
    carregar();
  }

  async function handleAtualizarValor(inv: Investimento) {
    const valor = Number(valorEmEdicao.replace(",", "."));
    if (!valor || valor < 0) return;
    setSalvandoAcao(true);
    await atualizarValorAtualInvestimento(inv.id, valor);
    setSalvandoAcao(false);
    setEditandoValorId(null);
    carregar();
  }

  async function handleAlternarParcela(parcela: ParcelaInvestimento) {
    setSalvandoAcao(true);
    await marcarParcelaPaga(parcela.id, !parcela.pago);
    setSalvandoAcao(false);
    carregar();
  }

  async function handleExcluir(inv: Investimento) {
    setSalvandoAcao(true);
    await deletarInvestimento(inv.id);
    setSalvandoAcao(false);
    setConfirmandoExclusaoId(null);
    carregar();
  }

  return (
    <Container className="flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
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
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Total investido</p>
              <p className="text-h2 text-foreground">{formatarMoeda(resumo.totalInvestido)}</p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Ganho estimado</p>
              <p className={`text-h2 ${resumo.ganho >= 0 ? "text-primary-500" : "text-red-500"}`}>
                {resumo.ganho >= 0 ? "+" : ""}
                {formatarMoeda(resumo.ganho)}
              </p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Total projetado</p>
              <p className="text-h2 text-secondary">{formatarMoeda(resumo.totalAtual)}</p>
            </Card>
          </div>

          {linhaEvolucao.length > 1 && (
            <Card padding="lg">
              <h2 className="mb-4 text-h3 text-foreground">Evolução dos investimentos</h2>
              <GraficoLinhaEvolucao dados={linhaEvolucao} cor="#065f46" rotulo="Total investido" />
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {investimentos.map((inv) => {
              const ganho = calcularGanhoEstimado(inv);
              const percentual = calcularPercentualGanho(inv);
              const valorAtual = calcularValorAtualEstimado(inv);
              const Icone = TIPO_META[inv.tipo].icone;
              const automatico = temCalculoAutomatico(inv.tipo);
              const revenda = ehTipoRevenda(inv.tipo);

              return (
                <Card key={inv.id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                        <Icone size={18} />
                      </span>
                      <div>
                        <p className="text-body font-semibold text-foreground">{inv.nome}</p>
                        <p className="text-xs text-muted">
                          {TIPO_META[inv.tipo].label}
                          {inv.descricao ? ` · ${inv.descricao}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-small">
                    <div>
                      <p className="text-xs text-muted">{revenda ? "Custo" : "Investido"}</p>
                      <p className="font-semibold text-foreground">{formatarMoeda(Number(inv.valor_investido))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">Ganho estimado</p>
                      <p className={`font-semibold ${ganho >= 0 ? "text-primary-600" : "text-red-500"}`}>
                        {ganho >= 0 ? "+" : ""}
                        {formatarMoeda(ganho)}
                        <span className="ml-1 text-xs font-normal">
                          ({percentual >= 0 ? "+" : ""}
                          {percentual.toFixed(1)}%)
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">{revenda ? "Valor de venda" : "Valor atual"}</p>
                      <p className="font-semibold text-secondary">{formatarMoeda(valorAtual)}</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted">
                    Desde {new Date(inv.data_inicio + "T00:00:00").toLocaleDateString("pt-BR")}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    {automatico ? (
                      editandoTaxaId === inv.id ? (
                        <div className="flex items-center gap-2">
                          <div className="w-24">
                            <Input
                              value={taxaEmEdicao}
                              onChange={(e) => setTaxaEmEdicao(e.target.value)}
                              inputMode="decimal"
                              placeholder="Taxa %"
                            />
                          </div>
                          <Button size="sm" variant="secondary" disabled={salvandoAcao} onClick={() => handleSalvarTaxa(inv)}>
                            Salvar
                          </Button>
                          <Button size="sm" variant="tertiary" onClick={() => setEditandoTaxaId(null)}>
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditandoTaxaId(inv.id);
                            setTaxaEmEdicao(String(inv.taxa ?? "").replace(".", ","));
                          }}
                          className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
                        >
                          <Pencil size={12} />
                          Taxa: {inv.taxa ?? 0}%{" "}
                          {inv.tipo === "emprestimo" ? (inv.tipo_ganho === "mensal" ? "ao mês" : "fixo") : "ao ano"}
                        </button>
                      )
                    ) : editandoValorId === inv.id ? (
                      <div className="flex items-center gap-2">
                        <div className="w-28">
                          <Input
                            value={valorEmEdicao}
                            onChange={(e) => setValorEmEdicao(e.target.value)}
                            inputMode="decimal"
                            placeholder={revenda ? "Valor de venda" : "Novo valor"}
                          />
                        </div>
                        <Button size="sm" variant="secondary" disabled={salvandoAcao} onClick={() => handleAtualizarValor(inv)}>
                          Salvar
                        </Button>
                        <Button size="sm" variant="tertiary" onClick={() => setEditandoValorId(null)}>
                          Cancelar
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditandoValorId(inv.id);
                          setValorEmEdicao(String(inv.valor_atual).replace(".", ","));
                        }}
                        className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
                      >
                        <RefreshCw size={12} />
                        {revenda ? "Registrar venda" : "Atualizar valor"}
                      </button>
                    )}

                    {confirmandoExclusaoId === inv.id ? (
                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-xs text-muted">Apagar?</span>
                        <Button size="sm" variant="tertiary" onClick={() => setConfirmandoExclusaoId(null)}>
                          Não
                        </Button>
                        <Button
                          size="sm"
                          disabled={salvandoAcao}
                          onClick={() => handleExcluir(inv)}
                          className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
                        >
                          Sim, apagar
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label="Apagar investimento"
                        onClick={() => setConfirmandoExclusaoId(inv.id)}
                        className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  <ParcelasInvestimento
                    parcelas={parcelasPorInvestimento.get(inv.id) ?? []}
                    salvando={salvandoAcao}
                    onAlternarPaga={handleAlternarParcela}
                  />
                </Card>
              );
            })}
          </div>
        </>
      )}

      <NovoInvestimentoModal aberto={modalAberto} onFechar={() => setModalAberto(false)} onSalvo={carregar} />
    </Container>
  );
}

