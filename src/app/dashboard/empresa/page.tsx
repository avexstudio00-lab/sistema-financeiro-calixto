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
import { salvarCache, lerCache } from "@/lib/offline/cache";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import { useFilaPendente } from "@/lib/offline/useFilaPendente";
import { sincronizarFila } from "@/lib/offline/sincronizarFila";
import { NovaTransacaoModal } from "@/components/dashboard/NovaTransacaoModal";
import { BannerOffline } from "@/components/dashboard/BannerOffline";
import { FilaPendenteBanner } from "@/components/dashboard/FilaPendenteBanner";
import type { Transacao, Produto, ContaPagar, ContaReceber } from "@/lib/data/tipos";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** O que fica salvo no cache offline desta tela, por mês (ver
 * src/lib/offline/cache.ts) -- se a pessoa navegar pra outro mês enquanto
 * offline, não tem cache daquele mês específico e a tela fica igual a hoje
 * (sem dado nenhum), em vez de mostrar o mês errado como se fosse o atual. */
interface DadosCacheEmpresa {
  resumo: ResumoEmpresa;
  lancamentos: Transacao[];
  produtos: Produto[];
  contasPagar: ContaPagar[];
  contasReceber: ContaReceber[];
}

/** Um lançamento de verdade (já veio do servidor) ou o retrato de uma
 * anotação ainda esperando na fila offline pra ser enviada (ver
 * src/lib/offline/fila.ts). */
