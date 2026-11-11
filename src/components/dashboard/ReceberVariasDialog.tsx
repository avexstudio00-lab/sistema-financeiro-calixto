"use client";

import * as React from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { SeletorCarteira } from "@/components/dashboard/SeletorCarteira";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { normalizarTexto } from "@/lib/util/texto";
import type { OperacaoAberta } from "@/lib/data/importarLigacoes";
import { itensAbertos, preSelecionar, type AlocacaoRecebimento, type ItemAberto } from "@/lib/data/receberVarias";

function dataBr(iso: string | null) {
  if (!iso) return "sem data";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function parsear(texto: string): number {
  const t = texto.trim();
  if (!t) return 0;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}

function paraTexto(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

/**
 * "Receber várias de uma vez" (10/nov/2026). Dois jeitos de usar:
 *  - tela de Investimentos: a pessoa digita quanto recebeu, a data e a
 *    carteira; ao confirmar, já grava (`onConfirmarManual`);
 *  - importação de extrato: valor e data vêm da linha do extrato (fixos);
 *    ao confirmar, devolve a divisão (`onConfirmarDivisao`) e a gravação
 *    acontece junto com o resto da importação.
 * Pré-seleção: o que vence no dia do pagamento; se bater a soma, pronto.
 */
export function ReceberVariasDialog({
  operacoes,
  filtroInicial = "",
  valorFixo,
  dataFixa,
  salvando = false,
  onFechar,
  onConfirmarManual,
  onConfirmarDivisao,
}: {
  operacoes: OperacaoAberta[];
  filtroInicial?: string;
  valorFixo?: number;
  dataFixa?: string;
  salvando?: boolean;
  onFechar: () => void;
  onConfirmarManual?: (dados: { contaId: string; data: string; alocacoes: AlocacaoRecebimento[] }) => void | Promise<void>;
  onConfirmarDivisao?: (alocacoes: AlocacaoRecebimento[]) => void;
}) {
  const modoExtrato = valorFixo != null;
  const [filtro, setFiltro] = React.useState(filtroInicial);
  const [valorTexto, setValorTexto] = React.useState(valorFixo != null ? paraTexto(valorFixo) : "");
  const [data, setData] = React.useState(dataFixa ?? new Date().toISOString().slice(0, 10));
  const [contaId, setContaId] = React.useState("");
  const [valores, setValores] = React.useState<Map<string, string>>(new Map());
  const [modosAvista, setModosAvista] = React.useState<Map<string, "quitacao" | "juros">>(new Map());

  const todos = React.useMemo(() => itensAbertos(operacoes), [operacoes]);
  const visiveis = React.useMemo(() => {
    const termo = normalizarTexto(filtro).trim();
    if (!termo) return todos;
    return todos.filter((i) => normalizarTexto(i.rotulo).includes(termo) || normalizarTexto(i.operacao.investimento.codigo ?? "") === termo);
  }, [todos, filtro]);

  const valorTotal = modoExtrato ? (valorFixo as number) : parsear(valorTexto);

  // Pré-seleciona quando muda o valor, a data ou o filtro.
  const sugerir = React.useCallback(() => {
    if (!(valorTotal > 0)) return;
    const { valores: sugeridos } = preSelecionar(visiveis, valorTotal, data);
    const novos = new Map<string, string>();
    sugeridos.forEach((v, k) => novos.set(k, paraTexto(v)));
    setValores(novos);
  }, [valorTotal, data, visiveis]);
  React.useEffect(() => {
    sugerir();
  }, [sugerir]);

  function alternar(item: ItemAberto) {
    setValores((atual) => {
      const novo = new Map(atual);
      if (novo.has(item.chave)) novo.delete(item.chave);
      else novo.set(item.chave, paraTexto(item.restante));
      return novo;
    });
  }

  const soma = Array.from(valores.values()).reduce((acc, t) => acc + parsear(t), 0);
  const diferenca = Number((valorTotal - soma).toFixed(2));
  const bate = Math.abs(diferenca) < 0.005;
  const podeConfirmar = soma > 0 && (modoExtrato ? bate : true) && (modoExtrato || !!contaId);

  function montarAlocacoes(): AlocacaoRecebimento[] {
    const lista: AlocacaoRecebimento[] = [];
    for (const item of todos) {
      const texto = valores.get(item.chave);
      if (texto == null) continue;
      const valor = parsear(texto);
      if (!(valor > 0)) continue;
      lista.push({
        investimentoId: item.operacao.investimento.id,
        parcelaId: item.parcela?.id ?? null,
        tipo: item.tipo,
        valor: Number(valor.toFixed(2)),
        modoAvista:
          item.tipo === "avista"
            ? (modosAvista.get(item.chave) ?? (valor >= item.restante * 0.99 ? "quitacao" : "juros"))
            : undefined,
      });
    }
    return lista;
  }

  async function confirmar() {
    const alocacoes = montarAlocacoes();
    if (modoExtrato) onConfirmarDivisao?.(alocacoes);
    else await onConfirmarManual?.({ contaId, data, alocacoes });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-3xl bg-card p-5 shadow-card-hover sm:rounded-3xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-h3 text-foreground">{modoExtrato ? "Dividir este recebimento" : "Receber várias de uma vez"}</h2>
            <p className="text-small text-muted">
              Marque o que foi pago com esse valor. O app já sugere o que vence no dia do pagamento.
            </p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
            <X size={20} />
          </button>
        </div>

        {modoExtrato ? (
          <p className="rounded-xl bg-muted/10 px-3 py-2 text-small text-foreground">
            Recebido em {dataBr(data)}: <strong>{formatarMoeda(valorTotal)}</strong>
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-36">
                <Input label="Quanto recebeu" inputMode="decimal" value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} placeholder="0,00" />
              </div>
              <DateMaskInput label="Data" value={data} onChange={setData} />
            </div>
            <SeletorCarteira valor={contaId} onChange={setContaId} ajuda="Cada parcela/contrato vira uma entrada nessa carteira, com o código." />
          </div>
        )}

        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar pelo nome da pessoa ou código"
            aria-label="Filtrar"
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-small text-foreground placeholder:text-muted"
          />
        </div>

        {visiveis.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-6 text-center text-small text-muted">Nada em aberto com esse filtro.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {visiveis.map((item) => {
              const marcado = valores.has(item.chave);
              const noDia = item.vencimento === data;
              return (
                <li key={item.chave} className={cn("flex flex-col gap-2 px-3 py-2", !marcado && "opacity-70")}>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" className="h-4 w-4 shrink-0" checked={marcado} onChange={() => alternar(item)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-medium text-foreground">{item.rotulo}</span>
                      <span className="block text-xs text-muted">
                        Falta {formatarMoeda(item.restante)} · vence {dataBr(item.vencimento)}
                        {noDia ? <span className="font-semibold text-primary-700 dark:text-primary-300"> · vence no dia</span> : null}
                        {item.parcela && Number(item.parcela.valor_recebido ?? 0) > 0 ? ` · já recebeu ${formatarMoeda(Number(item.parcela.valor_recebido))}` : ""}
                      </span>
                    </span>
                  </label>
                  {marcado && (
                    <div className="ml-7 flex flex-wrap items-center gap-2">
                      <input
                        inputMode="decimal"
                        value={valores.get(item.chave) ?? ""}
                        onChange={(e) => setValores((atual) => new Map(atual).set(item.chave, e.target.value))}
                        aria-label={`Valor para ${item.rotulo}`}
                        className="h-9 w-28 rounded-lg border border-border bg-card px-2 text-small text-foreground"
                      />
                      {item.tipo === "avista" && (
                        <select
                          value={modosAvista.get(item.chave) ?? (parsear(valores.get(item.chave) ?? "0") >= item.restante * 0.99 ? "quitacao" : "juros")}
                          onChange={(e) => setModosAvista((atual) => new Map(atual).set(item.chave, e.target.value as "quitacao" | "juros"))}
                          className="h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                          aria-label="Como foi"
                        >
                          <option value="quitacao">Quitação</option>
                          <option value="juros">Só os juros</option>
                        </select>
                      )}
                      {item.tipo === "parcela" && parsear(valores.get(item.chave) ?? "0") < item.restante - 0.004 && (
                        <span className="text-xs text-amber-800 dark:text-amber-200">
                          paga em parte — faltam {formatarMoeda(item.restante - parsear(valores.get(item.chave) ?? "0"))}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div
          className={cn(
            "rounded-xl px-3 py-2 text-small",
            valorTotal > 0 && !bate ? "border border-amber-300 text-foreground dark:border-amber-700" : "bg-muted/10 text-foreground"
          )}
        >
          Marcado: <strong>{formatarMoeda(soma)}</strong>
          {valorTotal > 0 && (
            <>
              {" "}
              de {formatarMoeda(valorTotal)} {bate ? "✅" : diferenca > 0 ? `— sobram ${formatarMoeda(diferenca)} pra distribuir` : `— passou ${formatarMoeda(-diferenca)}`}
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="tertiary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void confirmar()} disabled={!podeConfirmar || salvando}>
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {modoExtrato ? "Usar esta divisão" : "Confirmar recebimento"}
          </Button>
        </div>
      </div>
    </div>
  );
}
