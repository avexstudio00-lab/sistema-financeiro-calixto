"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle, Wallet, Plus, Filter, Lock, AlertTriangle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarTransacoes, contarTransacoesDoMes } from "@/lib/data/transacoes";
import { listarCategorias } from "@/lib/data/categorias";
import { listarMetas } from "@/lib/data/metas";
import { listarLimites } from "@/lib/data/limitesCategoria";
import { gerarLancamentosPendentes } from "@/lib/data/contasFixas";
import { listarEvolucaoMensal, type PontoEvolucaoMensal } from "@/lib/data/graficos";
import { LIMITE_TRANSACOES_GRATIS, nivelPlano } from "@/lib/planos";
import { agruparGastosPorCategoria, heatmapDoMes } from "@/lib/graficos-utils";
import { formatarMoeda } from "@/lib/format";
import { salvarCache, lerCache } from "@/lib/offline/cache";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import { useFilaPendente } from "@/lib/offline/useFilaPendente";
import { sincronizarFila } from "@/lib/offline/sincronizarFila";
import { NovaTransacaoModal } from "@/components/dashboard/NovaTransacaoModal";
import { BannerOffline } from "@/components/dashboard/BannerOffline";
import { FilaPendenteBanner } from "@/components/dashboard/FilaPendenteBanner";
import { Sparkline } from "@/components/dashboard/graficos/Sparkline";
import { AnelProgresso } from "@/components/dashboard/graficos/AnelProgresso";
import { HeatmapMensal } from "@/components/dashboard/graficos/HeatmapMensal";
import { GraficoDonutCategorias } from "@/components/dashboard/graficos/GraficoDonutCategorias";
import { GraficoRankingGastos } from "@/components/dashboard/graficos/GraficoRankingGastos";
import { GraficoColunasComparativo } from "@/components/dashboard/graficos/GraficoColunasComparativo";
import { GraficoLinhaEvolucao } from "@/components/dashboard/graficos/GraficoLinhaEvolucao";
import type { Categoria, Transacao, Meta, LimiteCategoria } from "@/lib/data/tipos";

const FORMAS_PAGAMENTO_FILTRO = [
  { id: "pix", label: "Pix" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "boleto", label: "Boleto" },
] as const;

function limitesDoMesAtual() {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString().slice(0, 10);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { inicio, fim };
}

function limitesDoPeriodo(periodo: "3meses" | "6meses") {
  const agora = new Date();
  const mesesAtras = periodo === "6meses" ? 5 : 2;
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - mesesAtras, 1).toISOString().slice(0, 10);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { inicio, fim };
}

/** O que fica salvo no cache offline desta tela (ver src/lib/offline/cache.ts). */
interface DadosCacheDashboard {
  transacoes: Transacao[];
  categorias: Categoria[];
  evolucaoMensal: PontoEvolucaoMensal[];
  limites: LimiteCategoria[];
}

/** Uma `Transacao` de verdade (já veio do servidor) ou o retrato de uma
 * anotação ainda esperando na fila offline pra ser enviada (ver
 * src/lib/offline/fila.ts) -- `__pendente` marca a segunda, pra tela saber
 * que ainda não dá pra editar/apagar e pra mostrar o selo "Aguardando
 * envio". */
type TransacaoExibida = Transacao & { __pendente?: boolean };

