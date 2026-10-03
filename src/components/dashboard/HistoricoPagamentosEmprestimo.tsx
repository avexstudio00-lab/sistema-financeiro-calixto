"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, History } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import type { PagamentoInvestimento } from "@/lib/data/tipos";

export interface HistoricoPagamentosEmprestimoProps {
  pagamentos: PagamentoInvestimento[];
}

/** Histórico dos eventos "só juros" / "quitação" de um empréstimo. Desde
 * 03/out/2026 (item 4.5 da especificação) cada linha pode ser editada (data,
 * valor e proporção juros/diária) ou excluída individualmente — a exclusão
 * desfaz o efeito do evento no empréstimo (ver `excluirPagamentoInvestimento`
 * em src/lib/data/investimentos.ts). */
export function HistoricoPagamentosEmprestimo({ pagamentos, onAlterado }: HistoricoPagamentosEmprestimoProps) {
  const [expandido, setExpandido] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [excluindoId, setExcluindoId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ data: "", principal: "", diaria: "" });
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  if (pagamentos.length === 0) return null;
  const editavel = Boolean(onAlterado);

  function abrirEdicao(p: PagamentoInvestimento) {
    setExcluindoId(null);
    setErro(null);
    setEditandoId(p.id);
    const principal = p.tipo === "juros" ? p.valor_juros : Number(p.valor_pago) - Number(p.valor_diaria ?? 0);
    setForm({ data: p.data_pagamento, principal: paraTexto(principal), diaria: paraTexto(p.valor_diaria ?? 0) });
  }

  async function salvarEdicao(p: PagamentoInvestimento) {
    const principal = parsear(form.principal);
    const diaria = form.diaria.trim() === "" ? 0 : parsear(form.diaria);
    if (!form.data || !Number.isFinite(principal) || principal < 0 || !Number.isFinite(diaria) || diaria < 0) {
      setErro("Confira a data e os valores.");
      return;
    }
    setSalvando(true);
    const { error } = await editarPagamentoInvestimento(p, {
      dataPagamento: form.data,
      valorPrincipal: principal,
      valorDiaria: diaria,
    });
    setSalvando(false);
    if (error) {
      console.error("Erro ao editar pagamento do empréstimo:", error);
      setErro("Não deu pra salvar agora. Tente de novo.");
      return;
    }
    setEditandoId(null);
    await onAlterado?.();
  }

  async function confirmarExclusao(p: PagamentoInvestimento) {
    setSalvando(true);
    const { error } = await excluirPagamentoInvestimento(p);
    setSalvando(false);
    if (error) {
      console.error("Erro ao excluir pagamento do empréstimo:", error);
      setErro("Não deu pra excluir agora. Tente de novo.");
      return;
    }
    setExcluindoId(null);
    await onAlterado?.();
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <History size={13} className="text-muted" />
          Histórico de pagamentos ({pagamentos.length})
        </span>
        {expandido ? (
          <ChevronUp size={16} className="shrink-0 text-muted" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-muted" />
        )}
      </button>

      {expandido && (
        <div className="flex flex-col gap-1.5">
          {pagamentos.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 rounded-lg bg-muted/5 px-2.5 py-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium text-foreground">
                    {p.tipo === "juros" ? "Só juros" : "Quitação"} · {formatarMoeda(Number(p.valor_pago))}
                  </span>
                  <span className="text-muted">
                    {new Date(p.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR")}
                    {p.dias_atraso > 0 ? ` · ${p.dias_atraso} dia${p.dias_atraso === 1 ? "" : "s"} de atraso` : ""}
                    {p.valor_diaria ? ` · diária ${formatarMoeda(Number(p.valor_diaria))}` : ""}
                  </span>
                </div>
                {editavel && editandoId !== p.id && excluindoId !== p.id && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => abrirEdicao(p)}
                      aria-label="Editar pagamento"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-muted/10 hover:text-foreground"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditandoId(null);
                        setErro(null);
                        setExcluindoId(p.id);
                      }}
                      aria-label="Excluir pagamento"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-muted/10 hover:text-rose-700"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {editandoId === p.id && (
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
                  <DateMaskInput
                    label="Data do pagamento"
                    value={form.data}
                    onChange={(v) => setForm((f) => ({ ...f, data: v }))}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label={p.tipo === "juros" ? "Juros" : "Valor recebido"}
                      inputMode="decimal"
                      value={form.principal}
                      onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))}
                    />
                    <Input
                      label="Diária de atraso"
                      inputMode="decimal"
                      value={form.diaria}
                      onChange={(e) => setForm((f) => ({ ...f, diaria: e.target.value }))}
                    />
                  </div>
                  {erro && <p className="text-small text-rose-700">{erro}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" variant="tertiary" onClick={() => setEditandoId(null)}>
                      Cancelar
                    </Button>
                    <Button size="sm" disabled={salvando} onClick={() => salvarEdicao(p)}>
                      {salvando ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>
              )}

              {excluindoId === p.id && (
                <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-small text-amber-900">
                    {p.tipo === "juros"
                      ? "Excluir esse pagamento de juros? Se ele for o mais recente, o vencimento volta pra data de antes dele."
                      : "Excluir essa quitação? O empréstimo volta a ficar em aberto (e as parcelas dadas como pagas nessa data voltam a ficar pendentes)."}
                  </p>
                  {erro && <p className="text-small text-rose-700">{erro}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" variant="tertiary" onClick={() => setExcluindoId(null)}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={salvando}
                      onClick={() => confirmarExclusao(p)}
                      className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
                    >
                      {salvando ? "Excluindo..." : "Sim, excluir"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
