"use client";

import * as React from "react";
import Link from "next/link";
import { Calculator, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatarMoeda } from "@/lib/format";
import { buscarTaxasMaquininha, percentualTaxa, type TaxasMaquininha } from "@/lib/data/maquininha";
import { buscarPerfilNegocio, decomporPreco, faturamentoUltimos12Meses, percentualImposto, precoSugerido, type PerfilFiscal } from "@/lib/data/perfilFiscal";
import { SeletorBaseLucro } from "@/components/dashboard/IdentificacaoFiscal";

const num = (t: string) => {
  const v = Number(t.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};
const pct = (n: number) => `${n.toFixed(2).replace(".", ",")}%`;

/**
 * Preço sugerido (10/nov/2026): a partir do custo, calcula o preço pra
 * sobrar a margem que a pessoa quer DEPOIS da taxa da maquininha, do imposto
 * (pela identificação fiscal) e de outros custos. Mostra um preço por forma
 * de pagamento — o Pix sai mais barato, o crédito parcelado mais caro.
 */
export function CalculadoraPreco({ contaMestreId, custoInicial }: { contaMestreId: string; custoInicial?: number }) {
  const [custo, setCusto] = React.useState(custoInicial ? String(custoInicial).replace(".", ",") : "");
  const [margem, setMargem] = React.useState("30");
  const [base, setBase] = React.useState<"custo" | "preco">("custo");
  const [comissao, setComissao] = React.useState("");
  const [extras, setExtras] = React.useState("");
  const [taxas, setTaxas] = React.useState<TaxasMaquininha | null>(null);
  const [fiscal, setFiscal] = React.useState<PerfilFiscal | null>(null);
  const [fat12, setFat12] = React.useState(0);
  const [carregado, setCarregado] = React.useState(false);

  React.useEffect(() => {
    Promise.all([buscarTaxasMaquininha(contaMestreId), buscarPerfilNegocio(contaMestreId), faturamentoUltimos12Meses(contaMestreId)]).then(([t, p, f]) => {
      setTaxas(t);
      setFiscal(p.fiscal);
      if (p.fiscal) {
        setMargem(String(p.fiscal.margemPadrao).replace(".", ","));
        setBase(p.fiscal.margemBase ?? "custo");
      }
      setFat12(f);
      setCarregado(true);
    });
  }, [contaMestreId]);

  const c = num(custo);
  const imposto = percentualImposto(fiscal, fat12);
  const params = (taxa: number) => ({ taxa, imposto, margem: num(margem), outros: num(comissao), extrasReais: num(extras), base });
  // Conta aberta do Pix (a forma mais comum) pra pessoa entender de onde sai o preço.
  const precoPix = c > 0 ? precoSugerido(c, params(percentualTaxa(taxas, "pix", 1))) : null;
  const contaPix = precoPix ? decomporPreco(precoPix, c, params(percentualTaxa(taxas, "pix", 1))) : null;
  const linhas: { rotulo: string; forma: string; parcelas: number }[] = [
    { rotulo: "Pix / dinheiro", forma: "pix", parcelas: 1 },
    { rotulo: "Débito", forma: "debito", parcelas: 1 },
    { rotulo: "Crédito à vista", forma: "credito", parcelas: 1 },
    { rotulo: "Crédito 3x", forma: "credito", parcelas: 3 },
    { rotulo: "Crédito 6x", forma: "credito", parcelas: 6 },
    { rotulo: "Crédito 12x", forma: "credito", parcelas: 12 },
  ];

  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
          <Calculator size={20} />
        </span>
        <div>
          <h2 className="text-h3 text-foreground">Preço sugerido</h2>
          <p className="text-small text-muted">
            Coloque quanto te custa e quanto quer ganhar. O app soma taxa da maquininha, imposto, comissão e embalagem e diz por quanto vender.
          </p>
        </div>
      </div>
      {!carregado ? (
        <Loader2 size={20} className="animate-spin text-accent-700" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Input label="Custo (R$)" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00" />
            <Input label="Lucro que quero (%)" inputMode="decimal" value={margem} onChange={(e) => setMargem(e.target.value)} />
            <Input label="Comissão (%)" inputMode="decimal" value={comissao} onChange={(e) => setComissao(e.target.value)} placeholder="0" helperText="Do vendedor, marketplace..." />
            <Input label="Embalagem / frete (R$)" inputMode="decimal" value={extras} onChange={(e) => setExtras(e.target.value)} placeholder="0,00" helperText="Por unidade" />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <SeletorBaseLucro valor={base} onMudar={setBase} />
            <p className="pb-2 text-xs text-muted">
              {base === "custo"
                ? `Ex.: custo R$ 100 com ${margem || 0}% → sobra R$ ${formatarMoeda(num(margem)).replace("R$", "").trim()} limpo em cada venda.`
                : `Ex.: ${margem || 0}% do preço final fica com você depois de tudo.`}
            </p>
          </div>
          <p className="text-xs text-muted">
            Imposto considerado: <strong className="text-foreground">{pct(imposto)}</strong>
            {fiscal?.regime === "mei" ? " (peso do DAS no seu faturamento médio)" : fiscal?.regime === "simples" ? " (alíquota efetiva do Simples)" : fiscal ? "" : ""}
            {!fiscal && (
              <>
                {" "}— preencha a{" "}
                <a href="#identificacao" className="font-semibold text-accent-700 hover:underline">
                  identificação fiscal
                </a>{" "}
                pra entrar no cálculo.
              </>
            )}
            {!taxas && (
              <>
                {" "}Sem taxas da maquininha cadastradas (o cartão sai sem taxa).{" "}
                <a href="#maquininha" className="font-semibold text-accent-700 hover:underline">
                  Cadastrar
                </a>
              </>
            )}
          </p>
          {c > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-small">
                <thead className="bg-muted/10 text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Recebendo por</th>
                    <th className="px-3 py-2 text-right font-medium">Vender por</th>
                    <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Taxa</th>
                    <th className="px-3 py-2 text-right font-medium">Sobra de lucro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {linhas.map((l) => {
                    const taxa = percentualTaxa(taxas, l.forma, l.parcelas);
                    const preco = precoSugerido(c, params(taxa));
                    const sobra = preco ? decomporPreco(preco, c, params(taxa)).lucro : null;
                    return (
                      <tr key={l.rotulo}>
                        <td className="px-3 py-2 text-foreground">{l.rotulo}</td>
                        <td className="px-3 py-2 text-right font-semibold text-foreground">{preco ? formatarMoeda(preco) : "—"}</td>
                        <td className="hidden px-3 py-2 text-right text-muted sm:table-cell">{pct(taxa)}</td>
                        <td className="px-3 py-2 text-right text-accent-700 dark:text-accent-300">{sobra != null ? formatarMoeda(sobra) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-small text-muted">Digite o custo pra ver os preços.</p>
          )}
          {contaPix && precoPix && (
            <div className="rounded-xl bg-muted/5 px-3 py-2 text-xs text-muted">
              <p className="mb-1 font-semibold text-foreground">De onde sai o preço do Pix ({formatarMoeda(precoPix)}):</p>
              <p>
                − custo {formatarMoeda(contaPix.custo)}
                {contaPix.extras > 0 && <> · − embalagem/frete {formatarMoeda(contaPix.extras)}</>}
                {contaPix.taxa > 0 && <> · − taxa {formatarMoeda(contaPix.taxa)}</>}
                {contaPix.imposto > 0 && <> · − imposto {formatarMoeda(contaPix.imposto)}</>}
                {contaPix.comissao > 0 && <> · − comissão {formatarMoeda(contaPix.comissao)}</>}
                {" "}= <strong className="text-accent-700 dark:text-accent-300">sobra {formatarMoeda(contaPix.lucro)}</strong>
              </p>
            </div>
          )}
          {c > 0 && precoSugerido(c, params(0)) === null && (
            <p className="text-small text-rose-700 dark:text-rose-300">Taxas + imposto + comissão passaram de 95% do preço — revise os percentuais.</p>
          )}
          <p className="text-xs text-muted">
            Dica: anuncie o preço do crédito e dê o desconto no Pix — ou cobre o mesmo preço e saiba que no Pix sobra mais.{" "}
            <Link href="/dashboard/empresa/produtos" className="font-semibold text-accent-700 hover:underline dark:text-accent-300">
              Ir para os produtos
            </Link>
          </p>
        </>
      )}
    </Card>
  );
}
