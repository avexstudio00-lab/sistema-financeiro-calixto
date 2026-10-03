"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Lock, Trophy, PiggyBank, Pencil, Calculator, Trash2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  criarMeta,
  listarMetas,
  atualizarProgressoMeta,
  atualizarMeta,
  calcularMesesParaAtingirMeta,
  excluirMeta,
  definirCustodiaMeta,
  movimentarMeta,
  sincronizarMetaComEspelho,
  custodiaRende,
  ROTULO_CUSTODIA,
  type CustodiaMeta,
} from "@/lib/data/metas";
import { adicionarMeses, listarInvestimentos, calcularValorAtualEstimado } from "@/lib/data/investimentos";
import { obterCotacoesMercado } from "@/lib/data/mercado";
import { SeletorCarteira } from "@/components/dashboard/SeletorCarteira";
import { podeUsarRecurso } from "@/lib/planos";
import { AnelProgresso } from "@/components/dashboard/graficos/AnelProgresso";
import type { Investimento, Meta } from "@/lib/data/tipos";

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
  // 5.13: onde o dinheiro da meta fica e de qual carteira sai/entra.
  const [custodiaNova, setCustodiaNova] = React.useState<CustodiaMeta | "">("");
  const [carteiraPorMeta, setCarteiraPorMeta] = React.useState<Record<string, string>>({});
  const [espelhos, setEspelhos] = React.useState<Map<string, number>>(new Map());
  const [erroMeta, setErroMeta] = React.useState<Record<string, string>>({});

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    const [lista, investimentos, cotacoes] = await Promise.all([
      listarMetas(user.id),
      listarInvestimentos(user.id),
      obterCotacoesMercado(),
    ]);
    // O rendimento do investimento espelho entra sozinho na meta.
    const porId = new Map<string, Investimento>(investimentos.map((i) => [i.id, i]));
    const valores = new Map<string, number>();
    let mudou = false;
    for (const m of lista) {
      const inv = m.investimento_id ? porId.get(m.investimento_id) : undefined;
      if (!inv) continue;
      const valor = calcularValorAtualEstimado(inv, undefined, cotacoes);
      valores.set(m.id, valor);
      if (await sincronizarMetaComEspelho(m, valor)) mudou = true;
    }
    setEspelhos(valores);
    setMetas(mudou ? await listarMetas(user.id) : lista);
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
    const { data: nova } = await criarMeta(user.id, nome.trim(), valor, dataFim || null);
    if (nova && custodiaNova) await definirCustodiaMeta(nova as Meta, custodiaNova, user.id);
    setCustodiaNova("");
    setSalvando(false);
    setNome("");
    setValorMeta("");
    setDataFim("");
    setFormAberto(false);
    carregar();
  }

  async function movimentar(meta: Meta, sentido: "aporte" | "retirada") {
    if (!user) return;
    const valorTexto = aporteEmEdicao[meta.id];
    const valor = Number((valorTexto ?? "").replace(",", "."));
    if (!valor || valor <= 0) return;
    const contaId = carteiraPorMeta[meta.id] || null;
    // Meta com custódia definida: o dinheiro sempre passa por uma carteira.
    if (meta.custodia && !contaId) {
      setErroMeta((prev) => ({ ...prev, [meta.id]: "Escolha a carteira." }));
      return;
    }
    setErroMeta((prev) => ({ ...prev, [meta.id]: "" }));
    if (!meta.custodia && !contaId) {
      const base = Number(meta.valor_atual);
      const novoValor = sentido === "aporte" ? base + valor : Math.max(0, base - valor);
      await atualizarProgressoMeta(meta.id, novoValor, novoValor >= Number(meta.valor_meta) ? "concluida" : "em_andamento");
    } else {
      await movimentarMeta({ meta, usuarioId: user.id, valor, sentido, contaId, valorAtualEspelho: espelhos.get(meta.id) ?? null });
    }
    setAporteEmEdicao((prev) => ({ ...prev, [meta.id]: "" }));
    carregar();
  }

  const handleAporte = (meta: Meta) => movimentar(meta, "aporte");
  const handleRetirada = (meta: Meta) => movimentar(meta, "retirada");

  async function handleMudarCustodia(meta: Meta, valor: string) {
    if (!user) return;
    await definirCustodiaMeta(meta, (valor || null) as CustodiaMeta | null, user.id);
    carregar();
  }

  function abrirEdicao(meta: Meta) {
    setConfirmandoExclusao(false);
    setMetaEditandoId(meta.id);
    setEdicao({ nome: meta.nome, valorMeta: String(meta.valor_meta), dataFim: meta.data_fim ?? "" });
  }

  // Exclusão (item 4.6): confirmação dentro do próprio card de edição.
  const [confirmandoExclusao, setConfirmandoExclusao] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState(false);

  async function handleExcluirMeta(meta: Meta) {
    setExcluindo(true);
    const { error } = await excluirMeta(meta.id);
    setExcluindo(false);
    if (error) {
      console.error("Erro ao excluir meta:", error.message);
      return;
    }
    setConfirmandoExclusao(false);
    setMetaEditandoId(null);
    carregar();
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
              <DateMaskInput label="Prazo (opcional)" value={dataFim} onChange={(v) => setDataFim(v)} />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label htmlFor="custodia-nova" className="text-small font-medium text-foreground">Onde fica guardado?</label>
              <select
                id="custodia-nova"
                value={custodiaNova}
                onChange={(e) => setCustodiaNova(e.target.value as CustodiaMeta | "")}
                className="h-11 rounded-xl border border-border bg-card px-3 text-small text-foreground"
              >
                <option value="">Só acompanhar</option>
                {(Object.keys(ROTULO_CUSTODIA) as CustodiaMeta[]).map((c) => (
                  <option key={c} value={c}>{ROTULO_CUSTODIA[c]}</option>
                ))}
              </select>
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
                  <DateMaskInput
                    label="Prazo (opcional)"
                    value={edicao.dataFim}
                    onChange={(v) => setEdicao((prev) => ({ ...prev, dataFim: v }))}
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
                  <div className="border-t border-border pt-4">
                    {!confirmandoExclusao ? (
                      <button
                        type="button"
                        onClick={() => setConfirmandoExclusao(true)}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-small font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 size={16} />
                        Excluir meta
                      </button>
                    ) : (
                      <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                        <p className="text-small font-semibold text-rose-800">Excluir &quot;{meta.nome}&quot;?</p>
                        {Number(meta.valor_atual) > 0 ? (
                          <p className="text-small text-rose-800">
                            Essa meta tem <strong>{formatarMoeda(Number(meta.valor_atual))}</strong> guardados. Ao
                            excluir, o dinheiro <strong>continua exatamente onde está</strong> (nas carteiras e no
                            investimento espelho, se houver) — só o acompanhamento da meta é apagado.
                          </p>
                        ) : (
                          <p className="text-small text-rose-800">Essa ação não pode ser desfeita.</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="tertiary" onClick={() => setConfirmandoExclusao(false)}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            disabled={excluindo}
                            onClick={() => handleExcluirMeta(meta)}
                            className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
                          >
                            {excluindo ? "Excluindo..." : "Sim, excluir meta"}
                          </Button>
                        </div>
                      </div>
                    )}
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
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <label htmlFor={`custodia-${meta.id}`}>Guardado em</label>
                  <select
                    id={`custodia-${meta.id}`}
                    value={meta.custodia ?? ""}
                    onChange={(e) => handleMudarCustodia(meta, e.target.value)}
                    className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                  >
                    <option value="">Só acompanhar</option>
                    {(Object.keys(ROTULO_CUSTODIA) as CustodiaMeta[]).map((c) => (
                      <option key={c} value={c}>{ROTULO_CUSTODIA[c]}</option>
                    ))}
                  </select>
                  {custodiaRende(meta.custodia) && meta.investimento_id && (
                    <Link href="/dashboard/investimentos" className="font-semibold text-primary-700 hover:underline">
                      Rende sozinho — ver investimento
                    </Link>
                  )}
                </div>
                <SeletorCarteira
                  valor={carteiraPorMeta[meta.id] ?? ""}
                  onChange={(id) => setCarteiraPorMeta((prev) => ({ ...prev, [meta.id]: id }))}
                  rotulo="Carteira do aporte/retirada"
                  ajuda={meta.custodia ? "O aporte sai dessa carteira e a retirada volta pra ela." : "Opcional: escolha uma carteira pra movimentar o saldo de verdade."}
                />
                {erroMeta[meta.id] && <p className="text-xs text-rose-600">{erroMeta[meta.id]}</p>}
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
