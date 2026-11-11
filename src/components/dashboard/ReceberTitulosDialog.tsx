"use client";

import * as React from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { normalizarTexto } from "@/lib/util/texto";
import { preSelecionar } from "@/lib/data/receberVarias";
import type { Conta, ContaReceber } from "@/lib/data/tipos";

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
const paraTexto = (v: number) => v.toFixed(2).replace(".", ",");

/**
 * Cliente pagando vários títulos num Pix só (10/nov/2026). Mesmo jeito do
 * "Receber várias" dos empréstimos: digita o valor, o app marca o que vence
 * no dia do pagamento (ou a combinação que bate), dá pra ajustar e pagar em
 * parte.
 */
export function ReceberTitulosDialog({
  titulos,
  carteiras,
  filtroInicial = "",
  salvando = false,
  onFechar,
  onConfirmar,
}: {
  titulos: ContaReceber[];
  carteiras: Conta[];
  filtroInicial?: string;
  salvando?: boolean;
  onFechar: () => void;
  onConfirmar: (dados: { contaBancariaId: string; data: string; alocacoes: { tituloId: string; valor: number }[] }) => void | Promise<void>;
}) {
  const [filtro, setFiltro] = React.useState(filtroInicial);
  const [valorTexto, setValorTexto] = React.useState("");
  const [data, setData] = React.useState(new Date().toISOString().slice(0, 10));
  const [contaId, setContaId] = React.useState(() => carteiras.find((c) => c.tipo !== "cartao_credito")?.id ?? "");
  const [valores, setValores] = React.useState<Map<string, string>>(new Map());

  const itens = React.useMemo(
    () =>
      titulos
        .filter((t) => t.status === "pendente")
        .map((t) => ({
          chave: t.id,
          titulo: t,
          restante: Number(t.valor),
          vencimento: t.vencimento,
          rotulo: `${t.clientes?.nome ? `${t.clientes.nome} — ` : ""}${t.descricao}`,
        }))
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    [titulos]
  );
  const visiveis = React.useMemo(() => {
    const termo = normalizarTexto(filtro).trim();
    return termo ? itens.filter((i) => normalizarTexto(i.rotulo).includes(termo)) : itens;
  }, [itens, filtro]);

  const valorTotal = parsear(valorTexto);
  React.useEffect(() => {
    if (!(valorTotal > 0)) return;
    const { valores: sugeridos } = preSelecionar(visiveis, valorTotal, data);
    const novos = new Map<string, string>();
    sugeridos.forEach((v, k) => novos.set(k, paraTexto(v)));
    setValores(novos);
  }, [valorTotal, data, visiveis]);

  const soma = Array.from(valores.values()).reduce((acc, t) => acc + parsear(t), 0);
  const diferenca = Number((valorTotal - soma).toFixed(2));
  const bate = Math.abs(diferenca) < 0.005;

  function alternar(chave: string, restante: number) {
    setValores((atual) => {
      const novo = new Map(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.set(chave, paraTexto(restante));
      return novo;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-3xl bg-card p-5 shadow-card-hover sm:rounded-3xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-h3 text-foreground">Receber várias de uma vez</h2>
            <p className="text-small text-muted">O cliente pagou mais de uma conta num pagamento só? Marque o que esse valor cobre.</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="w-36">
            <Input label="Quanto recebeu" inputMode="decimal" value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} placeholder="0,00" />
          </div>
          <DateMaskInput label="Data" value={data} onChange={setData} />
        </div>
        <label className="flex flex-col gap-1.5 text-small font-medium text-foreground">
          Entrou em qual carteira?
          <select value={contaId} onChange={(e) => setContaId(e.target.value)} className="h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground">
            {carteiras
              .filter((c) => c.tipo !== "cartao_credito")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
          </select>
        </label>

        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar pelo nome do cliente"
            aria-label="Filtrar pelo nome do cliente"
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-small text-foreground placeholder:text-muted"
          />
        </div>

        {visiveis.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-6 text-center text-small text-muted">Nenhuma conta a receber em aberto com esse filtro.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {visiveis.map((item) => {
              const marcado = valores.has(item.chave);
              const parcial = marcado && parsear(valores.get(item.chave) ?? "0") < item.restante - 0.004;
              return (
                <li key={item.chave} className={cn("flex flex-col gap-2 px-3 py-2", !marcado && "opacity-70")}>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" className="h-4 w-4 shrink-0" checked={marcado} onChange={() => alternar(item.chave, item.restante)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-medium text-foreground">{item.rotulo}</span>
                      <span className="block text-xs text-muted">
                        {formatarMoeda(item.restante)} · vence {dataBr(item.vencimento)}
                        {item.vencimento === data ? <span className="font-semibold text-accent-700 dark:text-accent-300"> · vence no dia</span> : null}
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
                      {parcial && (
                        <span className="text-xs text-amber-800 dark:text-amber-200">
                          paga em parte — fica faltando {formatarMoeda(item.restante - parsear(valores.get(item.chave) ?? "0"))}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className={cn("rounded-xl px-3 py-2 text-small text-foreground", valorTotal > 0 && !bate ? "border border-amber-300 dark:border-amber-700" : "bg-muted/10")}>
          Marcado: <strong>{formatarMoeda(soma)}</strong>
          {valorTotal > 0 && <> de {formatarMoeda(valorTotal)} {bate ? "✅" : diferenca > 0 ? `— sobram ${formatarMoeda(diferenca)}` : `— passou ${formatarMoeda(-diferenca)}`}</>}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="tertiary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={salvando || soma <= 0 || !contaId}
            onClick={() =>
              void onConfirmar({
                contaBancariaId: contaId,
                data,
                alocacoes: Array.from(valores.entries())
                  .map(([tituloId, t]) => ({ tituloId, valor: Number(parsear(t).toFixed(2)) }))
                  .filter((a) => a.valor > 0),
              })
            }
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            Confirmar recebimento
          </Button>
        </div>
      </div>
    </div>
  );
}
