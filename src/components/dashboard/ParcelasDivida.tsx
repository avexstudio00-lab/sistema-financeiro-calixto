"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Check, AlertCircle, Wallet, Pencil, Trash2 } from "lucide-react";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import { resumirParcelasDivida } from "@/lib/data/dividas";
import type { ParcelaDividaComStatus, StatusParcelaDividaManual } from "@/lib/data/dividas";
import type { Conta } from "@/lib/data/tipos";

export interface ParcelasDividaProps {
  parcelas: ParcelaDividaComStatus[];
  contas: Conta[];
  /** Sem conta cadastrada ainda, ou sem categoria "Dívida" encontrada
   * (usuário apagou a categoria padrão) -- desabilita o botão de um clique,
   * mas a lista de parcelas continua aparecendo normalmente. */
  podeRegistrarPagamento: boolean;
  salvando: boolean;
  onRegistrarPagamento: (parcela: ParcelaDividaComStatus, contaId: string | null) => void | Promise<void>;
  /** Item 5.1: editar valor, vencimento e status de UMA parcela. */
  onEditarParcela?: (
    parcela: ParcelaDividaComStatus,
    dados: { valor: number; dataVencimento: string; status: StatusParcelaDividaManual }
  ) => void | Promise<void>;
  /** Item 5.1: excluir só esta parcela (as outras ficam como estão). */
  onExcluirParcela?: (parcela: ParcelaDividaComStatus) => void | Promise<void>;
}

const ROTULO_STATUS: Record<StatusParcelaDividaManual, string> = {
  automatico: "Automático (pelo que já foi pago)",
  pendente: "Pendente",
  pago: "Pago",
  vencido: "Vencido",
};

/**
 * Lista de parcelas de uma dívida parcelada -- versão simplificada de
 * ParcelasInvestimento.tsx (sem "juros"/"empurrar seguintes", que são só do
 * tipo Empréstimo em Investimentos e não foram pedidos aqui, ver decisão do
 * usuário em 23/set/2026). O status de cada parcela (paga/pendente/atrasada)
 * já vem calculado de fora (`calcularStatusParcelasDivida`, cascata sobre o
 * valor_pago real) -- este componente só exibe, nunca marca nada na mão.
 * "Registrar pagamento" só aparece na PRÓXIMA parcela pendente (a cascata
 * não tem como saber se um clique numa parcela futura deveria "pular" as
 * anteriores) -- pagar fora de ordem continua possível pelo caminho manual
 * (selecionar "Qual dívida?" numa anotação normal).
 */