type TransacaoExibida = Transacao & { __pendente?: boolean };

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
  const { perfil, papel, negocio } = useAuth();
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

  // Modo offline: quando não dá pra buscar do servidor, mostra o último
  // retrato bom que a gente tinha salvo pra aquele mês específico (ver
  // DadosCacheEmpresa acima). `offlineDesde` guarda a hora desse retrato.
  const online = useOnlineStatus();
  const [offlineDesde, setOfflineDesde] = React.useState<string | null>(null);

  const ehFuncionario = papel === "funcionario";

  const aplicarCache = React.useCallback((chave: string) => {
    const cache = lerCache<DadosCacheEmpresa>(chave);
    if (!cache) return false;
    setResumo(cache.dados.resumo);
    setLancamentos(cache.dados.lancamentos);
    setProdutos(cache.dados.produtos);
    setContasPagar(cache.dados.contasPagar);
    setContasReceber(cache.dados.contasReceber);
    setOfflineDesde(cache.salvoEm);
    return true;
  }, []);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;

    // Funcionário não tem acesso ao financeiro do negócio (contas a pagar/
    // receber e o extrato de transações ficam bloqueados pelo RLS) — só
    // busca o que ele pode ver de fato, que é o estoque (pro alerta de
    // estoque baixo). O resumo financeiro fica reservado pra dono/sócio.
    // Sem cache offline por ora (fora do escopo desta parte).
    if (ehFuncionario) {
      setCarregando(true);
      setProdutos(await listarProdutos(negocio.usuarioId));
      setResumo(null);
      setLancamentos([]);
      setContasPagar([]);
      setContasReceber([]);
      setCarregando(false);
      return;
    }

    const chaveCache = `empresa-painel:${negocio.usuarioId}:${ano}-${String(mes).padStart(2, "0")}`;

    if (!navigator.onLine) {
      aplicarCache(chaveCache);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    const inicio = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
    const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
    const [res, lista, listaProdutos, listaPagar, listaReceber] = await Promise.all([
      gerarResumoEmpresa(negocio.usuarioId, ano, mes),
      listarTransacoes(negocio.usuarioId, { inicio, fim }),
      listarProdutos(negocio.usuarioId),
      listarContasPagar(negocio.usuarioId),
      listarContasReceber(negocio.usuarioId),
    ]);

    if (!navigator.onLine) {
      aplicarCache(chaveCache);
      setCarregando(false);
      return;
    }

    const lancamentosNegocio = lista.filter((t) => t.tipo_negocio === "negocio").slice(0, 8);
    setResumo(res);
    setLancamentos(lancamentosNegocio);
    setProdutos(listaProdutos);
    setContasPagar(listaPagar);
    setContasReceber(listaReceber);
    setOfflineDesde(null);
    salvarCache<DadosCacheEmpresa>(chaveCache, {
      resumo: res,
      lancamentos: lancamentosNegocio,
      produtos: listaProdutos,
      contasPagar: listaPagar,
      contasReceber: listaReceber,
    });
    setCarregando(false);
  }, [negocio, ehFuncionario, ano, mes, aplicarCache]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  // Mesmo padrão do painel pessoal (ver seção 19 do contexto do projeto):
  // ao reconectar, tenta enviar a fila offline primeiro e só depois busca
  // os dados reais de novo; ao abrir a tela já online com a fila cheia
  // (ex: reabriu o app no iPhone depois de ter ficado offline), tenta
  // sincronizar uma vez ao montar.
  const estavaOnline = React.useRef(online);
  React.useEffect(() => {
    if (!estavaOnline.current && online) {
      sincronizarFila().finally(() => carregar());
    }
    estavaOnline.current = online;
  }, [online, carregar]);

  React.useEffect(() => {
    sincronizarFila().then((resultado) => {
      if (resultado.status === "ok" || resultado.status === "parcial") carregar();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Anotações do negócio feitas sem internet, ainda não enviadas (ver
  // src/lib/offline/fila.ts) -- aparecem na lista com o selo "Aguardando
  // envio", mas não entram nos cards de resumo (faturamento/custos/lucro),
  // que são calculados pelo servidor e só batem certo depois de sincronizar.
  const filaPendente = useFilaPendente();
  const lancamentosPendentesExibicao: TransacaoExibida[] = negocio
    ? filaPendente
        .filter((item) => item.dados.tipo_negocio === "negocio" && item.dados.usuario_id === negocio.usuarioId)
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
          categorias: null,
          __pendente: true,
        }))
    : [];
  const lancamentosExibidos: TransacaoExibida[] = [...lancamentosPendentesExibicao, ...lancamentos];

  // Funcionário não vê o financeiro do negócio (faturamento, custos, contas
  // a pagar/receber) — só estoque e vendas, então essa página mostra uma
  // versão bem mais enxuta, focada nisso, em vez do painel financeiro
  // completo que dono e sócio veem.
  if (ehFuncionario) {
    return (
      <Container full className="flex flex-col gap-8 py-8">
        <div>
          <h1 className="text-h2 text-foreground">Painel da empresa</h1>
          <p className="text-body text-muted">
            {negocio?.nome ? `Você está na empresa de ${negocio.nome.split(" ")[0]}.` : "Bem-vindo(a)."}
          </p>
        </div>

        {!carregando && produtosBaixos.length > 0 && (
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/dashboard/empresa/vendas">
            <Card variant="interactive" className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
                <Receipt size={20} />
              </span>
              <div>
                <p className="text-body font-medium text-foreground">Vendas</p>
                <p className="text-small text-muted">Registrar e acompanhar vendas</p>
              </div>
            </Card>
          </Link>
          <Link href="/dashboard/empresa/produtos">
            <Card variant="interactive" className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
                <PackageX size={20} />
              </span>
              <div>
                <p className="text-body font-medium text-foreground">Estoque</p>
                <p className="text-small text-muted">Ver e ajustar produtos</p>
              </div>
            </Card>
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Painel da empresa</h1>
          <p className="text-body text-muted">
            {papel === "socio" && negocio?.nome
              ? `Como está indo a empresa de ${negocio.nome.split(" ")[0]}, ${perfil?.nome.split(" ")[0]}.`
              : `Como está indo o seu negócio, ${perfil?.nome.split(" ")[0]}.`}
          </p>
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

      {offlineDesde && <BannerOffline salvoEm={offlineDesde} />}
      <FilaPendenteBanner aoSincronizar={carregar} />

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
            {lancamentosExibidos.length === 0 ? (
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
                {lancamentosExibidos.map((t) => (
                  <Card
                    key={t.id}
                    padding="sm"
                    className={`flex items-center justify-between gap-4 ${t.__pendente ? "opacity-70" : ""}`}
                  >
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

      {/* "bottom-24" em vez de "bottom-6": esse botão flutuante é anterior à
          barra fixa de navegação do rodapé (MobileTabBar, ver seção 22 do
          contexto do projeto) -- com "bottom-6" ele ficava embaixo demais e
          acabava sobrepondo o botão "Mais" da barra nova. 24 (96px) sobra
          espaço mesmo em aparelhos com área segura maior (notch/indicador
          home do iPhone). */}
      <button
        type="button"
        onClick={() => setModalAberto(true)}
        aria-label="Anotar gasto ou receita do negócio"
        className="fixed bottom-24 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-white shadow-card-hover transition-transform hover:scale-105 sm:hidden"
      >
        <Plus size={26} />
      </button>

      <NovaTransacaoModal aberto={modalAberto} mundo="negocio" onFechar={() => setModalAberto(false)} onSalvo={carregar} />
    </Container>
  );
}
