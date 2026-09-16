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
import { ParcelasInvestimento } from "@/components/dashboard/ParcelasInvestimento";
import type { Investimento, ParcelaInvestimento } from "@/lib/data/tipos";

export const TIPO_META: Record<Investimento["tipo"], { label: string; icone: LucideIcon }> = {
  cdi: { label: "CDI", icone: TrendingUp },
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
}

export function InvestimentoCard({
  inv,
  parcelas,
  salvando,
  onSalvarTaxa,
  onAtualizarValor,
  onEditarEmprestimo,
  onExcluir,
  onAlternarParcela,
  onEditarDataParcela,
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

  const ganho = calcularGanhoEstimado(inv);
  const percentual = calcularPercentualGanho(inv);
  const valorAtual = calcularValorAtualEstimado(inv);
  const Icone = TIPO_META[inv.tipo].icone;
  const automatico = temCalculoAutomatico(inv.tipo);
  const revenda = ehTipoRevenda(inv.tipo);
  const emprestimoNovoEstilo = inv.tipo === "emprestimo" && inv.valor_retornavel != null && inv.data_vencimento_final != null;
  const emprestimoAVista = inv.tipo === "emprestimo" && inv.forma_pagamento !== "parcelado";
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

      {emprestimoNovoEstilo && inv.data_vencimento_final && (
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
              <div className="w-32">
                <DateMaskInput value={dataVencimentoEmEdicao} onChange={setDataVencimentoEmEdicao} />
              </div>
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
        ) : emprestimoNovoEstilo ? null : automatico ? (
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
              {inv.tipo === "emprestimo" ? (inv.tipo_ganho === "mensal" ? "ao mês" : "fixo") : "ao ano"}
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
        salvando={salvando}
        onAlternarPaga={onAlternarParcela}
        onEditarData={onEditarDataParcela}
      />
    </Card>
  );
}
