"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Lock, Trophy, PiggyBank, Pencil, Calculator } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  criarMeta,
  listarMetas,
  atualizarProgressoMeta,
  atualizarMeta,
  calcularMesesParaAtingirMeta,
} from "@/lib/data/metas";
import { adicionarMeses } from "@/lib/data/investimentos";
import { podeUsarRecurso } from "@/lib/planos";
import { AnelProgresso } from "@/components/dashboard/graficos/AnelProgresso";
import type { Meta } from "@/lib/data/tipos";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const NOMES_MES_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Data "YYYY-MM-DD" de hoje, no fuso local (mesmo padrão usado em
 * `adicionarMeses`/`gerarDatasSugeridasParcelas` de investimentos, sem
 * passar por Date→ISO que converteria pra UTC). */
function hojeIso(): string {
  const hoje = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
}

/** "outubro de 2027" a partir de uma data "YYYY-MM-DD", pro texto da
 * simulação de meses-pra-bater-a-meta/quitar-a-dívida. */
function mesAnoExtenso(dataIso: string): string {
  const [ano, mes] = dataIso.split("-").map(Number);
  return `${NOMES_MES_EXTENSO[mes - 1]} de ${ano}`;
}

export default function MetasPage() {
  const { user, perfil } = useAuth();
  const temMetas = perfil ? podeUsarRecurso(perfil.plano, "metas") : false;

  const [metas, setMetas] = React.useState<Meta[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [formAberto, setFormAberto] = React.useState(false);
  const [nome, setNome] = React.useState("");
  const [valorMeta, setValorMeta] = React.useState("");
  const [dataFim, setDataFim] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aporteEmEdicao, setAporteEmEdicao] = React.useState<Record<string, string>>({});
  const [metaEditandoId, setMetaEditandoId] = React.useState<string | null>(null);
  const [edicao, setEdicao] = React.useState({ nome: "", valorMeta: "", dataFim: "" });
  const [salvandoEdicao, setSalvandoEdicao] = React.useState(false);
  const [simulacaoEmEdicao, setSimulacaoEmEdicao] = React.useState<Record<string, string>>({});

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    setMetas(await listarMetas(user.id));
    setCarregando(false);
  }, [user]);

  React.useEffect(() => {
    if (temMetas) carregar();
    else setCarregando(false);
  }, [temMetas, carregar]);

  async function handleCriarMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const valor = Number(valorMeta.replace(",", "."));
    if (nome.trim().length < 2 || !valor || valor <= 0) {
      setErro("Preencha o nome e um valor válido para a meta.");
      return;
    }
    setErro(null);
    setSalvando(true);
    await criarMeta(user.id, nome.trim(), valor, dataFim || null);
    setSalvando(false);
    setNome("");
    setValorMeta("");
    setDataFim("");
    setFormAberto(false);
    carregar();
  }

  async function handleAporte(meta: Meta) {
    const valorTexto = aporteEmEdicao[meta.id];
    const valor = Number((valorTexto ?? "").replace(",", "."));
    if (!valor || valor <= 0) return;
    const novoValor = Number(meta.valor_atual) + valor;
    const status = novoValor >= Number(meta.valor_meta) ? "concluida" : "em_andamento";
    await atualizarProgressoMeta(meta.id, novoValor, status);
    setAporteEmEdicao((prev) => ({ ...prev, [meta.id]: "" }));
    carregar();
  }

  async function handleRetirada(meta: Meta) {
    const valorTexto = aporteEmEdicao[meta.id];
    const valor = Number((valorTexto ?? "").replace(",", "."));
    if (!valor || valor <= 0) return;
    const novoValor = Math.max(0, Number(meta.valor_atual) - valor);
    const status = novoValor >= Number(meta.valor_meta) ? "concluida" : "em_andamento";
    await atualizarProgressoMeta(meta.id, novoValor, status);
    setAporteEmEdicao((prev) => ({ ...prev, [meta.id]: "" }));
    carregar();
  }

  function abrirEdicao(meta: Meta) {
    setMetaEditandoId(meta.id);
    setEdicao({ nome: meta.nome, valorMeta: String(meta.valor_meta), dataFim: meta.data_fim ?? "" });
  }

  async function handleSalvarEdicao(meta: Meta) {
    const valor = Number(edicao.valorMeta.replace(",", "."));
    if (edicao.nome.trim().length < 2 || !valor || valor <= 0) return;
    setSalvandoEdicao(true);
    await atualizarMeta(meta.id, { nome: edicao.nome.trim(), valorMeta: valor, dataFim: edicao.dataFim || null });
    setSalvandoEdicao(false);
    setMetaEditandoId(null);
    carregar();
  }

  if (!temMetas) {
    return (
      <Container className="flex flex-col items-center gap-6 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
          <Lock size={28} />
        </span>
        <div>
          <h1 className="text-h2 text-foreground">Metas de economia são um recurso pago</h1>
          <p className="mx-auto mt-2 max-w-md text-body text-muted">
            Assine um plano pago (Mensal, Completo ou Avançado) para definir quanto quer guardar e
            acompanhar o progresso até chegar lá.
          </p>
        </div>
        <Link href="/dashboard/plano">
          <Button size="lg">Ver planos</Button>
        </Link>
      </Container>
    );
  }

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Metas de economia</h1>
          <p className="text-body text-muted">Defina quanto quer guardar e acompanhe o progresso.</p>
        </div>
        <Button onClick={() => setFormAberto((v) => !v)}>
          <Plus size={18} />
          Nova meta
        </Button>
      </div>

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-h3 text-foreground">Criar nova meta</h2>
          <form onSubmit={handleCriarMeta} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input label="Nome da meta" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Reserva de emergência" />
            </div>
            <div className="flex-1">
              <Input label="Valor da meta" inputMode="decimal" value={valorMeta} onChange={(e) => setValorMeta(e.target.value)} placeholder="0,00" />
            </div>
            <div className="flex-1">
              <Input label="Prazo (opcional)" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
            <Button type="submit" disabled={salvando} className="sm:w-auto">
              {salvando ? "Salvando..." : "Criar"}
            </Button>
          </form>
          {erro && <p className="text-small text-rose-600">{erro}</p>}
        </Card>
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : metas.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <PiggyBank size={32} className="text-primary-400" />
          <p className="text-body text-muted">Você ainda não tem metas. Que tal criar a primeira?</p>
      </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {metas.map((meta) => {
            const progresso = Math.min(100, (Number(meta.valor_atual) / Number(meta.valor_meta)) * 100);
            const valorRestante = Math.max(0, Number(meta.valor_meta) - Number(meta.valor_atual));
            const simulacaoTexto = simulacaoEmEdicao[meta.id] ?? "";
            const aporteSimulado = Number(simulacaoTexto.replace(",", "."));
            const mesesSimulados =
              simulacaoTexto.trim() === "" ? null : calcularMesesParaAtingirMeta(valorRestante, aporteSimulado);

            if (metaEditandoId === meta.id) {
              return (
                <Card key={meta.id} className="flex flex-col gap-4">
                  <h3 className="text-h3 text-foreground">Editar meta</h3>
                  <Input
                    label="Nome da meta"
                    value={edicao.nome}
                    onChange={(e) => setEdicao((prev) => ({ ...prev, nome: e.target.value }))}
                  />
                  <Input
                    label="Valor da meta"
                    inputMode="decimal"
                    value={edicao.valorMeta}
                    onChange={(e) => setEdicao((prev) => ({ ...prev, valorMeta: e.target.value }))}
                  />
                  <Input
                    label="Prazo (opcional)"
                    type="date"
                    value={edicao.dataFim}
                    onChange={(e) => setEdicao((prev) => ({ ...prev, dataFim: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button variant="tertiary" className="flex-1" onClick={() => setMetaEditandoId(null)}>
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={salvandoEdicao}
                      onClick={() => handleSalvarEdicao(meta)}
                    >
                      {salvandoEdicao ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </Card>
              );
            }

            return (
              <Card key={meta.id} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="min-w-0 text-h3 text-foreground">{meta.nome}</h3>
                    {meta.data_fim && (
                      <p className="text-small text-muted">
                        Prazo: {new Date(meta.data_fim + "T00:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {meta.status === "concluida" && (
                      <Badge variant="primary" size="sm">
                        <Trophy size={12} />
                        Concluída
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={() => abrirEdicao(meta)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-muted/10 hover:text-foreground"
                      aria-label="Editar meta"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <AnelProgresso percentual={progresso} tamanho={88} espessura={9} />
                  <div className="flex flex-col gap-1">
                    <span className="text-small text-muted">
                      {formatarMoeda(Number(meta.valor_atual))} de {formatarMoeda(Number(meta.valor_meta))}
                    </span>
                    <span className="text-small font-medium text-primary-600">
                      {progresso.toFixed(0)}% concluído
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="min-w-[120px] flex-1">
                    <Input
                      placeholder="Valor"
                      inputMode="decimal"
                      value={aporteEmEdicao[meta.id] ?? ""}
                      onChange={(e) => setAporteEmEdicao((prev) => ({ ...prev, [meta.id]: e.target.value }))}
                    />
                  </div>
                  <Button variant="secondary" onClick={() => handleAporte(meta)}>
                    Adicionar
                  </Button>
                  <Button
                    variant="tertiary"
                    className="text-rose-600 hover:bg-rose-50"
                    disabled={Number(meta.valor_atual) <= 0}
                    onClick={() => handleRetirada(meta)}
                  >
                    Retirar
                  </Button>
                </div>

                {meta.status !== "concluida" && (
                  <div className="flex flex-col gap-2 rounded-xl bg-muted/5 p-3">
                    <div className="flex items-center gap-1.5 text-small font-medium text-foreground">
                      <Calculator size={14} className="text-primary-500" />
                      Simular: guardando quanto por mês?
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-[120px] flex-1">
                        <Input
                          placeholder="Ex: 200,00"
                          inputMode="decimal"
                          value={simulacaoEmEdicao[meta.id] ?? ""}
                          onChange={(e) =>
                            setSimulacaoEmEdicao((prev) => ({ ...prev, [meta.id]: e.target.value }))
                          }
                        />
                      </div>
                      {mesesSimulados != null && (
                        <span className="text-small text-muted">
                          {mesesSimulados === 0
                            ? "Você já bateu essa meta!"
                            : mesesSimulados === 1
                              ? `Bate em 1 mês (${mesAnoExtenso(adicionarMeses(hojeIso(), 1))})`
                              : `Bate em ${mesesSimulados} meses (${mesAnoExtenso(adicionarMeses(hojeIso(), mesesSimulados))})`}
                        </span>
                      )}
                    </div>
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
