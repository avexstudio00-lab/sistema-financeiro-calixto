"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Landmark, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ROTULO_ANEXO, dasMei, type AnexoSimples, type AtividadeMei } from "@/lib/util/simuladorImpostos";
import { PERFIL_FISCAL_PADRAO, buscarPerfilNegocio, historicoDas, salvarPerfilFiscal, type PerfilFiscal, type RegimeFiscal } from "@/lib/data/perfilFiscal";

const num = (t: string) => {
  const v = Number(t.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};

/**
 * Identificação fiscal (10/nov/2026): MEI, Simples (qual anexo) ou outro
 * percentual; no MEI, quanto paga de DAS de verdade. Base do simulador de
 * impostos e do preço sugerido.
 */
export function IdentificacaoFiscal({ contaMestreId, podeEditar, onSalvo }: { contaMestreId: string; podeEditar: boolean; onSalvo?: (p: PerfilFiscal) => void }) {
  const [perfil, setPerfil] = React.useState<PerfilFiscal>(PERFIL_FISCAL_PADRAO);
  const [dasTexto, setDasTexto] = React.useState("");
  const [percTexto, setPercTexto] = React.useState("");
  const [margemTexto, setMargemTexto] = React.useState("30");
  const [historico, setHistorico] = React.useState<{ vencimento: string; valor: number }[]>([]);
  const [carregado, setCarregado] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [ok, setOk] = React.useState(false);

  React.useEffect(() => {
    Promise.all([buscarPerfilNegocio(contaMestreId), historicoDas(contaMestreId)]).then(([{ fiscal }, hist]) => {
      const p = fiscal ?? PERFIL_FISCAL_PADRAO;
      setPerfil(p);
      setDasTexto(p.dasValor != null ? String(p.dasValor).replace(".", ",") : "");
      setPercTexto(String(p.percentual).replace(".", ","));
      setMargemTexto(String(p.margemPadrao).replace(".", ","));
      setHistorico(hist);
      setCarregado(true);
    });
  }, [contaMestreId]);

  function mudar(parcial: Partial<PerfilFiscal>) {
    setOk(false);
    setPerfil((p) => ({ ...p, ...parcial }));
  }

  async function salvar() {
    setSalvando(true);
    const novo: PerfilFiscal = {
      ...perfil,
      dasValor: dasTexto.trim() ? num(dasTexto) : null,
      percentual: num(percTexto),
      margemPadrao: margemTexto.trim() ? num(margemTexto) : 30,
    };
    const { error } = await salvarPerfilFiscal(contaMestreId, novo);
    setSalvando(false);
    if (!error) {
      setPerfil(novo);
      setOk(true);
      onSalvo?.(novo);
    }
  }

  const mediaDas = historico.length ? historico.reduce((a, h) => a + h.valor, 0) / historico.length : null;
  const minDas = historico.length ? Math.min(...historico.map((h) => h.valor)) : null;
  const maxDas = historico.length ? Math.max(...historico.map((h) => h.valor)) : null;

  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
          <Landmark size={20} />
        </span>
        <div>
          <h2 className="text-h3 text-foreground">Identificação fiscal</h2>
          <p className="text-small text-muted">Como sua empresa paga imposto. O app usa isso no simulador de impostos e no preço sugerido.</p>
        </div>
      </div>
      {!carregado ? (
        <Loader2 size={20} className="animate-spin text-accent-700" />
      ) : (
        <>
          <div className="flex flex-wrap gap-1 rounded-xl bg-muted/10 p-1">
            {(
              [
                ["mei", "MEI"],
                ["simples", "ME / EPP no Simples"],
                ["outro", "Outro regime"],
              ] as [RegimeFiscal, string][]
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                disabled={!podeEditar}
                onClick={() => mudar({ regime: id })}
                className={cn("rounded-lg px-3 py-1.5 text-small font-medium", perfil.regime === id ? "bg-card text-accent-700 shadow-sm" : "text-muted")}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {perfil.regime === "mei" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-small font-medium text-foreground">
                O que você faz
                <select
                  value={perfil.atividadeMei}
                  disabled={!podeEditar}
                  onChange={(e) => mudar({ atividadeMei: e.target.value as AtividadeMei })}
                  className="h-11 rounded-xl border border-border bg-card px-3 text-body"
                >
                  <option value="comercio">Comércio ou indústria</option>
                  <option value="servicos">Serviços</option>
                  <option value="ambos">Comércio e serviços</option>
                </select>
              </label>
              <Input
                label="Quanto você paga de DAS (R$)"
                inputMode="decimal"
                value={dasTexto}
                disabled={!podeEditar}
                onChange={(e) => {
                  setOk(false);
                  setDasTexto(e.target.value);
                }}
                placeholder={dasMei(perfil.atividadeMei).toFixed(2).replace(".", ",")}
                helperText="Vazio = valor oficial de 2026. Se o seu muda um pouco por mês, coloque o mais comum."
              />
              {mediaDas != null && (
                <p className="text-xs text-muted sm:col-span-2">
                  Pelas guias que você marcou como pagas: média de {formatarMoeda(mediaDas)}
                  {minDas !== maxDas ? ` (de ${formatarMoeda(minDas ?? 0)} a ${formatarMoeda(maxDas ?? 0)})` : ""}.{" "}
                  {!dasTexto.trim() && podeEditar && (
                    <button type="button" onClick={() => setDasTexto(mediaDas.toFixed(2).replace(".", ","))} className="font-semibold text-accent-700 hover:underline">
                      Usar a média
                    </button>
                  )}
                </p>
              )}
            </div>
          )}

          {perfil.regime === "simples" && (
            <label className="flex flex-col gap-1.5 text-small font-medium text-foreground">
              Tipo de atividade (anexo do Simples)
              <select
                value={perfil.anexo}
                disabled={!podeEditar}
                onChange={(e) => mudar({ anexo: e.target.value as AnexoSimples })}
                className="h-11 rounded-xl border border-border bg-card px-3 text-body"
              >
                {(Object.keys(ROTULO_ANEXO) as AnexoSimples[]).map((a) => (
                  <option key={a} value={a}>
                    {ROTULO_ANEXO[a]}
                  </option>
                ))}
              </select>
              <span className="text-xs font-normal text-muted">Não sabe? Está no seu CNPJ (CNAE) ou o contador te diz. A alíquota sai do faturamento dos últimos 12 meses.</span>
            </label>
          )}

          {perfil.regime === "outro" && (
            <Input
              label="Percentual de imposto sobre o faturamento (%)"
              inputMode="decimal"
              value={percTexto}
              disabled={!podeEditar}
              onChange={(e) => {
                setOk(false);
                setPercTexto(e.target.value);
              }}
              helperText="Lucro presumido, lucro real... use o percentual que o seu contador passar."
            />
          )}

          <div className="max-w-xs">
            <Input
              label="Lucro padrão no preço sugerido (%)"
              inputMode="decimal"
              value={margemTexto}
              disabled={!podeEditar}
              onChange={(e) => {
                setOk(false);
                setMargemTexto(e.target.value);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {podeEditar && (
              <Button type="button" onClick={() => void salvar()} disabled={salvando}>
                {salvando ? <Loader2 size={16} className="animate-spin" /> : ok ? <Check size={16} /> : null}
                {ok ? "Salvo" : "Salvar identificação"}
              </Button>
            )}
            <Link href="/dashboard/empresa/das#simulador" className="text-small font-semibold text-accent-700 hover:underline dark:text-accent-300">
              Ver quanto vou pagar de imposto
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}
