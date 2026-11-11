"use client";

import * as React from "react";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { buscarTaxasMaquininha, salvarTaxasMaquininha, TAXAS_VAZIAS, type TaxasMaquininha } from "@/lib/data/maquininha";

const num = (t: string) => {
  const v = Number(t.trim().replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};
const txt = (n: number | undefined) => (n ? String(n).replace(".", ",") : "");

/**
 * "Minha maquininha" (10/nov/2026): preenche uma vez as taxas e o app tira
 * a taxa de cada venda no cartão automaticamente.
 */
export function ConfigMaquininha({ contaMestreId, podeEditar }: { contaMestreId: string; podeEditar: boolean }) {
  const [taxas, setTaxas] = React.useState<TaxasMaquininha>(TAXAS_VAZIAS);
  const [textos, setTextos] = React.useState<Record<string, string>>({});
  const [carregado, setCarregado] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [verParcelas, setVerParcelas] = React.useState(false);

  React.useEffect(() => {
    buscarTaxasMaquininha(contaMestreId).then((t) => {
      const base = t ?? TAXAS_VAZIAS;
      setTaxas(base);
      const ini: Record<string, string> = { debito: txt(base.debito), credito_vista: txt(base.credito_vista), pix: txt(base.pix) };
      for (let n = 2; n <= 12; n++) ini[`p${n}`] = txt(base.parcelado[String(n)]);
      setTextos(ini);
      setVerParcelas(Object.keys(base.parcelado).length > 0);
      setCarregado(true);
    });
  }, [contaMestreId]);

  function mudar(campo: string, valor: string) {
    setOk(false);
    setTextos((t) => ({ ...t, [campo]: valor }));
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const parcelado: Record<string, number> = {};
    for (let n = 2; n <= 12; n++) if (num(textos[`p${n}`] ?? "") > 0) parcelado[String(n)] = num(textos[`p${n}`]);
    const novo: TaxasMaquininha = {
      nome: taxas.nome,
      debito: num(textos.debito ?? ""),
      credito_vista: num(textos.credito_vista ?? ""),
      parcelado,
      pix: num(textos.pix ?? ""),
    };
    const { error } = await salvarTaxasMaquininha(contaMestreId, novo);
    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar agora.");
      return;
    }
    setTaxas(novo);
    setOk(true);
  }

  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
          <CreditCard size={20} />
        </span>
        <div>
          <h2 className="text-h3 text-foreground">Minha maquininha</h2>
          <p className="text-small text-muted">
            Preencha uma vez as taxas da sua maquininha. Em cada venda no cartão o app já desconta a taxa, mostra quanto você recebe de verdade e o
            fluxo de caixa mostra quanto foi embora em taxas no mês.
          </p>
        </div>
      </div>
      {!carregado ? (
        <Loader2 size={20} className="animate-spin text-accent-700" />
      ) : (
        <>
          <Input
            label="Qual maquininha (opcional)"
            value={taxas.nome}
            onChange={(e) => {
              setOk(false);
              setTaxas((t) => ({ ...t, nome: e.target.value }));
            }}
            placeholder="Ex.: Stone, PagBank, Mercado Pago, InfinitePay"
            disabled={!podeEditar}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Input label="Débito (%)" inputMode="decimal" value={textos.debito ?? ""} onChange={(e) => mudar("debito", e.target.value)} placeholder="1,99" disabled={!podeEditar} />
            <Input label="Crédito à vista (%)" inputMode="decimal" value={textos.credito_vista ?? ""} onChange={(e) => mudar("credito_vista", e.target.value)} placeholder="4,98" disabled={!podeEditar} />
            <Input label="Pix na maquininha (%)" inputMode="decimal" value={textos.pix ?? ""} onChange={(e) => mudar("pix", e.target.value)} placeholder="0" disabled={!podeEditar} />
          </div>
          <button type="button" onClick={() => setVerParcelas((v) => !v)} className="self-start text-small font-semibold text-accent-700 hover:underline dark:text-accent-300">
            {verParcelas ? "Esconder taxas do parcelado" : "Taxas do crédito parcelado (2x a 12x)"}
          </button>
          {verParcelas && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                <Input key={n} label={`${n}x (%)`} inputMode="decimal" value={textos[`p${n}`] ?? ""} onChange={(e) => mudar(`p${n}`, e.target.value)} disabled={!podeEditar} />
              ))}
            </div>
          )}
          <p className="text-xs text-muted">
            Onde achar: no app da maquininha, em &quot;Taxas&quot; ou &quot;Meu plano&quot;. Parcela sem taxa preenchida usa a do crédito à vista. Pix e
            dinheiro direto na conta não têm taxa.
          </p>
          {erro && <p className="text-small text-rose-700">{erro}</p>}
          {podeEditar && (
            <Button type="button" onClick={() => void salvar()} disabled={salvando} className="self-start">
              {salvando ? <Loader2 size={16} className="animate-spin" /> : ok ? <Check size={16} /> : null}
              {ok ? "Salvo" : "Salvar taxas"}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
