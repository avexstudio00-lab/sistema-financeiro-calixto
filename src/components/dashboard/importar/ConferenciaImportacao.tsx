"use client";

import * as React from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import type { LancamentoLido, LinhaRejeitada } from "@/lib/util/csvImportacao";
import { ROTULO_NATUREZA, type Classificacao } from "@/lib/util/classificarExtrato";
import type { SugestaoExtrato } from "@/lib/data/importar";
import { ROTULO_ACAO, acoesDoTipo, modoPadrao, type AcaoExtrato, type OperacaoAberta } from "@/lib/data/importarLigacoes";
import type { Categoria, Conta } from "@/lib/data/tipos";
import { RegrasImportacao } from "./RegrasImportacao";

const POR_PAGINA = 100;

function dataBr(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Passo 3: conferência obrigatória antes de gravar. */
export function ConferenciaImportacao({
  validos,
  rejeitados,
  duplicadas,
  classificacoes,
  sugestoes,
  onSugestoes,
  categorias,
  cartoes,
  carteiras,
  dividas,
  operacoes,
  onPreencherOperacao,
  motivosDuplicada,
  selecionados,
  onSelecionados,
  importando,
  onVoltar,
  onCancelar,
  onConfirmar,
}: {
  validos: LancamentoLido[];
  rejeitados: LinhaRejeitada[];
  duplicadas: Set<number>;
  classificacoes: Classificacao[];
  sugestoes: SugestaoExtrato[];
  onSugestoes: (s: SugestaoExtrato[]) => void;
  categorias: Categoria[];
  cartoes: Conta[];
  /** Outras carteiras/caixinhas (destino/origem de transferência). */
  carteiras: Conta[];
  dividas: { id: string; nome: string }[];
  operacoes: OperacaoAberta[];
  /** Emprestei / comprei para revenda: abre o formulário já preenchido. */
  onPreencherOperacao: (indice: number, tipo: "emprestimo" | "revenda") => void;
  motivosDuplicada: Map<number, string>;
  selecionados: Set<number>;
  onSelecionados: (s: Set<number>) => void;
  importando: boolean;
  onVoltar: () => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const [visiveis, setVisiveis] = React.useState(POR_PAGINA);
  const [verRejeitadas, setVerRejeitadas] = React.useState(false);
  const duplicadasIncluidas = Array.from(duplicadas).filter((i) => selecionados.has(i)).length;
  const incluirDuplicadas = duplicadas.size > 0 && duplicadasIncluidas === duplicadas.size;
  const total = selecionados.size;
  const liquido = Array.from(selecionados).reduce((acc, i) => acc + (validos[i].tipo === "receita" ? validos[i].valor : -validos[i].valor), 0);
  // Linhas marcadas como empréstimo/revenda que ainda não tiveram o formulário preenchido.
  const faltaPreencher = Array.from(selecionados).filter((i) => {
    const a = sugestoes[i]?.acao;
    return (a === "emprestei" || a === "comprei_revenda") && !sugestoes[i]?.lancadoPor;
  }).length;
  const destinosTransferencia = [...cartoes, ...carteiras.filter((c) => !cartoes.some((ct) => ct.id === c.id))];

  function mudarAcao(i: number, acao: AcaoExtrato) {
    const atual = sugestoes[i];
    const parcial: Partial<SugestaoExtrato> = {
      acao,
      lancadoPor: null,
      investimentoId: null,
      modoRecebimento: null,
      parcelaId: null,
      transferirPara: acao === "transferencia" ? (atual.transferirPara ?? destinosTransferencia[0]?.id ?? null) : null,
      dividaId: acao === "divida" ? (atual.dividaId ?? dividas[0]?.id ?? null) : null,
      dividaNome: acao === "divida" ? (atual.dividaNome ?? dividas[0]?.nome ?? null) : null,
    };
    if (acao === "receb_emprestimo" || acao === "receb_revenda") {
      const tipo = acao === "receb_emprestimo" ? "emprestimo" : "revenda";
      const op = operacoes.find((o) => o.investimento.tipo === tipo);
      if (op) {
        const padrao = modoPadrao(op, validos[i].valor);
        parcial.investimentoId = op.investimento.id;
        parcial.modoRecebimento = padrao.modo;
        parcial.parcelaId = padrao.parcelaId;
      }
    }
    mudarSugestao(i, parcial);
  }

  function escolherOperacao(i: number, investimentoId: string) {
    const op = operacoes.find((o) => o.investimento.id === investimentoId);
    if (!op) return mudarSugestao(i, { investimentoId: null, modoRecebimento: null, parcelaId: null });
    const padrao = modoPadrao(op, validos[i].valor);
    mudarSugestao(i, { investimentoId, modoRecebimento: padrao.modo, parcelaId: padrao.parcelaId });
  }

  function escolherModo(i: number, valor: string) {
    if (valor.startsWith("parcela:")) mudarSugestao(i, { modoRecebimento: "parcela", parcelaId: valor.slice(8) });
    else mudarSugestao(i, { modoRecebimento: valor as SugestaoExtrato["modoRecebimento"], parcelaId: null });
  }

  function mudarSugestao(i: number, parcial: Partial<SugestaoExtrato>) {
    const novas = sugestoes.slice();
    novas[i] = { ...novas[i], ...parcial };
    onSugestoes(novas);
  }
  const resumoNaturezas = React.useMemo(() => {
    const m = new Map<string, number>();
    Array.from(selecionados).forEach((i) => {
      const n = classificacoes[i]?.natureza;
      if (n && n !== "outro") m.set(ROTULO_NATUREZA[n], (m.get(ROTULO_NATUREZA[n]) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [selecionados, classificacoes]);
  const ligadasDivida = Array.from(selecionados).filter((i) => sugestoes[i]?.dividaId).length;

  function alternar(i: number) {
    const novo = new Set(selecionados);
    if (novo.has(i)) novo.delete(i);
    else novo.add(i);
    onSelecionados(novo);
  }

  function alternarDuplicadas(incluir: boolean) {
    const novo = new Set(selecionados);
    duplicadas.forEach((i) => (incluir ? novo.add(i) : novo.delete(i)));
    onSelecionados(novo);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card padding="lg" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted">Prontos para importar</p>
          <p className="text-h2 text-foreground">{total}</p>
          <p className="text-xs text-muted">Efeito no saldo: {liquido >= 0 ? "+" : "−"}{formatarMoeda(Math.abs(liquido))}</p>
        </div>
        <div className="rounded-xl border border-amber-300 p-3 dark:border-amber-700">
          <p className="text-xs text-muted">Possíveis duplicadas</p>
          <p className="text-h2 text-foreground">{duplicadas.size}</p>
          <p className="text-xs text-muted">Parecidas com o que você já lançou nesta carteira (vêm desmarcadas).</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted">Linhas descartadas</p>
          <p className="text-h2 text-foreground">{rejeitados.length}</p>
          {rejeitados.length > 0 && (
            <button type="button" onClick={() => setVerRejeitadas((v) => !v)} className="text-xs font-medium text-primary-700 hover:underline dark:text-primary-300">
              {verRejeitadas ? "Esconder motivos" : "Ver motivos"}
            </button>
          )}
        </div>
      </Card>

      {(resumoNaturezas.length > 0 || ligadasDivida > 0) && (
        <Card padding="lg" className="flex flex-col gap-2">
          <h3 className="text-body font-semibold text-foreground">O que encontramos no extrato</h3>
          <div className="flex flex-wrap gap-1.5">
            {resumoNaturezas.map(([rotulo, n]) => (
              <Badge key={rotulo} variant="neutral" size="sm">
                {rotulo}: {n}
              </Badge>
            ))}
            {ligadasDivida > 0 && (
              <Badge variant="primary" size="sm">
                Ligados a dívidas: {ligadasDivida}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted">
            A categoria vem do jeito que você já classificou antes (o app aprende a cada importação) ou das regras do app. Ajuste o que
            precisar antes de confirmar.
          </p>
        </Card>
      )}

      <RegrasImportacao compacto />

      {verRejeitadas && rejeitados.length > 0 && (
        <Card padding="lg" className="flex min-w-0 flex-col gap-2">
          <h3 className="text-body font-semibold text-foreground">Linhas que não serão importadas</h3>
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-small">
            {rejeitados.map((r) => (
              <li key={r.linha} className="flex flex-wrap gap-x-2 border-b border-border py-1 last:border-0">
                <span className="font-medium text-foreground">Linha {r.linha}:</span>
                <span className="text-rose-700 dark:text-rose-300">{r.motivo}</span>
                <span className="w-full truncate text-xs text-muted" title={r.conteudo}>
                  {r.conteudo}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padding="lg" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-body font-semibold text-foreground">Lançamentos</h3>
          {duplicadas.size > 0 && (
            <label className="flex items-center gap-2 text-small text-foreground">
              <input type="checkbox" className="h-4 w-4" checked={incluirDuplicadas} onChange={(e) => alternarDuplicadas(e.target.checked)} />
              Incluir também as duplicadas
            </label>
          )}
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {validos.slice(0, visiveis).map((l, i) => {
            const dup = duplicadas.has(i);
            const c = classificacoes[i];
            const sg = sugestoes[i];
            const opcoesCategoria = categorias.filter((cat) => cat.tipo === l.tipo);
            return (
              <li key={i} className="flex flex-col">
                <label className={cn("flex cursor-pointer items-center gap-3 py-2", !selecionados.has(i) && "opacity-60")}>
                  <input type="checkbox" className="h-4 w-4 shrink-0" checked={selecionados.has(i)} onChange={() => alternar(i)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small font-medium text-foreground" title={l.descricao}>
                      {l.descricao}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      {dataBr(l.data)}
                      {l.categoriaTexto ? <span className="truncate">· {l.categoriaTexto.replace(/^'/, "")}</span> : null}
                      {dup && (
                        <Badge variant="warning" size="sm">
                          {sg?.jaLancado ?? motivosDuplicada.get(i) ?? "Duplicada"}
                        </Badge>
                      )}
                      {c && c.natureza !== "outro" && (
                        <Badge variant="neutral" size="sm">
                          {ROTULO_NATUREZA[c.natureza]}
                        </Badge>
                      )}
                      {c?.parcela && (
                        <Badge variant="neutral" size="sm">
                          Parcela {c.parcela.atual}/{c.parcela.total}
                        </Badge>
                      )}
                      {sg?.dividaNome && (
                        <Badge variant="primary" size="sm">
                          Dívida: {sg.dividaNome}
                        </Badge>
                      )}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-small font-semibold",
                      l.tipo === "receita" ? "text-primary-700 dark:text-primary-300" : "text-rose-700 dark:text-rose-300"
                    )}
                  >
                    {l.tipo === "receita" ? "+" : "−"}
                    {formatarMoeda(l.valor)}
                  </span>
                </label>
                {selecionados.has(i) && sg && (
                  <div className="mb-2 ml-7 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={sg.acao}
                        onChange={(e) => mudarAcao(i, e.target.value as AcaoExtrato)}
                        className="h-9 max-w-full rounded-lg border border-primary-300 bg-card px-2 text-xs font-medium text-foreground dark:border-primary-700"
                        aria-label="O que é isso?"
                      >
                        {acoesDoTipo(l.tipo).map((a) => (
                          <option key={a} value={a}>
                            {ROTULO_ACAO[a][l.tipo]}
                          </option>
                        ))}
                      </select>

                      {sg.acao === "transferencia" && (
                        <select
                          value={sg.transferirPara ?? ""}
                          onChange={(e) => mudarSugestao(i, { transferirPara: e.target.value || null })}
                          className="h-9 max-w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                          aria-label={l.tipo === "despesa" ? "Para qual carteira" : "De qual carteira"}
                        >
                          <option value="">{l.tipo === "despesa" ? "Para qual carteira?" : "De qual carteira?"}</option>
                          {destinosTransferencia.map((ct) => (
                            <option key={ct.id} value={ct.id}>
                              {ct.tipo === "cartao_credito" ? `Cartão ${ct.nome} (pagamento da fatura)` : ct.nome}
                            </option>
                          ))}
                        </select>
                      )}

                      {sg.acao === "divida" && (
                        <select
                          value={sg.dividaId ?? ""}
                          onChange={(e) => {
                            const d = dividas.find((x) => x.id === e.target.value);
                            mudarSugestao(i, { dividaId: d?.id ?? null, dividaNome: d?.nome ?? null });
                          }}
                          className="h-9 max-w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                          aria-label="Qual dívida"
                        >
                          <option value="">{dividas.length ? "Qual dívida?" : "Nenhuma dívida em aberto"}</option>
                          {dividas.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nome}
                            </option>
                          ))}
                        </select>
                      )}

                      {(sg.acao === "receb_emprestimo" || sg.acao === "receb_revenda") && (() => {
                        const tipoOp = sg.acao === "receb_emprestimo" ? "emprestimo" : "revenda";
                        const lista = operacoes.filter((o) => o.investimento.tipo === tipoOp);
                        const op = lista.find((o) => o.investimento.id === sg.investimentoId);
                        const parcelado = op?.investimento.forma_pagamento === "parcelado" && (op?.parcelasAbertas.length ?? 0) > 0;
                        return (
                          <>
                            <select
                              value={sg.investimentoId ?? ""}
                              onChange={(e) => escolherOperacao(i, e.target.value)}
                              className="h-9 max-w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                              aria-label={tipoOp === "emprestimo" ? "Qual empréstimo" : "Qual revenda"}
                            >
                              <option value="">
                                {lista.length ? (tipoOp === "emprestimo" ? "Qual empréstimo?" : "Qual revenda?") : tipoOp === "emprestimo" ? "Nenhum empréstimo em aberto" : "Nenhuma revenda em aberto"}
                              </option>
                              {lista.map((o) => (
                                <option key={o.investimento.id} value={o.investimento.id}>
                                  {o.rotulo}
                                </option>
                              ))}
                            </select>
                            {op && (parcelado || tipoOp === "emprestimo") && (
                              <select
                                value={sg.modoRecebimento === "parcela" ? `parcela:${sg.parcelaId ?? ""}` : (sg.modoRecebimento ?? "")}
                                onChange={(e) => escolherModo(i, e.target.value)}
                                className="h-9 max-w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                                aria-label="Como foi o recebimento"
                              >
                                {parcelado ? (
                                  <>
                                    {op.parcelasAbertas.map((p) => (
                                      <option key={p.id} value={`parcela:${p.id}`}>
                                        Parcela {p.numero} ({formatarMoeda(Number(p.valor))}, vence {dataBr(p.data_vencimento)})
                                      </option>
                                    ))}
                                    {tipoOp === "emprestimo" ? (
                                      <option value="quitar_parcelas">Quitou todas as parcelas de uma vez</option>
                                    ) : (
                                      <option value="recebimento">Recebimento avulso (fora das parcelas)</option>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <option value="quitacao">Quitação (fecha o empréstimo)</option>
                                    <option value="juros">Só os juros (o vencimento vai pro mês seguinte)</option>
                                  </>
                                )}
                              </select>
                            )}
                          </>
                        );
                      })()}

                      {(sg.acao === "emprestei" || sg.acao === "comprei_revenda") &&
                        (sg.lancadoPor ? (
                          <Badge variant="primary" size="sm">
                            {sg.lancadoPor}
                          </Badge>
                        ) : (
                          <Button type="button" size="sm" variant="secondary" onClick={() => onPreencherOperacao(i, sg.acao === "emprestei" ? "emprestimo" : "revenda")}>
                            {sg.acao === "emprestei" ? "Preencher o empréstimo" : "Preencher a revenda"}
                          </Button>
                        ))}

                      {(sg.acao === "normal" || sg.acao === "divida") && (
                        <select
                          value={sg.categoriaId ?? ""}
                          onChange={(e) => mudarSugestao(i, { categoriaId: e.target.value || null, origemCategoria: "manual" })}
                          className="h-9 max-w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                          aria-label="Categoria"
                        >
                          <option value="">Sem categoria</option>
                          {opcoesCategoria.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.nome}
                            </option>
                          ))}
                        </select>
                      )}
                      {sg.acao === "normal" && sg.origemCategoria === "historico" && <span className="text-xs text-muted">como você já classificou antes</span>}
                    </div>
                    {sg.acao === "transferencia" && (
                      <p className="text-xs text-muted">Não conta como gasto nem como receita — só move o dinheiro entre as suas carteiras.</p>
                    )}
                    {(sg.acao === "emprestei" || sg.acao === "comprei_revenda") && !sg.lancadoPor && (
                      <p className="text-xs text-amber-800 dark:text-amber-200">Abre o mesmo formulário da aba Investimentos, já com valor e data. A saída é lançada por ele.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {visiveis < validos.length && (
          <Button type="button" variant="tertiary" size="sm" onClick={() => setVisiveis((v) => v + POR_PAGINA)} className="self-center">
            Mostrar mais ({validos.length - visiveis} restantes)
          </Button>
        )}
      </Card>

      {faltaPreencher > 0 && (
        <p className="rounded-xl border border-amber-300 px-3 py-2 text-small text-foreground dark:border-amber-700">
          {faltaPreencher === 1 ? "1 linha marcada" : `${faltaPreencher} linhas marcadas`} como empréstimo/revenda ainda sem o formulário preenchido —{" "}
          {faltaPreencher === 1 ? "ela não será importada" : "elas não serão importadas"} até você tocar em &quot;Preencher&quot;.
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="tertiary" disabled={importando} onClick={onVoltar}>
            <ArrowLeft size={18} /> Voltar ao mapeamento
          </Button>
          <Button type="button" variant="tertiary" disabled={importando} onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
        <Button type="button" size="lg" disabled={total === 0 || importando} onClick={onConfirmar}>
          {importando ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
          {importando ? "Importando..." : `Confirmar e importar ${total} ${total === 1 ? "transação" : "transações"}`}
        </Button>
      </div>
    </div>
  );
}