export function ParcelasDivida({
  parcelas,
  contas,
  podeRegistrarPagamento,
  salvando,
  onRegistrarPagamento,
  onEditarParcela,
  onExcluirParcela,
}: ParcelasDividaProps) {
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [valorEdicao, setValorEdicao] = React.useState("");
  const [dataEdicao, setDataEdicao] = React.useState("");
  const [statusEdicao, setStatusEdicao] = React.useState<StatusParcelaDividaManual>("automatico");
  const [confirmandoExclusao, setConfirmandoExclusao] = React.useState(false);
  const [erroEdicao, setErroEdicao] = React.useState<string | null>(null);

  function abrirEdicao(p: ParcelaDividaComStatus) {
    setPagandoId(null);
    setEditandoId(p.id);
    setValorEdicao(Number(p.valor).toFixed(2).replace(".", ","));
    setDataEdicao(p.data_vencimento);
    setStatusEdicao(p.status_manual ?? "automatico");
    setConfirmandoExclusao(false);
    setErroEdicao(null);
  }

  async function salvarEdicao(p: ParcelaDividaComStatus) {
    const valor = Number(valorEdicao.trim().replace(/\./g, "").replace(",", "."));
    if (!valor || valor <= 0) {
      setErroEdicao("Digite um valor válido.");
      return;
    }
    if (!dataEdicao) {
      setErroEdicao("Escolha o vencimento.");
      return;
    }
    await onEditarParcela?.(p, { valor, dataVencimento: dataEdicao, status: statusEdicao });
    setEditandoId(null);
  }
  const [expandido, setExpandido] = React.useState(false);
  const [pagandoId, setPagandoId] = React.useState<string | null>(null);
  const [contaSelecionadaId, setContaSelecionadaId] = React.useState<string>(contas[0]?.id ?? "");
  const resumo = React.useMemo(() => resumirParcelasDivida(parcelas), [parcelas]);

  React.useEffect(() => {
    if (!contaSelecionadaId && contas[0]) setContaSelecionadaId(contas[0].id);
  }, [contas, contaSelecionadaId]);

  if (parcelas.length === 0) return null;

  function abrirPagamento(parcelaId: string) {
    setPagandoId(parcelaId);
  }

  async function confirmarPagamento(parcela: ParcelaDividaComStatus) {
    await onRegistrarPagamento(parcela, contaSelecionadaId || null);
    setPagandoId(null);
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="flex items-center justify-between gap-2 text-left"
      >
        <div className="flex flex-1 flex-col gap-1">
          <span className="flex items-center gap-2 text-xs font-medium text-foreground">
            {resumo.pagas} de {resumo.total} parcelas pagas
            {resumo.atrasadas > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-red-600">
                <AlertCircle size={11} />
                {resumo.atrasadas === 1 ? "1 em atraso" : `${resumo.atrasadas} em atraso`}
              </span>
            )}
          </span>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/10">
            <div
              className="h-full rounded-full bg-rose-500 transition-all"
              style={{ width: `${resumo.total ? (resumo.pagas / resumo.total) * 100 : 0}%` }}
            />
          </div>
        </div>
        {expandido ? (
          <ChevronUp size={16} className="shrink-0 text-muted" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-muted" />
        )}
      </button>

      {expandido && (
        <div className="flex flex-col gap-1.5">
          {parcelas.map((parcela) => {
            const ehProximaPendente = resumo.proxima?.id === parcela.id;
            const emPagamento = pagandoId === parcela.id || editandoId === parcela.id;
            return (
              <div
                key={parcela.id}
                className={cn(
                  "flex flex-col gap-2 rounded-lg px-2.5 py-1.5 text-xs",
                  parcela.paga ? "bg-primary-50/60" : parcela.atrasada ? "bg-rose-50" : "bg-muted/5"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">
                      Parcela {parcela.numero} · {formatarMoeda(Number(parcela.valor))}
                      {parcela.status_manual ? <span className="ml-1 text-xs font-normal text-muted">(status manual)</span> : null}
                    </span>
                    {!emPagamento && (
                      <span className={cn("text-xs", parcela.atrasada ? "text-red-600" : "text-muted")}>
                        Vence {new Date(parcela.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                        {parcela.atrasada ? " · atrasada" : ""}
                      </span>
                    )}
                  </div>
                  {!emPagamento && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {onEditarParcela && (
                        <button
                          type="button"
                          onClick={() => abrirEdicao(parcela)}
                          aria-label={`Editar parcela ${parcela.numero}`}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-muted/10 hover:text-foreground"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                      {parcela.paga ? (
                        <span className="flex items-center gap-1 rounded-full bg-primary-500 px-2.5 py-1 text-xs font-medium text-white">
                          <Check size={11} />
                          Paga
                        </span>
                      ) : ehProximaPendente && podeRegistrarPagamento ? (
                        <button
                          type="button"
                          disabled={salvando}
                          onClick={() => abrirPagamento(parcela.id)}
                          className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-inset ring-border hover:bg-muted/10"
                        >
                          <Wallet size={11} />
                          Registrar pagamento
                        </button>
                      ) : (
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                            parcela.atrasada ? "bg-rose-50 text-red-700 ring-rose-200" : "bg-white text-muted ring-border"
                          )}
                        >
                          {parcela.atrasada ? "Vencida" : "Pendente"}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {editandoId === parcela.id && (
                  <div className="flex flex-col gap-2 rounded-lg bg-card p-2.5 ring-1 ring-inset ring-border">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-32">
                        <Input label="Valor" inputMode="decimal" value={valorEdicao} onChange={(e) => setValorEdicao(e.target.value)} />
                      </div>
                      <DateMaskInput label="Vencimento" value={dataEdicao} onChange={setDataEdicao} />
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-foreground">Status</span>
                      <select
                        value={statusEdicao}
                        onChange={(e) => setStatusEdicao(e.target.value as StatusParcelaDividaManual)}
                        className="h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                      >
                        {(Object.keys(ROTULO_STATUS) as StatusParcelaDividaManual[]).map((st) => (
                          <option key={st} value={st}>
                            {ROTULO_STATUS[st]}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-muted">
                        &quot;Pago&quot; marca como paga sem lançar nada no extrato (use para o que foi pago por fora). Para tirar o dinheiro de uma carteira, use
                        &quot;Registrar pagamento&quot;.
                      </span>
                    </label>
                    {erroEdicao && <p className="text-xs text-rose-700">{erroEdicao}</p>}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() => salvarEdicao(parcela)}
                        className="flex h-9 items-center rounded-xl bg-primary-700 px-3 text-xs font-medium text-white hover:bg-primary-800 disabled:opacity-60"
                      >
                        Salvar parcela
                      </button>
                      <button type="button" onClick={() => setEditandoId(null)} className="h-9 rounded-xl px-3 text-xs font-medium text-muted hover:bg-muted/10">
                        Cancelar
                      </button>
                    </div>
                    <p className="text-xs text-muted">O total da dívida é recalculado pela soma das parcelas. As outras parcelas não mudam.</p>
                    {onExcluirParcela &&
                      (confirmandoExclusao ? (
                        <div className="flex flex-col gap-2 rounded-lg bg-rose-50 p-2.5">
                          <p className="text-xs text-foreground">
                            Excluir só a parcela {parcela.numero}? As demais continuam iguais e pagamentos já lançados no extrato não são apagados.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={salvando}
                              onClick={async () => {
                                await onExcluirParcela(parcela);
                                setEditandoId(null);
                              }}
                              className="flex h-9 items-center rounded-xl bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                            >
                              Excluir parcela
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmandoExclusao(false)}
                              className="h-9 rounded-xl px-3 text-xs font-medium text-muted hover:bg-muted/10"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : parcelas.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setConfirmandoExclusao(true)}
                          className="flex items-center gap-1.5 self-start text-xs font-medium text-rose-700 hover:underline dark:text-rose-300"
                        >
                          <Trash2 size={12} /> Excluir só esta parcela
                        </button>
                      ) : (
                        <p className="text-xs text-muted">É a única parcela — para tirar, apague a dívida inteira.</p>
                      ))}
                  </div>
                )}
                {pagandoId === parcela.id && (
                  <div className="flex flex-col gap-2 rounded-lg bg-white p-2.5 ring-1 ring-inset ring-border">
                    {contas.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-foreground">De qual conta saiu?</span>
                        <select
                          value={contaSelecionadaId}
                          onChange={(e) => setContaSelecionadaId(e.target.value)}
                          className="h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
                        >
                          {contas.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <p className="text-xs text-muted">
                        Sem carteira cadastrada — o pagamento é anotado sem ajustar saldo de nenhuma conta.
                      </p>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() => confirmarPagamento(parcela)}
                        className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-primary-500 px-3 text-xs font-medium text-white transition-all hover:bg-primary-600 disabled:opacity-60"
                      >
                        {salvando ? "Salvando..." : `Confirmar ${formatarMoeda(Number(parcela.valor))}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPagandoId(null)}
                        className="h-9 rounded-xl px-3 text-xs font-medium text-muted hover:bg-muted/10"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
