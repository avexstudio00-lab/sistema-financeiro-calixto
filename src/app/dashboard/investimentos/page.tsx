"use client";

import * as React from "react";
import { Plus, Wallet, LayoutGrid, Combine, Search, X, HandCoins } from "lucide-react";
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
  editarParcelaInvestimento,
  marcarEmprestimoQuitadoPorParcelas,
  reabrirEmprestimoParcelado,
  atualizarDiariaInvestimento,
  calcularValorAtualEstimado,
  calcularGanhoNoPeriodo,
  calcularRecebidoNoPeriodo,
  calcularLucroRecebidoNoPeriodo,
  totalProjetado,
  calcularEvolucaoInvestimentos,
  listarParcelas,
  marcarParcelaPaga,
  listarPagamentosInvestimento,
  registrarPagamentoJuros,
  registrarQuitacaoEmprestimo,
  registrarQuitacaoAntecipadaParcelado,
  registrarResgateInvestimento,
} from "@/lib/data/investimentos";
import { formatarMoeda } from "@/lib/format";
import { obterCotacoesMercado } from "@/lib/data/mercado";
import { NovoInvestimentoModal, type TipoInvestimento } from "@/components/dashboard/NovoInvestimentoModal";
import { EscolherCarteiraDialog } from "@/components/dashboard/SeletorCarteira";
import { PainelRevenda, VincularContaOrigem } from "@/components/dashboard/PainelRevenda";
import { reavaliarQuitacaoRevenda, salvarPrecoRevenda, totalRecebidoRevenda } from "@/lib/data/revenda";
import { FiltrosLista, AbasVistaParcelado } from "@/components/dashboard/FiltrosLista";
import { Badge } from "@/components/ui/Badge";
import { supabase } from "@/lib/supabase/client";
import { InvestimentoCard, TIPO_META } from "@/components/dashboard/InvestimentoCard";
import type { DadosJurosParcela, DadosEdicaoParcela } from "@/components/dashboard/ParcelasInvestimento";
import { GraficoLinhaEvolucao } from "@/components/dashboard/graficos/GraficoLinhaEvolucao";
import { ReceberVariasDialog } from "@/components/dashboard/ReceberVariasDialog";
import { carregarOperacoesAbertas, type OperacaoAberta } from "@/lib/data/importarLigacoes";
import { registrarRecebimentoVarias } from "@/lib/data/receberVarias";
import type { Investimento, ParcelaInvestimento, PagamentoInvestimento, CotacoesMercado } from "@/lib/data/tipos";

const ORDEM_TIPOS: Investimento["tipo"][] = [
  "cdi",
  "poupanca",
  "cdb",
  "lci",
  "lca",
  "tesouro",
  "bolsa",
  "cripto",
  "emprestimo",
  "revenda",
];

/** Situação de uma operação de compra e revenda (item 5.3). */
type StatusRevenda = "em_estoque" | "em_andamento" | "parcial" | "quitado";
const ROTULO_STATUS_REVENDA: Record<StatusRevenda, string> = {
  em_estoque: "Ainda não vendido",
  em_andamento: "Vendido · aguardando pagamento",
  parcial: "Vendido · recebendo (parte paga)",
  quitado: "Vendido e pago",
};

