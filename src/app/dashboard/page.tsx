"use client";

import * as React from "react";
import { ArrowDownCircle, ArrowUpCircle, Wallet, Plus, Filter } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarTransacoes, contarTransacoesDoMes } from "@/lib/data/transacoes";
import { listarCategorias } from "@/lib/data/categorias";
import { LIMITE_TRANSACOES_GRATIS } from "@/lib/planos";
import { NovaTransacaoModal } from "@/components/dashboard/NovaTransacaoModal";
import type { Categoria, Transacao } from "@/lib/data/tipos";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function limitesDoMesAtual() {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString().slice(0, 10);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { inicio, fim };
}

export default function DashboardPage() {
  const { user, perfil } = useAuth();
  const [transacoes, setTransacoes] = React.useState<Transacao[]>([]);
  const [categorias, setCategorias] = React.useState<Categoria[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [modalAberto, setModalAberto] = React.useState(false);
  const [bloqueado, setBloqueado] = React.useState(false);
  const [transacaoEditando, setTransacaoEditando] = React.useState<Transacao | null>(null);

  const [filtroTipo, setFiltroTipo] = React.useState<"todos" | "receita" | "despesa">("todos");
  const [filtroCategoria, setFiltroCategoria] = React.useState("");
  const [modoVisualizacao, setModoVisualizacao] = React.useState<"tudo" | "pessoal" | "negocio">("tudo");

  const ehNegocio = perfil?.tipo_perfil === "mei" || perfil?.tipo_perfil === "me";

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    const { inicio, fim } = limitesDoMesAtual();
    const [lista, cats] = await Promise.all([
      listarTransacoes(user.id, { inicio, fim }),
      listarCategorias(user.id),
    ]);
    setTransacoes(lista);
    setCategorias(cats);
    setCarregando(false);
  }, [user]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleAbrirModal() {
    if (!user || !perfil) return;
    setTransacaoEditando(null);
    if (perfil.plano === "gratis") {
      const { inicio, fim } = limitesDoMesAtual();
      const total = await contarTransacoesDoMes(user.id, inicio, fim);
      setBloqueado(total >= LIMITE_TRANSACOES_GRATIS);
    } else {
      setBloqueado(false);
    }
    setModalAberto(true);
  }

  function handleEditarTransacao(transacao: Transacao) {
    setTransacaoEditando(transacao);
    setBloqueado(false);
    setModalAberto(true);
  }

  function handleFecharModal() {
    setModalAberto(false);
    setTransacaoEditando(null);
  }

  const transacoesDoModo =
    modoVisualizacao === "tudo" ? transacoes : transacoes.filter((t) => t.tipo_negocio === modoVisualizacao);

  const entradas = transacoesDoModo.filter((t) => t.tipo === "receita").reduce((acc, t) => acc + Number(t.valor), 0);
  const saidas = transacoesDoModo.filter((t) => t.tipo === "despesa").reduce((acc, t) => acc + Number(t.valor), 0);
  const saldo = entradas - saidas;

  const transacoesFiltradas = transacoesDoModo.filter((t) => {
    if (filtroTipo !== "todos" && t.tipo !== filtroTipo) return false;
    if (filtroCategoria && t.categoria_id !== filtroCategoria) return false;
    return true;
  });

  return (
    <Container className="flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 text-foreground">Olá, {perfil?.nome.split(" ")[0]} 👋</h1>
          <p className="text-body text-muted">Aqui está o resumo do seu mês.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {ehNegocio && (
            <div className="flex gap-1 rounded-full bg-muted/10 p-1">
              {(["tudo", "pessoal", "negocio"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModoVisualizacao(m)}
                  className={`rounded-full px-3 py-1.5 text-small font-medium transition-colors ${
                    modoVisualizacao === m
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {m === "tudo" ? "Tudo" : m === "pessoal" ? "Pessoal" : "Empresa"}
                </button>
              ))}
            </div>
          )}
          <Button size="lg" onClick={handleAbrirModal} className="hidden sm:inline-flex">
            <Plus size={18} />
            Anotar gasto ou receita
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ArrowUpCircle size={18} className="text-primary-500" />
            <p className="text-small text-muted">Entradas</p>
          </div>
          <p className="text-h2 text-primary-500">{formatarMoeda(entradas)}</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ArrowDownCircle size={18} className="text-red-500" />
            <p className="text-small text-muted">Saídas</p>
          </div>
          <p className="text-h2 text-red-500">{formatarMoeda(saidas)}</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Wallet size={18} className="text-secondary" />
            <p className="text-small text-muted">Saldo do mês</p>
          </div>
          <p className="text-h2 text-secondary">{formatarMoeda(saldo)}</p>
        </Card>
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
                className="flex cursor-pointer items-center justify-between gap-4 transition-colors hover:bg-muted/5"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      t.tipo === "receita" ? "bg-primary-50 text-primary-600" : "bg-rose-50 text-red-500"
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
                <p className={`text-body font-semibold ${t.tipo === "receita" ? "text-primary-600" : "text-red-500"}`}>
                  {t.tipo === "receita" ? "+" : "-"}
                  {formatarMoeda(Number(t.valor))}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleAbrirModal}
        aria-label="Anotar gasto ou receita"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-white shadow-card-hover transition-transform hover:scale-105 sm:hidden"
      >
        <Plus size={26} />
      </button>

      <NovaTransacaoModal
        aberto={modalAberto}
        bloqueado={bloqueado}
        transacaoEditando={transacaoEditando}
        modoInicial={modoVisualizacao !== "tudo" ? modoVisualizacao : undefined}
        onFechar={handleFecharModal}
        onSalvo={carregar}
      />
    </Container>
  );
}
