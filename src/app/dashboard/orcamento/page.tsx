"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, PiggyBank, Trash2, Wand2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CriarCategoriaInline } from "@/components/dashboard/CriarCategoriaInline";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarCategorias } from "@/lib/data/categorias";
import { listarTransacoes } from "@/lib/data/transacoes";
import { listarLimites, definirLimite, removerLimite } from "@/lib/data/limitesCategoria";
import { formatarMoeda } from "@/lib/format";
import type { Categoria, LimiteCategoria } from "@/lib/data/tipos";

function limitesDoMesAtual() {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString().slice(0, 10);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { inicio, fim };
}

/** Os 3 meses completos anteriores ao atual (base da sugestão 6.8). */
function limitesTresMesesAnteriores() {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - 3, 1).toISOString().slice(0, 10);
  const fim = new Date(agora.getFullYear(), agora.getMonth(), 0).toISOString().slice(0, 10);
  return { inicio, fim };
}

/** Média + 5% de folga, arredondada pra cima em múltiplos de R$ 10. */
function sugerirLimite(media: number): number {
  return Math.max(10, Math.ceil((media * 1.05) / 10) * 10);
}

const INPUT_CLASSE =
  "h-11 w-32 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100";

export default function OrcamentoPage() {
  const { user } = useAuth();
  const [categorias, setCategorias] = React.useState<Categoria[]>([]);
  const [limites, setLimites] = React.useState<LimiteCategoria[]>([]);
  const [gastoPorCategoria, setGastoPorCategoria] = React.useState<Map<string, number>>(new Map());
  const [carregando, setCarregando] = React.useState(true);
  const [rascunho, setRascunho] = React.useState<Record<string, string>>({});
  const [salvando, setSalvando] = React.useState<string | null>(null);
  const [mediaPorCategoria, setMediaPorCategoria] = React.useState<Map<string, number>>(new Map());
  const [aplicandoSugestoes, setAplicandoSugestoes] = React.useState(false);

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    const { inicio, fim } = limitesDoMesAtual();
    const anteriores = limitesTresMesesAnteriores();
    const [cats, lims, transacoesMes, transacoesAnteriores] = await Promise.all([
      listarCategorias(user.id),
      listarLimites(user.id),
      listarTransacoes(user.id, { inicio, fim, tipo: "despesa" }),
      listarTransacoes(user.id, { inicio: anteriores.inicio, fim: anteriores.fim, tipo: "despesa" }),
    ]);
    setCategorias(cats.filter((c) => c.tipo === "despesa"));
    setLimites(lims);

    // Orçamento é um conceito de vida pessoal (a mesma regra "pessoal é
    // pessoal" das outras telas) — gasto do negócio não entra na conta aqui,
    // ele já tem seu próprio controle em Contas a pagar/Fluxo de caixa.
    const mapa = new Map<string, number>();
    for (const t of transacoesMes) {
      if (t.tipo_negocio === "negocio" || !t.categoria_id) continue;
      mapa.set(t.categoria_id, (mapa.get(t.categoria_id) ?? 0) + Number(t.valor));
    }
    setGastoPorCategoria(mapa);

    const somaAnterior = new Map<string, number>();
    for (const t of transacoesAnteriores) {
      if (t.tipo_negocio === "negocio" || !t.categoria_id) continue;
      somaAnterior.set(t.categoria_id, (somaAnterior.get(t.categoria_id) ?? 0) + Number(t.valor));
    }
    const medias = new Map<string, number>();
    somaAnterior.forEach((total, id) => medias.set(id, total / 3));
    setMediaPorCategoria(medias);
    setCarregando(false);
  }, [user]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const limitePorCategoria = React.useMemo(() => {
    const mapa = new Map<string, LimiteCategoria>();
    for (const l of limites) mapa.set(l.categoria_id, l);
    return mapa;
  }, [limites]);

  const linhas = React.useMemo(() => {
    return categorias
      .map((c) => {
        const limite = limitePorCategoria.get(c.id) ?? null;
        const gasto = gastoPorCategoria.get(c.id) ?? 0;
        const percentual = limite ? (gasto / Number(limite.limite_mensal)) * 100 : null;
        return { categoria: c, limite, gasto, percentual };
      })
      .sort((a, b) => {
        // Categorias com limite definido primeiro, das mais perto de
        // estourar pras mais tranquilas; sem limite por último.
        if (a.percentual !== null && b.percentual === null) return -1;
        if (a.percentual === null && b.percentual !== null) return 1;
        if (a.percentual !== null && b.percentual !== null) return b.percentual - a.percentual;
        return a.categoria.nome.localeCompare(b.categoria.nome);
      });
  }, [categorias, limitePorCategoria, gastoPorCategoria]);

  const emAlerta = linhas.filter((l) => l.percentual !== null && l.percentual >= 80);

  async function handleSalvarLimite(categoriaId: string) {
    if (!user) return;
    const valor = Number((rascunho[categoriaId] ?? "").replace(",", "."));
    if (!valor || valor <= 0) return;
    setSalvando(categoriaId);
    await definirLimite(user.id, categoriaId, valor);
    setRascunho((atual) => {
      const novo = { ...atual };
      delete novo[categoriaId];
      return novo;
    });
    await carregar();
    setSalvando(null);
  }

  /** 6.8: preenche os campos das categorias sem limite com média dos 3
   * últimos meses + 5% — a pessoa revisa e salva. */
  function handleSugerirPorMedia() {
    const novo: Record<string, string> = { ...rascunho };
    for (const c of categorias) {
      if (limitePorCategoria.has(c.id)) continue;
      const media = mediaPorCategoria.get(c.id) ?? 0;
      if (media > 0) novo[c.id] = String(sugerirLimite(media));
    }
    setRascunho(novo);
  }

  async function handleAplicarSugestoes() {
    if (!user) return;
    const pendentes = Object.entries(rascunho)
      .map(([id, v]) => [id, Number(v.replace(",", "."))] as const)
      .filter(([id, v]) => v > 0 && !limitePorCategoria.has(id));
    if (pendentes.length === 0) return;
    setAplicandoSugestoes(true);
    for (const [id, v] of pendentes) await definirLimite(user.id, id, v);
    setRascunho({});
    await carregar();
    setAplicandoSugestoes(false);
  }

  const temMedia = Array.from(mediaPorCategoria.values()).some((m) => m > 0);
  const qtdRascunhos = Object.values(rascunho).filter((v) => Number(v.replace(",", ".")) > 0).length;

  async function handleRemoverLimite(categoriaId: string) {
    if (!user) return;
    setSalvando(categoriaId);
    await removerLimite(user.id, categoriaId);
    await carregar();
    setSalvando(null);
  }

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Orçamento por categoria</h1>
          <p className="text-body text-muted">
            Defina um limite mensal pras categorias que você quer controlar — a gente avisa quando o gasto
            do mês estiver perto de estourar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {temMedia && (
          <Button size="sm" variant="secondary" onClick={handleSugerirPorMedia}>
            <Wand2 size={16} />
            Sugerir limites por média
          </Button>
        )}
        {qtdRascunhos > 1 && (
          <Button size="sm" onClick={handleAplicarSugestoes} disabled={aplicandoSugestoes}>
            {aplicandoSugestoes ? "Salvando..." : `Salvar ${qtdRascunhos} limites`}
          </Button>
        )}
        {user && (
          <CriarCategoriaInline
            usuarioId={user.id}
            tipo="despesa"
            rotulo="Nova categoria de gasto"
            botaoClassName="flex items-center gap-1.5 rounded-full border border-dashed border-border px-4 py-2 text-small font-medium text-muted transition-colors hover:border-primary-400 hover:text-primary-700"
            onCriada={(nova) => setCategorias((atual) => [...atual, nova])}
          />
        )}
        </div>
      </div>

      {emAlerta.length > 0 && (
        <Card className="flex flex-col gap-3 border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-600" />
            <p className="text-body font-semibold text-amber-900">
              {emAlerta.length === 1 ? "1 categoria está perto do limite" : `${emAlerta.length} categorias estão perto do limite`}
            </p>
          </div>
          <ul className="flex flex-col gap-1">
            {emAlerta.map((l) => (
              <li key={l.categoria.id} className="text-small text-amber-900">
                <strong>{l.categoria.nome}</strong>: {formatarMoeda(l.gasto)} de{" "}
                {formatarMoeda(Number(l.limite!.limite_mensal))} ({Math.round(l.percentual!)}%)
                {l.percentual! >= 100 ? " — já estourou" : ""}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : linhas.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <PiggyBank size={32} className="text-muted" />
          <p className="text-body text-muted">Você ainda não tem categorias de despesa cadastradas.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {linhas.map(({ categoria, limite, gasto, percentual }) => {
            const cor =
              percentual === null
                ? "bg-muted/30"
                : percentual >= 100
                  ? "bg-red-500"
                  : percentual >= 80
                    ? "bg-amber-500"
                    : "bg-primary-500";
            return (
              <Card key={categoria.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="text-body font-semibold text-foreground">{categoria.nome}</p>
                    {percentual !== null && percentual < 80 && (
                      <CheckCircle2 size={16} className="text-primary-500" />
                    )}
                    {percentual !== null && percentual >= 80 && (
                      <AlertTriangle size={16} className={percentual >= 100 ? "text-red-500" : "text-amber-500"} />
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-small text-muted">
                      Gasto este mês: <span className="font-medium text-foreground">{formatarMoeda(gasto)}</span>
                    </p>
                    {(mediaPorCategoria.get(categoria.id) ?? 0) > 0 && (
                      <p className="text-xs text-muted">
                        Média dos últimos 3 meses: {formatarMoeda(mediaPorCategoria.get(categoria.id) ?? 0)}
                      </p>
                    )}
                  </div>
                </div>

                {limite ? (
                  <>
                    <div className="h-2.5 w-full rounded-full bg-muted/15">
                      <div
                        className={`h-2.5 rounded-full transition-all ${cor}`}
                        style={{ width: `${Math.min(100, percentual ?? 0)}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-small text-muted">
                        Limite mensal: <span className="font-medium text-foreground">{formatarMoeda(Number(limite.limite_mensal))}</span>
                        {" · "}
                        {Math.round(percentual ?? 0)}% usado
                      </p>
                      <button
                        type="button"
                        onClick={() => handleRemoverLimite(categoria.id)}
                        disabled={salvando === categoria.id}
                        className="flex items-center gap-1 text-small text-muted hover:text-red-500"
                      >
                        <Trash2 size={14} />
                        Remover limite
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex: 300"
                      value={rascunho[categoria.id] ?? ""}
                      onChange={(e) => setRascunho((atual) => ({ ...atual, [categoria.id]: e.target.value }))}
                      className={INPUT_CLASSE}
                    />
                    <Button
                      size="sm"
                      variant="tertiary"
                      disabled={salvando === categoria.id || !rascunho[categoria.id]}
                      onClick={() => handleSalvarLimite(categoria.id)}
                    >
                      Definir limite mensal
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Container>
  );
}
