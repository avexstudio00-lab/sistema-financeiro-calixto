"use client";

import * as React from "react";
import Link from "next/link";
import { CreditCard, Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatarMoeda } from "@/lib/format";
import { listarVendas } from "@/lib/data/vendas";
import type { Venda } from "@/lib/data/tipos";

const ROTULOS: Record<string, string> = { pix: "Pix", debito: "Débito", credito: "Crédito", dinheiro: "Dinheiro", boleto: "Boleto", fiado: "Fiado", outro: "Outros" };

/**
 * Fluxo de caixa → "Quanto a maquininha levou" (10/nov/2026): soma das
 * taxas das vendas no cartão do mês, quanto entrou por forma de pagamento e
 * uma dica de desconto no Pix (comparando com a taxa média do cartão).
 */
export function TaxasFormasPagamento({ contaMestreId, ano, mes }: { contaMestreId: string; ano: number; mes: number }) {
  const [vendas, setVendas] = React.useState<Venda[] | null>(null);

  React.useEffect(() => {
    const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
    listarVendas(contaMestreId, { inicio, fim }).then(setVendas);
  }, [contaMestreId, ano, mes]);

  if (!vendas || vendas.length === 0) return null;

  const porForma = new Map<string, number>();
  let taxas = 0;
  let vendidoNoCartao = 0;
  for (const v of vendas) {
    const forma = Array.isArray(v.pagamentos) && v.pagamentos.length ? "outro" : (v.forma_pagamento ?? "fiado");
    porForma.set(forma, (porForma.get(forma) ?? 0) + Number(v.valor_total));
    if (v.taxa_maquininha) {
      taxas += Number(v.taxa_maquininha);
    }
  }
  // Total vendido no cartão = soma das vendas cuja 1ª linha tem taxa (a taxa fica na 1ª linha do carrinho).
  const grupos = new Map<string, { total: number; taxa: number }>();
  for (const v of vendas) {
    const chave = v.grupo_venda_id ?? v.id;
    const g = grupos.get(chave) ?? { total: 0, taxa: 0 };
    g.total += Number(v.valor_total);
    g.taxa += Number(v.taxa_maquininha ?? 0);
    grupos.set(chave, g);
  }
  grupos.forEach((g) => {
    if (g.taxa > 0) vendidoNoCartao += g.total;
  });
  const total = Array.from(porForma.values()).reduce((a, b) => a + b, 0);
  const taxaMedia = vendidoNoCartao > 0 ? (taxas / vendidoNoCartao) * 100 : 0;
  const ordem = Array.from(porForma.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
          <CreditCard size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-h3 text-foreground">Formas de pagamento e taxas</h2>
          <p className="text-small text-muted">Como você recebeu as vendas deste mês e quanto a maquininha levou.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-rose-200 p-3 dark:border-rose-800">
          <p className="text-xs text-muted">Perdido em taxas da maquininha</p>
          <p className="text-h3 text-rose-700 dark:text-rose-300">{formatarMoeda(taxas)}</p>
          <p className="text-xs text-muted">
            {taxas > 0 ? `${taxaMedia.toFixed(2).replace(".", ",")}% do que você vendeu no cartão (${formatarMoeda(vendidoNoCartao)})` : "Nenhuma taxa registrada neste mês."}
          </p>
        </div>
        <ul className="flex flex-col gap-1.5 rounded-xl border border-border p-3 text-small">
          {ordem.map(([forma, valor]) => (
            <li key={forma} className="flex items-center justify-between gap-2">
              <span className="text-foreground">{ROTULOS[forma] ?? forma}</span>
              <span className="text-muted">
                {formatarMoeda(valor)} · {total > 0 ? Math.round((valor / total) * 100) : 0}%
              </span>
            </li>
          ))}
        </ul>
      </div>

      {taxaMedia > 0 ? (
        <p className="flex items-start gap-2 rounded-xl bg-primary-50/60 px-3 py-2 text-small text-foreground dark:bg-primary-900/10">
          <Lightbulb size={16} className="mt-0.5 shrink-0 text-primary-700 dark:text-primary-300" />
          No cartão você paga em média {taxaMedia.toFixed(2).replace(".", ",")}% de taxa. Dar até {Math.floor(taxaMedia * 10) / 10}% de desconto no
          Pix ainda sai igual ou mais barato pra você — e o dinheiro cai na hora.
        </p>
      ) : (
        <p className="text-xs text-muted">
          Cadastre as taxas da sua maquininha em{" "}
          <Link href="/dashboard/empresa/configuracoes#maquininha" className="font-semibold text-accent-700 hover:underline dark:text-accent-300">
            Perfil da empresa
          </Link>{" "}
          pra ver aqui quanto vai embora em taxa.
        </p>
      )}
    </Card>
  );
}
