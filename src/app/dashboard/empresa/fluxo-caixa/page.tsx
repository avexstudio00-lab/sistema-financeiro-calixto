"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ArrowLeftRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/lib/auth/AuthProvider";
import { gerarFluxoCaixa, type ResumoFluxoCaixa } from "@/lib/data/empresa";
import { buscarCategoriaPadraoPorNome } from "@/lib/data/categorias";
import { buscarConfigNegocio, type ConfigNegocio } from "@/lib/data/configNegocio";
import { ConfigProLabore } from "@/components/dashboard/ConfigProLabore";
import { formatarMoeda } from "@/lib/format";
import { salvarCache, lerCache } from "@/lib/offline/cache";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";
import { sincronizarFila } from "@/lib/offline/sincronizarFila";
import { NovaTransacaoModal } from "@/components/dashboard/NovaTransacaoModal";
import { BannerOffline } from "@/components/dashboard/BannerOffline";
import { FilaPendenteBanner } from "@/components/dashboard/FilaPendenteBanner";
import type { Categoria } from "@/lib/data/tipos";

/** O que fica salvo no cache offline desta tela, por mês (mesmo motivo do
 * painel da empresa: não mistura dado de um mês com o retrato salvo de
 * outro -- ver src/lib/offline/cache.ts). */
interface DadosCacheFluxoCaixa {
  fluxo: ResumoFluxoCaixa;
  categoriaProLabore: Categoria | null;
  /** Opcional: retratos salvos antes do item 4.4 (03/out/2026) não têm. */
  config?: ConfigNegocio;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function FluxoCaixaPage() {
  const { papel, negocio } = useAuth();
  const router = useRouter();
  const hoje = new Date();
  const [mes, setMes] = React.useState(hoje.getMonth() + 1);
  const [ano, setAno] = React.useState(hoje.getFullYear());
  const [fluxo, setFluxo] = React.useState<ResumoFluxoCaixa | null>(null);
  const [categoriaProLabore, setCategoriaProLabore] = React.useState<Categoria | null>(null);
  const [config, setConfig] = React.useState<ConfigNegocio | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  // Spinner só na 1ª carga ou ao trocar de mês; recarregar depois de
  // salvar é silencioso, sem pular pro topo (05/out/2026).
  const chaveCarregadaRef = React.useRef<string | null>(null);
  const [modalAberto, setModalAberto] = React.useState(false);

  // Mesmo padrão de cache das outras telas do modo offline (ver seção 19 do
  // contexto do projeto) -- guarda o último retrato bom por mês.
  const online = useOnlineStatus();
  const [offlineDesde, setOfflineDesde] = React.useState<string | null>(null);

  // Fluxo de caixa é financeiro do negócio — escondido de funcionário,
  // igual DAS/impostos e contas a pagar/receber (RLS já bloqueia no banco).
  React.useEffect(() => {
    if (papel === "funcionario") router.replace("/dashboard/empresa");
  }, [papel, router]);

  const aplicarCache = React.useCallback((chave: string) => {
    const cache = lerCache<DadosCacheFluxoCaixa>(chave);
    if (!cache) return false;
    setFluxo(cache.dados.fluxo);
    setCategoriaProLabore(cache.dados.categoriaProLabore);
    if (cache.dados.config) setConfig(cache.dados.config);
    setOfflineDesde(cache.salvoEm);
    return true;
  }, []);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    const chaveCache = `fluxo-caixa:${negocio.usuarioId}:${ano}-${String(mes).padStart(2, "0")}`;

    if (!navigator.onLine) {
      aplicarCache(chaveCache);
      setCarregando(false);
      return;
    }

    if (chaveCarregadaRef.current !== chaveCache) setCarregando(true);
    chaveCarregadaRef.current = chaveCache;
    const [res, cat, cfg] = await Promise.all([
      gerarFluxoCaixa(negocio.usuarioId, ano, mes),
      buscarCategoriaPadraoPorNome("Pró-labore", "despesa"),
      buscarConfigNegocio(negocio.usuarioId),
    ]);

    if (!navigator.onLine) {
      aplicarCache(chaveCache);
      setCarregando(false);
      return;
    }

    setFluxo(res);
    setCategoriaProLabore(cat);
    setConfig(cfg);
    setOfflineDesde(null);
    salvarCache<DadosCacheFluxoCaixa>(chaveCache, { fluxo: res, categoriaProLabore: cat, config: cfg });
    setCarregando(false);
  }, [negocio, ano, mes, aplicarCache]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

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

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Fluxo de caixa</h1>
          <p className="text-body text-muted">O dinheiro da empresa, separado do seu dinheiro pessoal.</p>
        </div>
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
      </div>

      {offlineDesde && <BannerOffline salvoEm={offlineDesde} />}
      <FilaPendenteBanner aoSincronizar={carregar} />

      {carregando || !fluxo ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : (
        <>
          <Card padding="lg" className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <ArrowLeftRight size={20} className="text-accent-600" />
              <h2 className="text-h3 text-foreground">Resumo do mês</h2>
            </div>
            <p className="text-body leading-relaxed text-foreground">
              A empresa faturou <strong className="text-accent-600">{formatarMoeda(fluxo.faturamento)}</strong>,
              gastou <strong className="text-red-500">{formatarMoeda(fluxo.gastosOperacionais)}</strong> e sobrou{" "}
              <strong className={fluxo.sobrou >= 0 ? "text-primary-600" : "text-red-500"}>
                {formatarMoeda(fluxo.sobrou)}
              </strong>
              .{" "}
              {config && !config.retira_pro_labore ? (
                <>
                  Os sócios retiraram <strong className="text-secondary">{formatarMoeda(fluxo.retiradaProLabore)}</strong>{" "}
                  (sem pró-labore fixo).
                </>
              ) : (
                <>
                  Você retirou <strong className="text-secondary">{formatarMoeda(fluxo.retiradaProLabore)}</strong> de
                  pró-labore.
                </>
              )}
            </p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Faturou</p>
              <p className="text-h3 text-accent-600">{formatarMoeda(fluxo.faturamento)}</p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Gastou (operacional)</p>
              <p className="text-h3 text-red-500">{formatarMoeda(fluxo.gastosOperacionais)}</p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">
                {config && !config.retira_pro_labore ? "Retiradas dos sócios" : "Pró-labore retirado"}
              </p>
              <p className="text-h3 text-secondary">{formatarMoeda(fluxo.retiradaProLabore)}</p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Sobrou no caixa</p>
              <p className={`text-h3 ${fluxo.sobrou >= 0 ? "text-primary-600" : "text-red-500"}`}>
                {formatarMoeda(fluxo.sobrou)}
              </p>
            </Card>
          </div>

          {config && (
            <ConfigProLabore
              config={config}
              retiradoNoMes={fluxo.retiradaProLabore}
              sobrou={fluxo.sobrou}
              podeEditar={online && papel !== "funcionario"}
              onSalvo={setConfig}
              onRegistrarRetirada={() => setModalAberto(true)}
            />
          )}
        </>
      )}

      <NovaTransacaoModal
        aberto={modalAberto}
        mundo="negocio"
        categoriaIdInicial={categoriaProLabore?.id}
        onFechar={() => setModalAberto(false)}
        onSalvo={carregar}
      />
    </Container>
  );
}
