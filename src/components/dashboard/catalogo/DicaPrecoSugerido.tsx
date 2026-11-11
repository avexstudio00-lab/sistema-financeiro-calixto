"use client";

import * as React from "react";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { formatarMoeda } from "@/lib/format";
import { buscarTaxasMaquininha, percentualTaxa, type TaxasMaquininha } from "@/lib/data/maquininha";
import { buscarPerfilNegocio, faturamentoUltimos12Meses, percentualImposto, precoSugerido, type PerfilFiscal } from "@/lib/data/perfilFiscal";

// Cache simples por conta: o formulário abre muitas vezes seguidas.
const cache = new Map<string, Promise<{ taxas: TaxasMaquininha | null; fiscal: PerfilFiscal | null; fat12: number }>>();
function carregar(conta: string) {
  if (!cache.has(conta)) {
    cache.set(
      conta,
      Promise.all([buscarTaxasMaquininha(conta), buscarPerfilNegocio(conta), faturamentoUltimos12Meses(conta)]).then(([taxas, p, fat12]) => ({ taxas, fiscal: p.fiscal, fat12 }))
    );
  }
  return cache.get(conta)!;
}

/** Preço sugerido no cadastro do produto (10/nov/2026): a partir do custo. */
export function DicaPrecoSugerido({ contaMestreId, custo, onUsar }: { contaMestreId: string; custo: number; onUsar: (preco: number) => void }) {
  const [dados, setDados] = React.useState<{ taxas: TaxasMaquininha | null; fiscal: PerfilFiscal | null; fat12: number } | null>(null);
  React.useEffect(() => {
    carregar(contaMestreId).then(setDados);
  }, [contaMestreId]);
  if (!dados || !(custo > 0)) return null;
  const margem = dados.fiscal?.margemPadrao ?? 30;
  const imposto = percentualImposto(dados.fiscal, dados.fat12);
  const pix = precoSugerido(custo, { taxa: percentualTaxa(dados.taxas, "pix", 1), imposto, margem });
  const credito = precoSugerido(custo, { taxa: percentualTaxa(dados.taxas, "credito", 1), imposto, margem });
  if (!pix) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-accent-50/60 px-3 py-2 text-small text-foreground dark:bg-accent-900/10">
      <p className="flex items-start gap-2">
        <Lightbulb size={15} className="mt-0.5 shrink-0 text-accent-700" />
        <span>
          Pra ganhar {margem}% depois de taxa e imposto: <strong>{formatarMoeda(pix)}</strong> no Pix
          {credito && credito !== pix ? (
            <>
              {" "}· <strong>{formatarMoeda(credito)}</strong> no crédito
            </>
          ) : null}
          .
        </span>
      </p>
      <div className="flex flex-wrap gap-3 pl-6 text-xs">
        <button type="button" onClick={() => onUsar(credito ?? pix)} className="font-semibold text-accent-700 hover:underline dark:text-accent-300">
          Usar {formatarMoeda(credito ?? pix)}
        </button>
        <Link href="/dashboard/empresa/configuracoes#preco" className="text-muted hover:underline">
          Ver o cálculo completo
        </Link>
      </div>
    </div>
  );
}
