"use client";

import * as React from "react";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  Search,
  Filter,
  CalendarClock,
  Plus,
  ScrollText,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarTransacoes } from "@/lib/data/transacoes";
import { listarCategorias } from "@/lib/data/categorias";
import { NovaTransacaoModal } from "@/components/dashboard/NovaTransacaoModal";
import { formatarMoeda } from "@/lib/format";
import type { Categoria, Transacao } from "@/lib/data/tipos";

export interface ExtratoCompletoProps {
  /** "pessoal" mostra só o que não é do negócio; "negocio" mostra só as
   * transações marcadas como negócio -- mesma separação já usada em todo o
   * resto do app (dashboard/page.tsx e dashboard/empresa/page.tsx). */
  mundo: "pessoal" | "negocio";
}

function formatarCabecalhoData(iso: string): string {
  const data = new Date(iso + "T00:00:00");
  const texto = data.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  // "segunda-feira, 22 de setembro de 2026" -> primeira letra maiúscula.
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Extrato completo — TODAS as transações de qualquer mês (passado ou
 * futuro), agrupadas pela DATA DO LANÇAMENTO (`transacao.data`, quando a
 * pessoa anotou), nunca pela data de vencimento (`data_vencimento`, ver
 * tipos.ts) -- exatamente como pedido: um gasto anotado em 21/09 com
 * vencimento em 20/10 aparece no grupo do dia 21/09, com um selo mostrando
 * o vencimento à parte. Um componente só, reusado pelas duas telas
 * (/dashboard/extrato e /dashboard/empresa/extrato) via o prop `mundo`.
 */
export function ExtratoCompleto({ mundo }: ExtratoCompletoProps) {
  const { user, negocio } = useAuth();
  const usuarioEfetivoId = mundo === "negocio" ? negocio?.usuarioId : user?.id;

  const [transacoes, setTransacoes] = React.useState<Transacao[]>([]);
  const [categorias, setCategorias] = React.useState<Categoria[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [busca, setBusca] = React.useState("");
  const [filtroTipo, setFiltroTipo] = React.useState<"todos" | "receita" | "despesa">("todos");
  const [filtroCategoria, setFiltroCategoria] = React.useState("");
  const [modalAberto, setModalAberto] = React.useState(false);
  const [transacaoEditando, setTransacaoEditando] = React.useState<Transacao | null>(null);

  const carregar = React.useCallback(async () => {
    if (!usuarioEfetivoId) return;
    setCarregando(true);
    // Sem filtro de período -- `listarTransacoes` sem `inicio`/`fim` já
    // devolve TODO o histórico do usuário, passado e futuro, é isso que o
    // extrato completo precisa mostrar (diferente do painel, que só olha o
    // mês atual).
    const [lista, cats] = await Promise.all([
      listarTransacoes(usuarioEfetivoId),
      listarCategorias(usuarioEfetivoId),
    ]);
    setTransacoes(lista);
    setCategorias(cats);
    setCarregando(false);
  }, [usuarioEfetivoId]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  function handleAbrirModalNova() {
    setTransacaoEditando(null);
    setModalAberto(true);
  }

  function handleEditar(transacao: Transacao) {
    setTransacaoEditando(transacao);
    setModalAberto(true);
  }

  function handleFecharModal() {
    setModalAberto(false);
    setTransacaoEditando(null);
  }

  const transacoesDoMundo = React.useMemo(
    () =>
      transacoes.filter((t) =>
        mundo === "negocio" ? t.tipo_negocio === "negocio" : t.tipo_negocio !== "negocio"
      ),
    [transacoes, mundo]
  );

  const categoriasDisponiveis = React.useMemo(() => {
    const idsUsados = new Set(transacoesDoMundo.map((t) => t.categoria_id).filter(Boolean));
    return categorias.filter((c) => idsUsados.has(c.id));
  }, [categorias, transacoesDoMundo]);

  const buscaNormalizada = busca.trim().toLowerCase();
  const transacoesFiltradas = React.useMemo(() => {
    return transacoesDoMundo.filter((t) => {
      if (filtroTipo !== "todos" && t.tipo !== filtroTipo) return false;
      if (filtroCategoria && t.categoria_id !== filtroCategoria) return false;
      if (buscaNormalizada && !(t.descricao ?? "").toLowerCase().includes(buscaNormalizada)) return false;
      return true;
    });
  }, [transacoesDoMundo, filtroTipo, filtroCategoria, buscaNormalizada]);

  // Agrupa por `data` (data do lançamento) -- a lista já vem ordenada
  // (mais recente primeiro) de `listarTransacoes`, então só precisamos
  // juntar transações consecutivas com a mesma data em cada grupo, sem
  // reordenar nada.
  const grupos = React.useMemo(() => {
    const porData = new Map<string, Transacao[]>();
    for (const t of transacoesFiltradas) {
      const lista = porData.get(t.data);
      if (lista) lista.push(t);
      else porData.set(t.data, [t]);
    }
    return Array.from(porData.entries());
  }, [transacoesFiltradas]);

  const totalEntradas = transacoesFiltradas
    .filter((t) => t.tipo === "receita")
    .reduce((acc, t) => acc + Number(t.valor), 0);
  const totalSaidas = transacoesFiltradas
    .filter((t) => t.tipo === "despesa")
    .reduce((acc, t) => acc + Number(t.valor), 0);

  return (
    <Container full className="flex flex-col gap-6 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Extrato completo</h1>
          <p className="text-body text-muted">
            Todos os lançamentos {mundo === "negocio" ? "do negócio" : "pessoais"}, de qualquer mês —
            agrupados pelo dia em que você anotou.
          </p>
        </div>
        <Button size="lg" variant={mundo === "negocio" ? "secondary" : "primary"} onClick={handleAbrirModalNova}>
          <Plus size={18} />
          Nova anotação
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col gap-1">
          <p className="text-small text-muted">Entradas (no filtro atual)</p>
          <p className="text-h3 text-primary-500">{formatarMoeda(totalEntradas)}</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <p className="text-small text-muted">Saídas (no filtro atual)</p>
          <p className="text-h3 text-red-500">{formatarMoeda(totalSaidas)}</p>
        </Card>
      </div>

      <Card className="flex flex-col gap-3">
        <div className="relative flex items-center">
          <Search size={16} className="pointer-events-none absolute left-3.5 text-muted" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por descrição..."
            className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-body text-foreground placeholder:text-muted focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
          />
        </div>
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
          {categoriasDisponiveis.length > 0 && (
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-small text-foreground"
            >
              <option value="">Todas categorias</option>
              {categoriasDisponiveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
        </div>
      </Card>

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : grupos.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <ScrollText size={28} className="text-muted" />
          <p className="text-body text-muted">
            {transacoesDoMundo.length === 0
              ? "Nenhuma anotação ainda. Que tal registrar a primeira?"
              : "Nenhum lançamento encontrado com esses filtros."}
          </p>
          {transacoesDoMundo.length === 0 && (
            <Button variant="secondary" onClick={handleAbrirModalNova}>
              <Plus size={18} />
              Anotar agora
            </Button>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {grupos.map(([data, itens]) => (
            <div key={data} className="flex flex-col gap-2">
              <h2 className="text-small font-semibold uppercase tracking-wide text-muted">
                {formatarCabecalhoData(data)}
              </h2>
              <div className="flex flex-col gap-2">
                {itens.map((t) => (
                  <Card
                    key={t.id}
                    padding="sm"
                    onClick={() => handleEditar(t)}
                    className="flex flex-wrap items-center justify-between gap-4 transition-colors cursor-pointer hover:bg-muted/5"
                  >
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
                        <div className="flex flex-wrap items-center gap-2">
                          {t.categorias?.nome && (
                            <Badge variant="neutral" size="sm">
                              {t.categorias.nome}
                            </Badge>
                          )}
                          {t.data_vencimento && (
                            <Badge variant="accent" size="sm">
                              <span className="flex items-center gap-1">
                                <CalendarClock size={11} />
                                Vence {new Date(t.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                              </span>
                            </Badge>
                          )}
                          {t.parcela_numero && t.parcela_total && (
                            <Badge variant="neutral" size="sm">
                              {t.parcela_numero}/{t.parcela_total}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <p
                      className={`shrink-0 text-body font-semibold ${
                        t.tipo === "receita" ? "text-primary-600" : "text-red-500"
                      }`}
                    >
                      {t.tipo === "receita" ? "+" : "-"}
                      {formatarMoeda(Number(t.valor))}
                    </p>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <NovaTransacaoModal
        aberto={modalAberto}
        mundo={mundo}
        transacaoEditando={transacaoEditando}
        onFechar={handleFecharModal}
        onSalvo={carregar}
      />
    </Container>
  );
}
