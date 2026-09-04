"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ArrowLeftRight, HandCoins, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { gerarFluxoCaixa, type ResumoFluxoCaixa } from "@/lib/data/empresa";
import { buscarCategoriaPadraoPorNome } from "@/lib/data/categorias";
import { formatarMoeda } from "@/lib/format";
import { NovaTransacaoModal } from "@/components/dashboard/NovaTransacaoModal";
import type { Categoria } from "@/lib/data/tipos";

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
  const [carregando, setCarregando] = React.useState(true);
  const [modalAberto, setModalAberto] = React.useState(false);

  // Fluxo de caixa é financeiro do negócio — escondido de funcionário,
  // igual DAS/impostos e contas a pagar/receber (RLS já bloqueia no banco).
  React.useEffect(() => {
    if (papel === "funcionario") router.replace("/dashboard/empresa");
  }, [papel, router]);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    setCarregando(true);
    const [res, cat] = await Promise.all([
      gerarFluxoCaixa(negocio.usuarioId, ano, mes),
      buscarCategoriaPadraoPorNome("Pró-labore", "despesa"),
    ]);
    setFluxo(res);
    setCategoriaProLabore(cat);
    setCarregando(false);
  }, [negocio, ano, mes]);

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

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
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
              . Você retirou <strong className="text-secondary">{formatarMoeda(fluxo.retiradaProLabore)}</strong> de
              pró-labore.
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
              <p className="text-small text-muted">Pró-labore retirado</p>
              <p className="text-h3 text-secondary">{formatarMoeda(fluxo.retiradaProLabore)}</p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Sobrou no caixa</p>
              <p className={`text-h3 ${fluxo.sobrou >= 0 ? "text-primary-600" : "text-red-500"}`}>
                {formatarMoeda(fluxo.sobrou)}
              </p>
            </Card>
          </div>

          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <HandCoins size={20} />
              </span>
              <div>
                <p className="text-body font-medium text-foreground">Vai retirar pró-labore esse mês?</p>
                <p className="text-small text-muted">Registre como um gasto do negócio na categoria Pró-labore.</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setModalAberto(true)}>
              <Plus size={18} />
              Registrar retirada
            </Button>
          </Card>
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