/** Tipos com operação "à vista x parcelada" e histórico de quitadas (5.2). */
const TIPOS_OPERACAO: Investimento["tipo"][] = ["emprestimo", "revenda"];

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
  // Filtro por tipo dentro do modo "Por tipo" -- pedido do usuário em
  // 22/set/2026: uma aba pra escolher UM tipo (ex: só Empréstimo) em vez de
  // rolar a tela pra ver todas as seções empilhadas. "todos" mantém o
  // comportamento de sempre (todas as seções, uma embaixo da outra). Só
  // afeta o modo "Por tipo" -- o modo "Todos juntos" já mistura tudo por
  // desenho e continua igual, como o próprio usuário pediu pra manter.
  const [filtroTipo, setFiltroTipo] = React.useState<Investimento["tipo"] | "todos">("todos");
  // Busca (10/nov/2026): nome da pessoa, código (E3, R2) ou descrição —
  // mostra TODOS que batem (à vista, parcelado e quitados juntos).
  const [busca, setBusca] = React.useState("");
  // "Receber várias de uma vez" (10/nov/2026).
  const [receberVarias, setReceberVarias] = React.useState<{ operacoes: OperacaoAberta[]; filtro: string } | null>(null);
  const [salvandoVarias, setSalvandoVarias] = React.useState(false);
  const [avisoVarias, setAvisoVarias] = React.useState<string | null>(null);
  async function abrirReceberVarias(filtro: string) {
    if (!user) return;
    const operacoes = await carregarOperacoesAbertas(user.id);
    setReceberVarias({ operacoes, filtro });
  }
  // 5.12: "+" contextual por aba de tipo.
  const [tipoNovo, setTipoNovo] = React.useState<TipoInvestimento | null>(null);
  // 5.2: filtros das operações (empréstimo e compra e revenda).
  // 09/nov/2026: abas e "Quitadas" são POR TIPO (antes um estado só era
  // compartilhado entre Empréstimo e Compra e revenda — clicar numa seção
  // mexia na outra). O filtro de período de baixo saiu: ficou só o de cima
  // (3/6/12 meses/Desde o início), que muda os números de verdade.
  const [abaPorTipo, setAbaPorTipo] = React.useState<Partial<Record<Investimento["tipo"], "vista" | "parcelado">>>({});
  const [quitadasPorTipo, setQuitadasPorTipo] = React.useState<Partial<Record<Investimento["tipo"], boolean>>>({});
  // 5.10: parcela aguardando a escolha da carteira de destino.
  const [parcelaParaReceber, setParcelaParaReceber] = React.useState<ParcelaInvestimento | null>(null);

  const carregar = React.useCallback(async () => {
    if (!user) return;
    // Recarregar depois de salvar NÃO mostra o spinner (só a 1ª carga):
    // trocar a lista pelo spinner jogava a tela pro topo e fechava o que
    // estava aberto (pedido do usuário em 05/out/2026).
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

  const resultadosBusca = React.useMemo(() => {
    const termo = busca
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
    if (!termo) return null;
    const norm = (t: string | null | undefined) =>
      (t ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    return investimentos.filter((i) =>
      norm(i.codigo) === termo || norm(i.nome).includes(termo) || norm(i.descricao).includes(termo) || norm(i.codigo).startsWith(termo)
    );
  }, [busca, investimentos]);

  const gruposFiltrados = React.useMemo(
    () => (filtroTipo === "todos" ? grupos : grupos.filter((g) => g.tipo === filtroTipo)),
    [grupos, filtroTipo]
  );

  /** `listaRecebidos`: de onde vem o lucro/recebido do período. Nas
   * operações o "Total investido" é só o que está em aberto, mas o lucro
   * tem que contar também as já quitadas (antes ficavam de fora). */
  function calcularResumo(lista: Investimento[], listaRecebidos: Investimento[] = lista) {
    let totalInvestido = 0;
    let totalAtual = 0;
    for (const inv of lista) {
      totalInvestido += Number(inv.valor_investido);
      totalAtual += calcularValorAtualEstimado(inv, undefined, cotacoes);
    }
    const ganhoTotal = totalAtual - totalInvestido;
    // Rendimento ESTIMADO no período (antigo "ganho") — continua visível
    // como referência, mas o número principal agora é o que entrou de fato.
    const ganhoEstimadoPeriodo = periodoMeses == null ? ganhoTotal : calcularGanhoNoPeriodo(lista, periodoMeses, cotacoes);
    // Item 4.15 (09/out/2026): "Ganhos nos últimos X meses" = só entradas
    // reais (parcelas, juros, amortizações, recebimentos) dentro do período,
    // tanto "Por tipo" quanto no consolidado (a função recebe a lista).
    const recebidoPeriodo = calcularRecebidoNoPeriodo(listaRecebidos, parcelas, pagamentos, periodoMeses);
    const ganhoPeriodo = calcularLucroRecebidoNoPeriodo(listaRecebidos, parcelas, pagamentos, periodoMeses);
    // "Total projetado": juros compostos pela taxa de cada ativo até daqui a
    // X meses (3/6/12). "Desde o início" projeta 12 meses.
    const mesesProjecao = periodoMeses ?? 12;
    const projetado = totalProjetado(lista, mesesProjecao, cotacoes);
    return { rotuloInvestido: lista.length !== listaRecebidos.length ? "Total em aberto agora" : "Total investido", totalInvestido, totalAtual, ganhoTotal, ganhoPeriodo, recebidoPeriodo, ganhoEstimadoPeriodo, projetado, mesesProjecao };
  }

  const resumoGeral = React.useMemo(
    () => calcularResumo(investimentos.filter((i) => !(i.quitado && !TIPOS_OPERACAO.includes(i.tipo))), investimentos),
    [investimentos, periodoMeses, cotacoes, parcelas, pagamentos]
  );

  const linhaEvolucao = React.useMemo(() => {
    return calcularEvolucaoInvestimentos(investimentos, periodoMeses ?? 12, cotacoes).map((p) => ({
      mes: p.mes,
      valor: p.total,
    }));
  }, [investimentos, periodoMeses, cotacoes]);

  const labelGanho = periodoMeses == null ? "Lucro recebido desde o início" : `Lucro recebido nos últimos ${periodoMeses} meses`;

  async function handleResgatar(
    inv: Investimento,
    dados: { valor: number; valorAtual: number; contaId: string; data: string; total: boolean }
  ): Promise<string | null> {
    if (!user) return "Sessão expirada.";
    setSalvandoAcao(true);
    const { error } = await registrarResgateInvestimento({ investimento: inv, usuarioId: user.id, ...dados });
    setSalvandoAcao(false);
    carregar();
    return error ? error.message : null;
  }

  // Renda fixa/bolsa/cripto já resgatados saem dos totais e da lista
  // (aparecem no botão "Resgatados").
  const resgatado = (i: Investimento) => i.quitado && !TIPOS_OPERACAO.includes(i.tipo);
  const [verResgatados, setVerResgatados] = React.useState(false);

  async function handleSalvarTaxa(inv: Investimento, novaTaxa: number) {
    setSalvandoAcao(true);
    await atualizarTaxaInvestimento(inv.id, novaTaxa);
    setSalvandoAcao(false);
    carregar();
  }

  async function handleAtualizarValor(inv: Investimento, novoValor: number) {
    setSalvandoAcao(true);
    await atualizarValorAtualInvestimento(inv.id, novoValor);
    // Compra e revenda: "valor de venda" é o próprio preço de revenda (5.3).
    if (inv.tipo === "revenda") await salvarPrecoRevenda(inv.id, novoValor);
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

  /** Marcar como recebida pede a carteira de destino (5.10); desmarcar
   * estorna o lançamento ligado direto. */
  function handleAlternarParcela(parcela: ParcelaInvestimento) {
    if (!parcela.pago) {
      setParcelaParaReceber(parcela);
      return;
    }
    void alternarParcela(parcela, null);
  }

  async function alternarParcela(parcela: ParcelaInvestimento, contaId: string | null) {
    if (!user) return;
    setSalvandoAcao(true);
    const novoPago = !parcela.pago;
    const inv0 = investimentos.find((i) => i.id === parcela.investimento_id);
    const { error } = await marcarParcelaPaga(
      parcela.id,
      novoPago,
      novoPago && contaId
        ? {
            usuarioId: user.id,
            contaId,
            // Se já entrou uma parte antes, agora entra só o que falta.
            valor: Number((Number(parcela.valor) - Number(parcela.valor_recebido ?? 0)).toFixed(2)),
            descricao: `${inv0?.nome ?? "Investimento"} — parcela ${parcela.numero} recebida`,
          }
        : null,
      parcela.transacao_id ?? null
    );
    if (!error) {
      // Mantém `quitado` do empréstimo em sincronia com as parcelas (ver
      // `marcarEmprestimoQuitadoPorParcelas`/`reabrirEmprestimoParcelado`):
      // pagou a última em aberto -> quitado; desmarcou uma -> reabre.
      const inv = investimentos.find((i) => i.id === parcela.investimento_id);
      const doInvestimento = parcelasPorInvestimento.get(parcela.investimento_id) ?? [];
      const todasPagas = doInvestimento.every((p) => (p.id === parcela.id ? novoPago : p.pago));
      // Compra e revenda também fecha sozinha quando todas as parcelas
      // entram (5.3) — a menos que a pessoa tenha fixado o status à mão.
      if (inv && (inv.tipo === "emprestimo" || (inv.tipo === "revenda" && !inv.status_revenda))) {
        if (novoPago && todasPagas && doInvestimento.length > 0 && !inv.quitado) {
          const soma = doInvestimento.reduce((acc, p) => acc + Number(p.valor), 0);
          await marcarEmprestimoQuitadoPorParcelas(inv.id, soma);
        } else if (!novoPago && inv.quitado) {
          await reabrirEmprestimoParcelado(inv.id);
        }
      }
      // Com preço de revenda definido, quem manda é "recebido ≥ preço" (5.3).
      if (inv && inv.tipo === "revenda" && inv.preco_revenda) await reavaliarQuitacaoRevenda(inv.id);
    } else {
      console.error("Erro ao marcar parcela:", error);
    }
    setSalvandoAcao(false);
    carregar();
  }

  async function handleEditarParcela(parcela: ParcelaInvestimento, dados: DadosEdicaoParcela) {
    setSalvandoAcao(true);
    const { error } = await editarParcelaInvestimento(
      parcela.id,
      parcela.investimento_id,
      dados.novaData,
      dados.novoValor,
      dados.aplicarSeguintes
    );
    if (error) {
      // Não bloqueia o usuário (a UI já otimisticamente fecha o campo de
      // edição), mas garante que uma falha nessa escrita em duas etapas
      // (parcela + recálculo do vencimento final do investimento) fique
      // registrada em vez de silenciosamente inconsistente.
      console.error("Erro ao editar parcela:", error);
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
    dados: { valorJuros: number; valorDiaria: number; dataPagamento: string; contaId?: string | null }
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
      contaId: dados.contaId ?? null,
      descricaoLancamento: `Juros recebidos — ${inv.nome}`,
    });
    setSalvandoAcao(false);
    carregar();
  }

  async function handleRegistrarQuitacao(
    inv: Investimento,
    dados: { valorPago: number; valorDiaria: number; dataPagamento: string; contaId?: string | null }
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
      contaId: dados.contaId ?? null,
      descricaoLancamento: `Quitação recebida — ${inv.nome}`,
    });
    setSalvandoAcao(false);
    carregar();
  }

  async function handleRegistrarQuitacaoAntecipada(
    inv: Investimento,
    parcelasEmAberto: ParcelaInvestimento[],
    dados: { valorPago: number; valorDiaria: number; dataPagamento: string; contaId?: string | null }
  ) {
    if (!user) return;
    setSalvandoAcao(true);
    await registrarQuitacaoAntecipadaParcelado(
      inv.id,
      user.id,
      parcelasEmAberto,
      dados.valorPago,
      dados.valorDiaria,
      dados.dataPagamento,
      dados.contaId ?? null,
      `Quitação antecipada recebida — ${inv.nome}`
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
      contaId: dados.contaId ?? null,
      descricaoLancamento: `Juros recebidos — ${investimentos.find((i) => i.id === parcela.investimento_id)?.nome ?? "empréstimo"}`,
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
          <p className="text-small text-muted">{resumo.rotuloInvestido}</p>
          <p className="text-h2 text-foreground">{formatarMoeda(resumo.totalInvestido)}</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <p className="text-small text-muted">{labelGanho}</p>
          <p className="text-h2 text-primary-700">+{formatarMoeda(resumo.ganhoPeriodo)}</p>
          <p className="text-xs text-muted">
            Entrou no total {formatarMoeda(resumo.recebidoPeriodo)} (inclui a volta do valor emprestado ou do custo do
            produto) — o número acima é só o lucro. Rendimento estimado no período:{" "}
            {resumo.ganhoEstimadoPeriodo >= 0 ? "+" : ""}
            {formatarMoeda(resumo.ganhoEstimadoPeriodo)}
          </p>
        </Card>
        <Card className="flex flex-col gap-2">
          <p className="text-small text-muted">Total projetado em {resumo.mesesProjecao} meses</p>
          <p className="text-h2 text-secondary">{formatarMoeda(resumo.projetado)}</p>
          <p className="text-xs text-muted">Hoje: {formatarMoeda(resumo.totalAtual)} · juros compostos pela taxa de cada ativo</p>
        </Card>
      </div>
    );
  }

  /** Quitado = marcado como quitado, ou parcelado com todas as parcelas
   * recebidas, ou status de revenda fixado como "Quitado". */
  function estaQuitado(inv: Investimento): boolean {
    if (inv.tipo === "revenda" && inv.status_revenda) return inv.status_revenda === "quitado";
    if (inv.quitado) return true;
    if (inv.tipo === "revenda" && inv.preco_revenda) {
      const recebido = totalRecebidoRevenda(parcelasPorInvestimento.get(inv.id) ?? [], pagamentosPorInvestimento.get(inv.id) ?? []);
      return recebido >= Number(inv.preco_revenda) - 0.005;
    }
    const ps = parcelasPorInvestimento.get(inv.id) ?? [];
    return ps.length > 0 && ps.every((p) => p.pago);
  }

  /** 5.3: status automático da compra e revenda (ou o fixado à mão). */
  function statusRevenda(inv: Investimento): StatusRevenda {
    if (inv.status_revenda) return inv.status_revenda;
    if (estaQuitado(inv)) return "quitado";
    const ps = parcelasPorInvestimento.get(inv.id) ?? [];
    if (totalRecebidoRevenda(ps, pagamentosPorInvestimento.get(inv.id) ?? []) > 0) return "parcial";
    return inv.forma_pagamento === "parcelado" ? "em_andamento" : "em_estoque";
  }

  async function handleMudarStatusRevenda(inv: Investimento, valor: StatusRevenda | "auto") {
    setSalvandoAcao(true);
    if (valor === "auto") {
      const ps = parcelasPorInvestimento.get(inv.id) ?? [];
      const todasPagas = ps.length > 0 && ps.every((p) => p.pago);
      await supabase.from("investimentos").update({ status_revenda: null, quitado: todasPagas }).eq("id", inv.id);
    } else {
      await supabase
        .from("investimentos")
        .update({
          status_revenda: valor,
          quitado: valor === "quitado",
          data_quitacao: valor === "quitado" ? new Date().toISOString().slice(0, 10) : null,
        })
        .eq("id", inv.id);
    }
    setSalvandoAcao(false);
    carregar();
  }

  /** 5.2: aplica abas À vista/Parceladas, período e "Quitadas" nas
   * operações (empréstimo e compra e revenda). */
  function filtrarOperacoes(itens: Investimento[], aba: "vista" | "parcelado", quitadas: boolean): Investimento[] {
    return itens.filter((inv) => (inv.forma_pagamento ?? "vista") === aba && estaQuitado(inv) === quitadas);
  }

  function renderGradeCartoes(itens: Investimento[]) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {itens.map((inv) => (
          // min-w-0: sem isso o item da grade não encolhe e o último card
          // ficava cortado na borda da tela do celular (09/nov/2026).
          <div key={inv.id} className="flex min-w-0 flex-col gap-2">
          <VincularContaOrigem inv={inv} onAlterado={carregar} />
          <InvestimentoCard
            key={inv.id}
            inv={inv}
            blocoTopo={inv.tipo === "revenda" ? (
            <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/5 px-3 py-2">
              <Badge variant={statusRevenda(inv) === "quitado" ? "primary" : statusRevenda(inv) === "parcial" ? "warning" : "neutral"} size="sm">
                {ROTULO_STATUS_REVENDA[statusRevenda(inv)]}
                {inv.status_revenda ? " (manual)" : ""}
              </Badge>
              <label className="flex items-center gap-2 text-xs text-muted">
                Situação
                <select
                  value={inv.status_revenda ?? "auto"}
                  disabled={salvandoAcao}
                  onChange={(e) => handleMudarStatusRevenda(inv, e.target.value as StatusRevenda | "auto")}
                  className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                >
                  <option value="auto">Automática</option>
                  {(Object.keys(ROTULO_STATUS_REVENDA) as StatusRevenda[]).map((s) => (
                    <option key={s} value={s}>
                      {ROTULO_STATUS_REVENDA[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <PainelRevenda
              inv={inv}
              parcelas={parcelasPorInvestimento.get(inv.id) ?? []}
              pagamentos={pagamentosPorInvestimento.get(inv.id) ?? []}
              onAlterado={carregar}
            />
            </div>
            ) : undefined}
            parcelas={parcelasPorInvestimento.get(inv.id) ?? []}
            pagamentos={pagamentosPorInvestimento.get(inv.id) ?? []}
            cotacoes={cotacoes}
            salvando={salvandoAcao}
            onSalvarTaxa={handleSalvarTaxa}
            onAtualizarValor={handleAtualizarValor}
            onEditarEmprestimo={handleEditarEmprestimo}
            onExcluir={handleExcluir}
            onAlternarParcela={handleAlternarParcela}
            onEditarParcela={handleEditarParcela}
            onPagamentosAlterados={carregar}
            onAtualizarDiaria={handleAtualizarDiaria}
            onRegistrarJurosAvista={handleRegistrarJurosAvista}
            onRegistrarQuitacao={handleRegistrarQuitacao}
            onRegistrarQuitacaoAntecipada={handleRegistrarQuitacaoAntecipada}
            onRegistrarJurosParcela={handleRegistrarJurosParcela}
            onResgatar={handleResgatar}
          />
          </div>
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

          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome da pessoa ou código (ex.: E3, R2)"
              aria-label="Buscar empréstimos, revendas e investimentos"
              className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-10 text-small text-foreground placeholder:text-muted"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-muted/10"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {avisoVarias && (
            <p className="flex items-start justify-between gap-2 rounded-xl border border-primary-200 bg-primary-50/60 px-3 py-2 text-small text-foreground dark:border-primary-800 dark:bg-primary-900/10">
              {avisoVarias}
              <button type="button" onClick={() => setAvisoVarias(null)} aria-label="Fechar aviso" className="text-muted">
                <X size={14} />
              </button>
            </p>
          )}

          {resultadosBusca ? (
            <div className="flex flex-col gap-4">
              <p className="text-small text-muted">
                {resultadosBusca.length === 0
                  ? `Nada encontrado para "${busca.trim()}".`
                  : `${resultadosBusca.length} ${resultadosBusca.length === 1 ? "resultado" : "resultados"} para "${busca.trim()}" (abertos e quitados).`}
              </p>
              {resultadosBusca.some((i) => (i.tipo === "emprestimo" || i.tipo === "revenda") && !estaQuitado(i)) && (
                <Button size="sm" variant="secondary" className="self-start" onClick={() => void abrirReceberVarias(busca.trim())}>
                  <HandCoins size={16} />
                  Receber várias de uma vez
                </Button>
              )}
              {resultadosBusca.length > 0 && renderGradeCartoes(resultadosBusca)}
            </div>
          ) : modoVisualizacao === "combinado" ? (
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
              {grupos.length > 1 && (
                <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted/10 p-1">
                  <button
                    type="button"
                    onClick={() => setFiltroTipo("todos")}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-small font-medium transition-all",
                      filtroTipo === "todos" ? "bg-card text-primary-700 shadow-sm" : "text-muted"
                    )}
                  >
                    Todos
                  </button>
                  {grupos.map(({ tipo }) => {
                    const Icone = TIPO_META[tipo].icone;
                    return (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => setFiltroTipo(tipo)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-small font-medium transition-all",
                          filtroTipo === tipo ? "bg-card text-primary-700 shadow-sm" : "text-muted"
                        )}
                      >
                        <Icone size={14} />
                        {TIPO_META[tipo].label}
                      </button>
                    );
                  })}
                </div>
              )}
              {gruposFiltrados.map(({ tipo, itens }) => {
                const Icone = TIPO_META[tipo].icone;
                const ehOperacao = TIPOS_OPERACAO.includes(tipo);
                const abaOperacao = abaPorTipo[tipo] ?? "vista";
                const verQuitadas = quitadasPorTipo[tipo] ?? false;
                const visiveis = ehOperacao
                  ? filtrarOperacoes(itens, abaOperacao, verQuitadas)
                  : itens.filter((i) => resgatado(i) === verResgatados);
                const totalResgatados = ehOperacao ? 0 : itens.filter(resgatado).length;
                const resumo = calcularResumo(ehOperacao ? itens.filter((i) => !estaQuitado(i)) : itens.filter((i) => !resgatado(i)), itens);
                const totalQuitadas = itens.filter((i) => estaQuitado(i)).length;
                return (
                  <div key={tipo} className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                        <Icone size={16} />
                      </span>
                      <h2 className="text-h3 text-foreground">{TIPO_META[tipo].label}</h2>
                      <span className="text-small text-muted">
                        {itens.length === 1 ? "1 investimento" : `${itens.length} investimentos`}
                      </span>
                      {ehOperacao && itens.some((i) => !estaQuitado(i)) && (
                        <Button size="sm" variant="tertiary" className="ml-auto" onClick={() => void abrirReceberVarias("")}>
                          <HandCoins size={16} />
                          Receber várias
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        className={ehOperacao && itens.some((i) => !estaQuitado(i)) ? undefined : "ml-auto"}
                        onClick={() => {
                          setTipoNovo(tipo as TipoInvestimento);
                          setModalAberto(true);
                        }}
                        aria-label={`Adicionar ${TIPO_META[tipo].label}`}
                      >
                        <Plus size={16} />
                        Adicionar
                      </Button>
                    </div>
                    {renderCartoesStats(resumo)}
                    {ehOperacao && (
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <AbasVistaParcelado
                          valor={abaOperacao}
                          onChange={(v) => setAbaPorTipo((m) => ({ ...m, [tipo]: v }))}
                          totalVista={itens.filter((i) => (i.forma_pagamento ?? "vista") === "vista" && estaQuitado(i) === verQuitadas).length}
                          totalParcelado={itens.filter((i) => i.forma_pagamento === "parcelado" && estaQuitado(i) === verQuitadas).length}
                        />
                        <FiltrosLista
                          semPeriodo
                          periodo={null}
                          onPeriodo={() => {}}
                          quitadas={verQuitadas}
                          onQuitadas={(v) => setQuitadasPorTipo((m) => ({ ...m, [tipo]: v }))}
                          totalQuitadas={totalQuitadas}
                        />
                      </div>
                    )}
                    {!ehOperacao && totalResgatados > 0 && (
                      <button
                        type="button"
                        onClick={() => setVerResgatados((v) => !v)}
                        className="self-start rounded-full border border-border px-3 py-1.5 text-small font-semibold text-foreground hover:bg-muted/10"
                      >
                        {verResgatados ? "Ver os que estão aplicados" : `Ver resgatados (${totalResgatados})`}
                      </button>
                    )}
                    {visiveis.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-border py-6 text-center text-small text-muted">
                        {verQuitadas && ehOperacao ? "Nenhuma operação quitada nesse filtro." : "Nada nesse filtro."}
                      </p>
                    ) : (
                      renderGradeCartoes(visiveis)
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <NovoInvestimentoModal
        aberto={modalAberto}
        tipoInicial={tipoNovo}
        onFechar={() => {
          setModalAberto(false);
          setTipoNovo(null);
        }}
        onSalvo={carregar}
      />

      {receberVarias && (
        <ReceberVariasDialog
          operacoes={receberVarias.operacoes}
          filtroInicial={receberVarias.filtro}
          salvando={salvandoVarias}
          onFechar={() => setReceberVarias(null)}
          onConfirmarManual={async ({ contaId, data, alocacoes }) => {
            if (!user) return;
            setSalvandoVarias(true);
            const r = await registrarRecebimentoVarias({ usuarioId: user.id, contaId, data, operacoes: receberVarias.operacoes, alocacoes });
            setSalvandoVarias(false);
            setReceberVarias(null);
            setAvisoVarias(
              r.falhas.length
                ? `Registrado ${r.ok} de ${r.ok + r.falhas.length}. Não deu: ${r.falhas.join("; ")}`
                : `Pronto: ${r.ok} ${r.ok === 1 ? "recebimento registrado" : "recebimentos registrados"} e lançados na carteira.`
            );
            await carregar();
          }}
        />
      )}

      {parcelaParaReceber && (
        <EscolherCarteiraDialog
          titulo={`Receber parcela ${parcelaParaReceber.numero}`}
          descricao={`${formatarMoeda(Number(parcelaParaReceber.valor))} — escolha a carteira onde o dinheiro entrou.`}
          salvando={salvandoAcao}
          onFechar={() => setParcelaParaReceber(null)}
          onConfirmar={async (contaId) => {
            const parcela = parcelaParaReceber;
            setParcelaParaReceber(null);
            await alternarParcela(parcela, contaId);
          }}
        />
      )}
    </Container>
  );
}