export default function DashboardPage() {
  const { user, perfil } = useAuth();
  const [transacoes, setTransacoes] = React.useState<Transacao[]>([]);
  const [categorias, setCategorias] = React.useState<Categoria[]>([]);
  const [evolucaoMensal, setEvolucaoMensal] = React.useState<PontoEvolucaoMensal[]>([]);
  const [metas, setMetas] = React.useState<Meta[]>([]);
  const [limites, setLimites] = React.useState<LimiteCategoria[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [modalAberto, setModalAberto] = React.useState(false);
  const [bloqueado, setBloqueado] = React.useState(false);
  const [transacaoEditando, setTransacaoEditando] = React.useState<Transacao | null>(null);

  // Modo offline: quando não dá pra buscar do servidor, mostra o último
  // "retrato" bom que a gente tinha salvo. `offlineDesde` guarda a hora
  // desse retrato — fica null quando a tela está com dado ao vivo.
  const online = useOnlineStatus();
  const [offlineDesde, setOfflineDesde] = React.useState<string | null>(null);

  const [filtroTipo, setFiltroTipo] = React.useState<"todos" | "receita" | "despesa">("todos");
  const [filtroCategoria, setFiltroCategoria] = React.useState("");
  const [filtroFormaPagamento, setFiltroFormaPagamento] = React.useState("");
  const [filtroPeriodo, setFiltroPeriodo] = React.useState<"mes" | "3meses" | "6meses">("mes");
  const [transacoesPeriodo, setTransacoesPeriodo] = React.useState<Transacao[] | null>(null);

  const nivel = perfil ? nivelPlano(perfil.plano) : 0;

  // Aplica na tela o último retrato salvo em cache (ver src/lib/offline/cache.ts).
  const aplicarCache = React.useCallback((chave: string) => {
    const cache = lerCache<DadosCacheDashboard>(chave);
    if (!cache) return false;
    setTransacoes(cache.dados.transacoes);
    setCategorias(cache.dados.categorias);
    setEvolucaoMensal(cache.dados.evolucaoMensal);
    setLimites(cache.dados.limites);
    setOfflineDesde(cache.salvoEm);
    return true;
  }, []);

  const carregar = React.useCallback(async () => {
    if (!user) return;
    const chaveCache = `dashboard:${user.id}`;

    // Sem internet: nem tenta buscar (ficaria pendurado ou voltaria vazio) —
    // já mostra direto o último retrato bom que a gente salvou.
    if (!navigator.onLine) {
      aplicarCache(chaveCache);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    // Lança automaticamente (se ainda não lançou este mês) as contas fixas
    // recorrentes cujo dia de vencimento já chegou -- ver
    // src/lib/data/contasFixas.ts e /dashboard/contas-fixas. Roda antes de
    // buscar as transações do mês, pra qualquer lançamento novo já aparecer
    // no painel nesta mesma carga.
    await gerarLancamentosPendentes(user.id);
    const { inicio, fim } = limitesDoMesAtual();
    const [lista, cats, evolucao, lims] = await Promise.all([
      listarTransacoes(user.id, { inicio, fim }),
      listarCategorias(user.id),
      listarEvolucaoMensal(user.id, 6, "pessoal"),
      listarLimites(user.id),
    ]);

    if (!navigator.onLine) {
      // A conexão caiu durante a busca — não troca o que já tava na tela por
      // um resultado incompleto; usa o retrato salvo em vez disso.
      aplicarCache(chaveCache);
      setCarregando(false);
      return;
    }

    setTransacoes(lista);
    setCategorias(cats);
    setEvolucaoMensal(evolucao);
    setLimites(lims);
    setOfflineDesde(null);
    salvarCache<DadosCacheDashboard>(chaveCache, {
      transacoes: lista,
      categorias: cats,
      evolucaoMensal: evolucao,
      limites: lims,
    });
    setCarregando(false);
  }, [user, aplicarCache]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  // Quando a internet volta depois de ter caído, primeiro tenta enviar as
  // anotações que ficaram guardadas na fila offline (ver
  // src/lib/offline/fila.ts) e só depois busca os dados de verdade de novo
  // — assim o painel já mostra o saldo certo, calculado pelo servidor, no
  // lugar do saldo "estimado" que a fila mostrava enquanto pendente. A
  // pessoa não precisa fazer nada disso na mão.
  const estavaOnline = React.useRef(online);
  React.useEffect(() => {
    if (!estavaOnline.current && online) {
      sincronizarFila().finally(() => carregar());
    }
    estavaOnline.current = online;
  }, [online, carregar]);

  // Cobre o caso comum no iPhone (sem sincronização automática em segundo
  // plano — ver seção 19 do contexto do projeto): a pessoa ficou offline,
  // anotou algo, fechou o app, e só reabriu depois já com internet de
  // volta. Roda uma vez ao montar a tela; se a fila estiver vazia ou sem
  // internet, `sincronizarFila` não faz nada.
  React.useEffect(() => {
    sincronizarFila().then((resultado) => {
      if (resultado.status === "ok" || resultado.status === "parcial") carregar();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!user || nivel < 1) return;
    listarMetas(user.id).then(setMetas);
  }, [user, nivel]);

  React.useEffect(() => {
    if (!user || nivel < 2 || filtroPeriodo === "mes") {
      setTransacoesPeriodo(null);
      return;
    }
    const { inicio, fim } = limitesDoPeriodo(filtroPeriodo);
    listarTransacoes(user.id, { inicio, fim }).then(setTransacoesPeriodo);
  }, [user, nivel, filtroPeriodo]);

  async function handleAbrirModal() {
    if (!user || !perfil) return;
    setTransacaoEditando(null);
    // Sem internet não dá pra conferir a contagem real do mês no servidor
    // -- deixa abrir sem bloquear (a anotação entra na fila offline e o
    // limite continua valendo normalmente na próxima vez que houver
    // conexão pra abrir o modal).
    if (perfil.plano === "gratis" && navigator.onLine) {
      const { inicio, fim } = limitesDoMesAtual();
      const total = await contarTransacoesDoMes(user.id, inicio, fim);
      setBloqueado(total >= LIMITE_TRANSACOES_GRATIS);
    } else {
      setBloqueado(false);
    }
    setModalAberto(true);
  }

  function handleEditarTransacao(transacao: TransacaoExibida) {
    // Anotação ainda pendente de sincronizar não existe de verdade no
    // servidor ainda -- não dá pra editar/apagar ela até enviar (ver
    // FilaPendenteBanner pra reenviar ou apagar da fila).
    if (transacao.__pendente) return;
    setTransacaoEditando(transacao);
    setBloqueado(false);
    setModalAberto(true);
  }

  function handleFecharModal() {
    setModalAberto(false);
    setTransacaoEditando(null);
  }

  function handleCategoriaGraficoClick(id: string) {
    if (id === "sem-categoria") return;
    setFiltroCategoria((atual) => (atual === id ? "" : id));
  }

  // Anotações feitas sem internet e ainda não enviadas (ver
  // src/lib/offline/fila.ts) -- convertidas pro mesmo formato de uma
  // Transacao de verdade, só pra aparecerem na lista e no saldo com o selo
  // "Aguardando envio" enquanto isso. Some da fila (e passa a vir do
  // servidor como as outras) assim que `sincronizarFila` conseguir enviar.
  const filaPendente = useFilaPendente();
  const transacoesPendentesExibicao: TransacaoExibida[] = filaPendente
    .filter((item) => item.dados.usuario_id === user?.id && item.dados.tipo_negocio !== "negocio")
    .map((item) => ({
      id: `pendente:${item.idLocal}`,
      usuario_id: item.dados.usuario_id,
      conta_id: item.dados.conta_id,
      categoria_id: item.dados.categoria_id,
      tipo: item.dados.tipo,
      valor: item.dados.valor,
      descricao: item.dados.descricao,
      data: item.dados.data,
      forma_pagamento: item.dados.forma_pagamento,
      tipo_negocio: item.dados.tipo_negocio,
      is_recorrente: false,
      recorrencia: null,
      conta_fixa_id: null,
      divida_id: item.dados.divida_id ?? null,
      categorias: categorias.find((c) => c.id === item.dados.categoria_id) ?? null,
      __pendente: true,
    }));

  // O Painel pessoal só mostra dados pessoais — o "sem tipo" cobre lançamentos
  // antigos sem tipo_negocio definido; tudo do negócio vive em "Minha empresa".
  // Pendentes entram primeiro (são sempre "agora") e somam no saldo/totais
  // abaixo igual a uma anotação já confirmada.
  const transacoesPessoais: TransacaoExibida[] = [
    ...transacoesPendentesExibicao,
    ...transacoes.filter((t) => t.tipo_negocio !== "negocio"),
  ];

  const entradas = transacoesPessoais.filter((t) => t.tipo === "receita").reduce((acc, t) => acc + Number(t.valor), 0);
  const saidas = transacoesPessoais.filter((t) => t.tipo === "despesa").reduce((acc, t) => acc + Number(t.valor), 0);
  const saldo = entradas - saidas;

  // Alerta de orçamento (ver /dashboard/orcamento): categorias com limite
  // mensal definido cujo gasto do mês já está em 80% ou mais do limite.
  const alertasOrcamento = React.useMemo(() => {
    if (limites.length === 0) return [];
    const gastoPorCategoria = new Map<string, number>();
    for (const t of transacoesPessoais) {
      if (t.tipo !== "despesa" || !t.categoria_id) continue;
      gastoPorCategoria.set(t.categoria_id, (gastoPorCategoria.get(t.categoria_id) ?? 0) + Number(t.valor));
    }
    return limites
      .map((l) => {
        const gasto = gastoPorCategoria.get(l.categoria_id) ?? 0;
        const nome = categorias.find((c) => c.id === l.categoria_id)?.nome ?? "Categoria";
        return { nome, gasto, limite: Number(l.limite_mensal), percentual: (gasto / Number(l.limite_mensal)) * 100 };
      })
      .filter((a) => a.percentual >= 80)
      .sort((a, b) => b.percentual - a.percentual);
  }, [limites, transacoesPessoais, categorias]);

  const transacoesFiltradas = transacoesPessoais.filter((t) => {
    if (filtroTipo !== "todos" && t.tipo !== filtroTipo) return false;
    if (filtroCategoria && t.categoria_id !== filtroCategoria) return false;
    if (nivel >= 2 && filtroFormaPagamento && t.forma_pagamento !== filtroFormaPagamento) return false;
    return true;
  });

  const fatiasCategorias = React.useMemo(() => {
    const origem = (transacoesPeriodo ?? transacoes).filter((t) => t.tipo_negocio !== "negocio");
    const porForma = filtroFormaPagamento ? origem.filter((t) => t.forma_pagamento === filtroFormaPagamento) : origem;
    return agruparGastosPorCategoria(porForma);
  }, [transacoesPeriodo, transacoes, filtroFormaPagamento]);

  const totalGastosCategoria = React.useMemo(
    () => fatiasCategorias.reduce((acc, f) => acc + f.valor, 0),
    [fatiasCategorias]
  );

  const colunasComparativo = evolucaoMensal.slice(-2);
  const linhaSaldo = React.useMemo(
    () => evolucaoMensal.map((p) => ({ mes: p.mes, valor: p.saldo })),
    [evolucaoMensal]
  );

  const diasHeatmap = React.useMemo(() => {
    if (nivel < 2) return [];
    const agora = new Date();
    return heatmapDoMes(transacoesPessoais, agora.getFullYear(), agora.getMonth() + 1);
  }, [nivel, transacoesPessoais]);

  const metaDestaque = React.useMemo(() => {
    if (metas.length === 0) return null;
    const emAndamento = metas.filter((m) => m.status !== "concluida");
    const lista = emAndamento.length > 0 ? emAndamento : metas;
    return [...lista].sort(
      (a, b) => Number(a.valor_atual) / Number(a.valor_meta) - Number(b.valor_atual) / Number(b.valor_meta)
    )[lista.length - 1];
  }, [metas]);

  const agora = new Date();

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Olá, {perfil?.nome.split(" ")[0]} 👋</h1>
          <p className="text-body text-muted">Aqui está o resumo do seu mês.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={handleAbrirModal} className="hidden sm:inline-flex">
            <Plus size={18} />
            Anotar gasto ou receita
          </Button>
        </div>
      </div>

      {offlineDesde && <BannerOffline salvoEm={offlineDesde} />}
      <FilaPendenteBanner aoSincronizar={carregar} />

      {alertasOrcamento.length > 0 && (
        <Link href="/dashboard/orcamento">
          <Card className="flex flex-wrap items-center gap-3 border-amber-200 bg-amber-50 transition-colors hover:bg-amber-100">
            <AlertTriangle size={20} className="shrink-0 text-amber-600" />
            <p className="text-body text-amber-900">
              {alertasOrcamento.length === 1 ? (
                <>
                  <strong>{alertasOrcamento[0].nome}</strong> já está em{" "}
                  {Math.round(alertasOrcamento[0].percentual)}% do limite mensal.
                </>
              ) : (
                <>
                  <strong>{alertasOrcamento.length} categorias</strong> estão perto (ou já passaram) do limite mensal —
                  toque para ver.
                </>
              )}
            </p>
          </Card>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ArrowUpCircle size={18} className="text-primary-500" />
            <p className="text-small text-muted">Entradas</p>
          </div>
          <p className="text-h2 text-primary-500">{formatarMoeda(entradas)}</p>
          {evolucaoMensal.length > 1 && (
            <Sparkline dados={evolucaoMensal.map((p) => p.entradas)} cor="#10b981" />
          )}
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ArrowDownCircle size={18} className="text-red-500" />
            <p className="text-small text-muted">Saídas</p>
          </div>
          <p className="text-h2 text-red-500">{formatarMoeda(saidas)}</p>
          {evolucaoMensal.length > 1 && (
            <Sparkline dados={evolucaoMensal.map((p) => p.saidas)} cor="#ef4444" />
          )}
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Wallet size={18} className="text-secondary" />
            <p className="text-small text-muted">Saldo do mês</p>
          </div>
          <p className="text-h2 text-secondary">{formatarMoeda(saldo)}</p>
          {evolucaoMensal.length > 1 && (
            <Sparkline dados={evolucaoMensal.map((p) => p.saldo)} cor="#14b8a6" />
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h3 text-foreground">Visão geral</h2>
          {nivel >= 2 && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filtroPeriodo}
                onChange={(e) => setFiltroPeriodo(e.target.value as typeof filtroPeriodo)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-small text-foreground"
              >
                <option value="mes">Este mês</option>
                <option value="3meses">Últimos 3 meses</option>
                <option value="6meses">Últimos 6 meses</option>
              </select>
              <select
                value={filtroFormaPagamento}
                onChange={(e) => setFiltroFormaPagamento(e.target.value)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-small text-foreground"
              >
                <option value="">Todas as formas</option>
                {FORMAS_PAGAMENTO_FILTRO.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card padding="lg">
            <h3 className="mb-4 text-body font-semibold text-foreground">Para onde foi o dinheiro</h3>
            <GraficoDonutCategorias
              dados={fatiasCategorias}
              total={totalGastosCategoria}
              interativo={nivel >= 2}
              categoriaAtiva={filtroCategoria || undefined}
              onFatiaClick={handleCategoriaGraficoClick}
            />
          </Card>
          <Card padding="lg">
            <h3 className="mb-4 text-body font-semibold text-foreground">Maiores gastos</h3>
            <GraficoRankingGastos
              dados={fatiasCategorias}
              interativo={nivel >= 2}
              categoriaAtiva={filtroCategoria || undefined}
              onCategoriaClick={handleCategoriaGraficoClick}
            />
          </Card>
        </div>

        {nivel >= 1 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card padding="lg">
              <h3 className="mb-4 text-body font-semibold text-foreground">
                Entradas x saídas (mês atual e anterior)
              </h3>
              <GraficoColunasComparativo dados={colunasComparativo} interativo={nivel >= 2} />
            </Card>
            <Card padding="lg">
              <h3 className="mb-4 text-body font-semibold text-foreground">Evolução do saldo</h3>
              <GraficoLinhaEvolucao dados={linhaSaldo} cor="#14b8a6" rotulo="Saldo" interativo={nivel >= 2} />
            </Card>
          </div>
        )}

        {nivel >= 1 && metaDestaque && (
          <Card
            padding="lg"
            className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-4">
              <AnelProgresso
                percentual={(Number(metaDestaque.valor_atual) / Number(metaDestaque.valor_meta)) * 100}
                tamanho={72}
                espessura={8}
              />
              <div>
                <p className="text-small text-muted">Meta em destaque</p>
                <p className="text-body font-semibold text-foreground">{metaDestaque.nome}</p>
                <p className="text-small text-muted">
                  {formatarMoeda(Number(metaDestaque.valor_atual))} de{" "}
                  {formatarMoeda(Number(metaDestaque.valor_meta))}
                </p>
              </div>
            </div>
            <Link href="/dashboard/metas">
              <Button variant="tertiary">Ver metas</Button>
            </Link>
          </Card>
        )}

        {nivel >= 2 && (
          <Card padding="lg">
            <h3 className="mb-4 text-body font-semibold text-foreground">Mapa de gastos do mês</h3>
            <HeatmapMensal dias={diasHeatmap} ano={agora.getFullYear()} mesNumero={agora.getMonth() + 1} />
          </Card>
        )}

        {nivel < 2 && (
          <Card
            padding="md"
            className="flex flex-col items-start gap-3 border-dashed sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Lock size={18} />
              </span>
              <p className="text-small text-muted">
                {nivel === 0
                  ? "Desbloqueie comparativos, evolução do saldo e metas no plano Mensal."
                  : "Desbloqueie o mapa de gastos e filtros interativos no plano Completo ou Avançado."}
              </p>
            </div>
            <Link href="/dashboard/plano">
              <Button variant="tertiary" size="sm">
                Ver planos
              </Button>
            </Link>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h3 text-foreground">Lançamentos do mês</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Filter size={16} className="text-muted" />
            <div className="flex gap-1">
              {(["todos", "receita", "despesa"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltroTipo(f)}
                  className={`rounded-full px-3 py-1.5 text-small font-medium transition-colors ${
                    filtroTipo === f ? "bg-primary-50 text-primary-700" : "text-muted hover:bg-muted/10"
                  }`}
                >
                  {f === "todos" ? "Todos" : f === "receita" ? "Entradas" : "Saídas"}
                </button>
              ))}
            </div>
            {categorias.length > 0 && (
              <select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-small text-foreground"
              >
                <option value="">Todas categorias</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {carregando ? (
          <p className="py-8 text-center text-body text-muted">Carregando...</p>
        ) : transacoesFiltradas.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-body text-muted">
              Nenhuma anotação ainda. Que tal registrar seu primeiro gasto ou receita?
            </p>
            <Button onClick={handleAbrirModal}>
              <Plus size={18} />
              Anotar agora
            </Button>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {transacoesFiltradas.map((t) => (
              <Card
                key={t.id}
                padding="sm"
                onClick={() => handleEditarTransacao(t)}
                className={`flex flex-wrap items-center justify-between gap-4 transition-colors ${
                  t.__pendente ? "opacity-70" : "cursor-pointer hover:bg-muted/5"
                }`}
              >
                {/* `min-w-0` no bloco ícone+texto é o que deixa a descrição
                    (texto livre, digitado pelo usuário) quebrar linha dentro
                    do próprio espaço em vez de forçar a linha inteira a ficar
                    mais larga que a tela -- mesma causa raiz já documentada
                    no projeto (seção 23: item flex sem `min-width` não
                    encolhe, e o excesso é cortado pelo `overflow-x: hidden`
                    global). */}
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      t.tipo === "receita" ? "bg-primary-50 text-primary-600" : "bg-rose-50 text-red-500"
                    }`}
                >
                    {t.tipo === "receita" ? <ArrowUpCircle size={18} /> : <ArrowDownCircle size={18} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-body font-medium text-foreground">{t.descricao}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-small text-muted">
                        {new Date(t.data + "T00:00:00").toLocaleDateString("pt-BR")}
                      </p>
                      {t.__pendente && (
                        <Badge variant="neutral" size="sm">
                          Aguardando envio
                        </Badge>
                      )}
                      {t.categorias?.nome && (
                        <Badge variant="neutral" size="sm">
                          {t.categorias.nome}
                        </Badge>
                      )}
                      {t.tipo_negocio && (
                        <Badge variant={t.tipo_negocio === "negocio" ? "accent" : "neutral"} size="sm">
                          {t.tipo_negocio === "negocio" ? "Negócio" : "Pessoal"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <p
                  className={`shrink-0 text-body font-semibold ${t.tipo === "receita" ? "text-primary-600" : "text-red-500"}`}
                >
                  {t.tipo === "receita" ? "+" : "-"}
                  {formatarMoeda(Number(t.valor))}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* "bottom-24" em vez de "bottom-6": esse botão flutuante é anterior à
          barra fixa de navegação do rodapé (MobileTabBar, ver seção 22 do
          contexto do projeto) -- com "bottom-6" ele ficava embaixo demais e
          acabava sobrepondo o botão "Mais" da barra nova. 24 (96px) sobra
          espaço mesmo em aparelhos com área segura maior (notch/indicador
          home do iPhone). */}
      <button
        type="button"
        onClick={handleAbrirModal}
        aria-label="Anotar gasto ou receita"
        className="fixed bottom-24 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-white shadow-card-hover transition-transform hover:scale-105 sm:hidden"
      >
        <Plus size={26} />
      </button>

      <NovaTransacaoModal
        aberto={modalAberto}
        bloqueado={bloqueado}
        transacaoEditando={transacaoEditando}
        mundo="pessoal"
        onFechar={handleFecharModal}
        onSalvo={carregar}
      />
    </Container>
  );
}
