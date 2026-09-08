"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, PiggyBank, Trash2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
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

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    const { inicio, fim } = limitesDoMesAtual();
    const [cats, lims, transacoesMes] = await Promise.all([
      listarCategorias(user.id),
      listarLimites(user.id),
      listarTransacoes(user.id, { inicio, fim, tipo: "despesa" }),
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

  async function handleRemoverLimite(categoriaId: string) {
    if (!user) return;
    setSalvando(categoriaId);
    await removerLimite(user.id, categoriaId);
    await carregar();
    setSalvando(null);
  }

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div>
        <h1 className="text-h2 text-foreground">Orçamento por categoria</h1>
        <p className="text-body text-muted">
          Defina um limite mensal pras categorias que você quer controlar — a gente avisa quando o gasto
          do mês estiver perto de estourar.
        </p>
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
                  <p className="text-small text-muted">
                    Gasto este mês: <span className="font-medium text-foreground">{formatarMoeda(gasto)}</span>
                  </p>
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
