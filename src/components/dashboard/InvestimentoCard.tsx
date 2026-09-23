"use client";

import * as React from "react";
import {
  Trash2,
  Pencil,
  RefreshCw,
  TrendingUp,
  Landmark,
  LineChart as LineChartIcon,
  HandCoins,
  ShoppingBag,
  CalendarClock,
  AlertCircle,
  Banknote,
  CheckCircle2,
  Percent,
  PiggyBank,
  Building2,
  Home,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import {
  calcularValorAtualEstimado,
  calcularGanhoEstimado,
  calcularPercentualGanho,
  temCalculoAutomatico,
  ehTipoRevenda,
} from "@/lib/data/investimentos";
import { formatarMoeda } from "@/lib/format";
import { ParcelasInvestimento, type DadosJurosParcela } from "@/components/dashboard/ParcelasInvestimento";
import { HistoricoPagamentosEmprestimo } from "@/components/dashboard/HistoricoPagamentosEmprestimo";
import {
  RegistrarPagamentoEmprestimoDialog,
  type ContextoPagamentoEmprestimo,
} from "@/components/dashboard/RegistrarPagamentoEmprestimoDialog";
import type { Investimento, ParcelaInvestimento, PagamentoInvestimento, CotacoesMercado } from "@/lib/data/tipos";

export const TIPO_META: Record<Investimento["tipo"], { label: string; icone: LucideIcon }> = {
  cdi: { label: "CDI", icone: TrendingUp },
  poupanca: { label: "Poupança", icone: PiggyBank },
  cdb: { label: "CDB", icone: Building2 },
  lci: { label: "LCI", icone: Home },
  lca: { label: "LCA", icone: Sprout },
  tesouro: { label: "Tesouro Direto", icone: Landmark },
  bolsa: { label: "Bolsa de Valores", icone: LineChartIcon },
  emprestimo: { label: "Empréstimo", icone: HandCoins },
  revenda: { label: "Compra e revenda", icone: ShoppingBag },
};

function diasEntreHoje(dataIso: string): number {
  const hoje = new Date();
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const alvo = new Date(dataIso + "T00:00:00");
  return Math.round((alvo.getTime() - hojeSemHora.getTime()) / (1000 * 60 * 60 * 24));
}

export interface InvestimentoCardProps {
  inv: Investimento;
  parcelas: ParcelaInvestimento[];
  /** Eventos de "só juros"/quitação já registrados nesse empréstimo — ver
   * `listarPagamentosInvestimento` em src/lib/data/investimentos.ts. */
  pagamentos?: PagamentoInvestimento[];
  /** Cotações ao vivo (CDI, câmbio, títulos do Tesouro Direto) — vem de
   * `obterCotacoesMercado()` na página. Undefined enquanto ainda está
   * buscando ou se a busca falhou; nesses casos os tipos "cdi"/"tesouro com
   * título" caem pro cálculo com a taxa gravada no investimento. */
  cotacoes?: CotacoesMercado;
  salvando: boolean;
  onSalvarTaxa: (inv: Investimento, novaTaxa: number) => void | Promise<void>;
  onAtualizarValor: (inv: Investimento, novoValor: number) => void | Promise<void>;
  onEditarEmprestimo: (
    inv: Investimento,
    dados: { valorRetornavel: number; dataVencimentoFinal: string }
  ) => void | Promise<void>;
  onExcluir: (inv: Investimento) => void | Promise<void>;
  onAlternarParcela: (parcela: ParcelaInvestimento) => void | Promise<void>;
  onEditarDataParcela: (parcela: ParcelaInvestimento, novaDataIso: string) => void | Promise<void>;
  /** Edita a diária de atraso combinada (R$/dia) — só empréstimo. */
  onAtualizarDiaria?: (inv: Investimento, valorDiaria: number | null) => void | Promise<void>;
  /** "Só juros" no empréstimo à vista (rola o vencimento 1 mês). */
  onRegistrarJurosAvista?: (
    inv: Investimento,
    dados: { valorJuros: number; valorDiaria: number; dataPagamento: string }
  ) => void | Promise<void>;
  /** Quitação total do empréstimo à vista (fecha de vez). */
  onRegistrarQuitacao?: (
    inv: Investimento,
    dados: { valorPago: number; valorDiaria: number; dataPagamento: string }
  ) => void | Promise<void>;
  /** Quitação antecipada de todas as parcelas em aberto de um parcelado. */
  onRegistrarQuitacaoAntecipada?: (
    inv: Investimento,
    parcelasEmAberto: ParcelaInvestimento[],
    dados: { valorPago: number; valorDiaria: number; dataPagamento: string }
  ) => void | Promise<void>;
  /** "Só juros" numa parcela específica de um empréstimo parcelado. */
  onRegistrarJurosParcela?: (parcela: ParcelaInvestimento, dados: DadosJurosParcela) => void | Promise<void>;
}

export function InvestimentoCard({
  inv,
  parcelas,
  pagamentos = [],
  cotacoes,
  salvando,
  onSalvarTaxa,
  onAtualizarValor,
  onEditarEmprestimo,
  onExcluir,
  onAlternarParcela,
  onEditarDataParcela,
  onAtualizarDiaria,
  onRegistrarJurosAvista,
  onRegistrarQuitacao,
  onRegistrarQuitacaoAntecipada,
  onRegistrarJurosParcela,
}: InvestimentoCardProps) {
  const [editandoTaxa, setEditandoTaxa] = React.useState(false);
  const [taxaEmEdicao, setTaxaEmEdicao] = React.useState("");
  const [editandoValor, setEditandoValor] = React.useState(false);
  const [valorEmEdicao, setValorEmEdicao] = React.useState("");
  const [editandoEmprestimo, setEditandoEmprestimo] = React.useState(false);
  const [valorRetornavelEmEdicao, setValorRetornavelEmEdicao] = React.useState("");
  const [dataVencimentoEmEdicao, setDataVencimentoEmEdicao] = React.useState("");
  const [erroEmprestimo, setErroEmprestimo] = React.useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = React.useState(false);
  const [editandoDiaria, setEditandoDiaria] = React.useState(false);
  const [diariaEmEdicao, setDiariaEmEdicao] = React.useState("");
  const [dialogoPagamento, setDialogoPagamento] = React.useState<ContextoPagamentoEmprestimo | null>(null);

  const ganho = calcularGanhoEstimado(inv, undefined, cotacoes);
  const percentual = calcularPercentualGanho(inv, undefined, cotacoes);
  const valorAtual = calcularValorAtualEstimado(inv, undefined, cotacoes);
  const Icone = TIPO_META[inv.tipo].icone;
  const automatico = temCalculoAutomatico(inv.tipo);
  const revenda = ehTipoRevenda(inv.tipo);
  // CDI e Poupança são sempre automáticos (taxa/rendimento ao vivo do Banco
  // Central) -- não tem o que editar manualmente, então nem mostra o botão
  // de taxa, só um badge informativo. CDB/LCI/LCA também são automáticos,
  // mas com um percentual do CDI que a pessoa combinou com o banco -- esse
  // sim continua editável (cai no branch genérico `automatico` abaixo).
  const cdiAoVivo = inv.tipo === "cdi";
  const poupancaAoVivo = inv.tipo === "poupanca";
  const rendaFixaPercentualCdi = inv.tipo === "cdb" || inv.tipo === "lci" || inv.tipo === "lca";
  // Tesouro com título vinculado (fluxo novo, escolhido na criação a partir
  // da lista ao vivo) usa o PU de venda atual em vez de uma taxa digitada.
  // Tesouro sem título (fluxo legado) continua editável por taxa manual.
  const tituloAoVivo = inv.titulo_tesouro
    ? cotacoes?.titulosTesouro.find((t) => t.chave === inv.titulo_tesouro)
    : undefined;
  const tesouroComTitulo = inv.tipo === "tesouro" && !!inv.titulo_tesouro;
  const emprestimoNovoEstilo = inv.tipo === "emprestimo" && inv.valor_retornavel != null && inv.data_vencimento_final != null;
  const emprestimoAVista = inv.tipo === "emprestimo" && inv.forma_pagamento !== "parcelado";
  const parcelasEmAberto = parcelas.filter((p) => !p.pago);
  // Editar o "valor com juros" depois de criado só faz sentido pro
  // empréstimo à vista: no parcelado, `data_vencimento_final` é sempre
  // derivado do vencimento das parcelas (ver `recalcularVencimentoFinalDoInvestimento`),
  // e as parcelas em si (cada uma com seu próprio valor) não seriam
  // re-geradas por essa edição — mexer só no valor agregado deixaria a soma
  // das parcelas dessincronizada do valor retornável exibido.
  const podeEditarEmprestimo = emprestimoNovoEstilo && emprestimoAVista;

  function parsearValor(texto: string): number {
    const v = texto.trim().replace(/\./g, "").replace(",", ".");
    return Number(v);
  }

  function handleSalvarTaxa() {
    const valor = Number(taxaEmEdicao.replace(",", "."));
    if (Number.isNaN(valor)) return;
    setEditandoTaxa(false);
    onSalvarTaxa(inv, valor);
  }

  function handleAtualizarValor() {
    const valor = parsearValor(valorEmEdicao);
    if (!valor || valor < 0) return;
    setEditandoValor(false);
    onAtualizarValor(inv, valor);
  }

  function handleSalvarEmprestimo() {
    const valor = parsearValor(valorRetornavelEmEdicao);
    if (!valor || valor <= 0 || !dataVencimentoEmEdicao) {
      setErroEmprestimo("Preencha o valor com juros e a data de pagamento.");
      return;
    }
    if (valor < Number(inv.valor_investido)) {
      setErroEmprestimo(`O valor com juros precisa ser pelo menos o valor emprestado (${formatarMoeda(Number(inv.valor_investido))}).`);
      return;
    }
    if (dataVencimentoEmEdicao <= inv.data_inicio) {
      setErroEmprestimo("A data de pagamento precisa ser depois da data de início.");
      return;
    }
    setErroEmprestimo(null);
    setEditandoEmprestimo(false);
    onEditarEmprestimo(inv, { valorRetornavel: valor, dataVencimentoFinal: dataVencimentoEmEdicao });
  }

  function handleSalvarDiaria() {
    const texto = diariaEmEdicao.trim();
    setEditandoDiaria(false);
    if (!texto) {
      onAtualizarDiaria?.(inv, null);
      return;
    }
    const valor = parsearValor(texto);
    if (!Number.isFinite(valor) || valor < 0) return;
    onAtualizarDiaria?.(inv, valor || null);
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Icone size={18} />
          </span>
          <div>
            <p className="text-body font-semibold text-foreground">{inv.nome}</p>
            <p className="text-xs text-muted">
              {TIPO_META[inv.tipo].label}
              {inv.forma_pagamento === "parcelado" && inv.numero_parcelas ? ` · ${inv.numero_parcelas}x` : ""}
              {inv.descricao ? ` · ${inv.descricao}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className={emprestimoNovoEstilo ? "grid grid-cols-2 gap-2 text-small" : "grid grid-cols-3 gap-2 text-small"}>
        <div>
          <p className="text-xs text-muted">{inv.tipo === "emprestimo" ? "Emprestado" : revenda ? "Custo" : "Investido"}</p>
          <p className="font-semibold text-foreground">{formatarMoeda(Number(inv.valor_investido))}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Ganho até agora</p>
          <p className={`font-semibold ${ganho >= 0 ? "text-primary-600" : "text-red-500"}`}>
            {ganho >= 0 ? "+" : ""}
            {formatarMoeda(ganho)}
            <span className="ml-1 text-xs font-normal">
              ({percentual >= 0 ? "+" : ""}
              {percentual.toFixed(1)}%)
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">{revenda ? "Valor de venda" : "Valor atual"}</p>
          <p className="font-semibold text-secondary">{formatarMoeda(valorAtual)}</p>
        </div>
        {emprestimoNovoEstilo && (
          <div>
            <p className="text-xs text-muted">Valor retornável</p>
            <p className="font-semibold text-foreground">{formatarMoeda(Number(inv.valor_retornavel))}</p>
          </div>
        )}
      </div>

      {inv.tipo === "emprestimo" && inv.quitado && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary-600">
          <CheckCircle2 size={13} className="shrink-0" />
          Quitado{inv.data_quitacao ? ` em ${new Date(inv.data_quitacao + "T00:00:00").toLocaleDateString("pt-BR")}` : ""}
          {inv.valor_quitado != null ? ` · ${formatarMoeda(Number(inv.valor_quitado))} recebido` : ""}
        </div>
      )}

      {emprestimoNovoEstilo && !inv.quitado && inv.data_vencimento_final && (
        <div className="flex items-center gap-1.5 text-xs">
          <CalendarClock size={13} className="shrink-0 text-muted" />
          {(() => {
            const dias = diasEntreHoje(inv.data_vencimento_final);
            if (dias > 0)
              return (
                <span className="text-muted">
                  Vence em {dias} {dias === 1 ? "dia" : "dias"} (
                  {new Date(inv.data_vencimento_final + "T00:00:00").toLocaleDateString("pt-BR")})
                </span>
              );
            if (dias === 0) return <span className="font-medium text-amber-600">Vence hoje</span>;
            return (
              <span className="flex items-center gap-1 font-medium text-red-600">
                <AlertCircle size={12} />
                Venceu há {Math.abs(dias)} {Math.abs(dias) === 1 ? "dia" : "dias"}
              </span>
            );
          })()}
        </div>
      )}

      <p className="text-xs text-muted">
        Desde {new Date(inv.data_inicio + "T00:00:00").toLocaleDateString("pt-BR")}
      </p>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        {podeEditarEmprestimo && editandoEmprestimo && erroEmprestimo && (
          <p className="text-xs text-rose-600">{erroEmprestimo}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
        {podeEditarEmprestimo ? (
          editandoEmprestimo ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-28">
                <Input
                  value={valorRetornavelEmEdicao}
                  onChange={(e) => setValorRetornavelEmEdicao(e.target.value)}
                  inputMode="decimal"
                  placeholder="Valor com juros"
                />
              </div>
              <DateMaskInput value={dataVencimentoEmEdicao} onChange={setDataVencimentoEmEdicao} />
              <Button size="sm" variant="secondary" disabled={salvando} onClick={handleSalvarEmprestimo}>
                Salvar
              </Button>
              <Button
                size="sm"
                variant="tertiary"
                onClick={() => {
                  setEditandoEmprestimo(false);
                  setErroEmprestimo(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditandoEmprestimo(true);
                setErroEmprestimo(null);
                setValorRetornavelEmEdicao(String(inv.valor_retornavel ?? "").replace(".", ","));
                setDataVencimentoEmEdicao(inv.data_vencimento_final ?? "");
              }}
              className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
            >
              <Pencil size={12} />
              Editar valor com juros
            </button>
          )
        ) : emprestimoNovoEstilo ? null : cdiAoVivo ? (
          <span className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground">
            <TrendingUp size={12} />
            CDI atual: {cotacoes?.cdi != null ? `${String(cotacoes.cdi).replace(".", ",")}% ao ano` : "buscando..."}
          </span>
        ) : poupancaAoVivo ? (
          <span className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground">
            <PiggyBank size={12} />
            Poupança atual:{" "}
            {cotacoes?.poupanca != null ? `${cotacoes.poupanca.toFixed(2).replace(".", ",")}% ao ano` : "buscando..."}
          </span>
        ) : tesouroComTitulo ? (
          <span className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground">
            <Landmark size={12} />
            {tituloAoVivo ? `PU atual: ${formatarMoeda(tituloAoVivo.puVenda)}` : "Aguardando cotação do título..."}
          </span>
        ) : automatico ? (
          editandoTaxa ? (
            <div className="flex items-center gap-2">
              <div className="w-24">
                <Input
                  value={taxaEmEdicao}
                  onChange={(e) => setTaxaEmEdicao(e.target.value)}
                  inputMode="decimal"
                  placeholder="Taxa %"
                />
              </div>
              <Button size="sm" variant="secondary" disabled={salvando} onClick={handleSalvarTaxa}>
                Salvar
              </Button>
              <Button size="sm" variant="tertiary" onClick={() => setEditandoTaxa(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditandoTaxa(true);
                setTaxaEmEdicao(String(inv.taxa ?? "").replace(".", ","));
              }}
              className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
            >
              <Pencil size={12} />
              Taxa: {inv.taxa ?? 0}%{" "}
              {inv.tipo === "emprestimo"
                ? inv.tipo_ganho === "mensal"
                  ? "ao mês"
                  : "fixo"
                : rendaFixaPercentualCdi
                  ? "do CDI"
                  : "ao ano"}
            </button>
          )
        ) : editandoValor ? (
          <div className="flex items-center gap-2">
            <div className="w-28">
              <Input
                value={valorEmEdicao}
                onChange={(e) => setValorEmEdicao(e.target.value)}
                inputMode="decimal"
                placeholder={revenda ? "Valor de venda" : "Novo valor"}
              />
            </div>
            <Button size="sm" variant="secondary" disabled={salvando} onClick={handleAtualizarValor}>
              Salvar
            </Button>
            <Button size="sm" variant="tertiary" onClick={() => setEditandoValor(false)}>
              Cancelar
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditandoValor(true);
              setValorEmEdicao(String(inv.valor_atual).replace(".", ","));
            }}
            className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
          >
            <RefreshCw size={12} />
            {revenda ? "Registrar venda" : "Atualizar valor"}
          </button>
        )}

        {inv.tipo === "emprestimo" && emprestimoNovoEstilo && (
          editandoDiaria ? (
            <div className="flex items-center gap-2">
              <div className="w-24">
                <Input
                  value={diariaEmEdicao}
                  onChange={(e) => setDiariaEmEdicao(e.target.value)}
                  inputMode="decimal"
                  placeholder="R$/dia"
                />
              </div>
              <Button size="sm" variant="secondary" disabled={salvando} onClick={handleSalvarDiaria}>
                Salvar
              </Button>
              <Button size="sm" variant="tertiary" onClick={() => setEditandoDiaria(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditandoDiaria(true);
                setDiariaEmEdicao(inv.valor_diaria != null ? String(inv.valor_diaria).replace(".", ",") : "");
              }}
              className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
            >
              <Percent size={12} />
              Diária: {inv.valor_diaria ? `${formatarMoeda(Number(inv.valor_diaria))}/dia` : "sem cobrança"}
            </button>
          )
        )}

        {inv.tipo === "emprestimo" && emprestimoNovoEstilo && !inv.quitado && emprestimoAVista && (
          <button
            type="button"
            onClick={() => setDialogoPagamento({ modo: "avista", investimento: inv })}
            className="flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
          >
            <Banknote size={12} />
            Registrar pagamento
          </button>
        )}

        {inv.tipo === "emprestimo" && emprestimoNovoEstilo && !inv.quitado && !emprestimoAVista && parcelasEmAberto.length > 0 && (
          <button
            type="button"
            onClick={() => setDialogoPagamento({ modo: "quitacaoAntecipada", investimento: inv, parcelasEmAberto })}
            className="flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
          >
            <Banknote size={12} />
            Quitar tudo agora
          </button>
        )}

        {confirmandoExclusao ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted">Apagar?</span>
            <Button size="sm" variant="tertiary" onClick={() => setConfirmandoExclusao(false)}>
              Não
            </Button>
            <Button
              size="sm"
              disabled={salvando}
              onClick={() => {
                setConfirmandoExclusao(false);
                onExcluir(inv);
              }}
              className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
            >
              Sim, apagar
            </Button>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Apagar investimento"
            onClick={() => setConfirmandoExclusao(true)}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-red-500"
          >
            <Trash2 size={16} />
          </button>
        )}
        </div>
      </div>

      <ParcelasInvestimento
        parcelas={parcelas}
        periodicidade={inv.periodicidade_parcelas}
        valorDiariaPorDia={inv.valor_diaria}
        salvando={salvando}
        onAlternarPaga={onAlternarParcela}
        onEditarData={onEditarDataParcela}
        onRegistrarJuros={onRegistrarJurosParcela}
      />

      {inv.tipo === "emprestimo" && <HistoricoPagamentosEmprestimo pagamentos={pagamentos} />}

      {dialogoPagamento && (
        <RegistrarPagamentoEmprestimoDialog
          contexto={dialogoPagamento}
          salvando={salvando}
          onFechar={() => setDialogoPagamento(null)}
          onRegistrarJuros={async (dados) => {
            await onRegistrarJurosAvista?.(inv, dados);
            setDialogoPagamento(null);
          }}
          onRegistrarQuitacao={async (dados) => {
            if (dialogoPagamento.modo === "avista") {
              await onRegistrarQuitacao?.(inv, dados);
            } else {
              await onRegistrarQuitacaoAntecipada?.(inv, dialogoPagamento.parcelasEmAberto, dados);
            }
            setDialogoPagamento(null);
          }}
        />
      )}
    </Card>
  );
}
