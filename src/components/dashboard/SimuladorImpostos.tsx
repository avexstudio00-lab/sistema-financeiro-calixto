"use client";

import * as React from "react";
import { Calculator, Info } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  LIMITE_MEI_ANUAL,
  ROTULO_ANEXO,
  SALARIO_MINIMO_PADRAO,
  dasMei,
  impostoSimplesDoMes,
  type AnexoSimples,
  type AtividadeMei,
} from "@/lib/util/simuladorImpostos";

type Regime = "mei" | "simples" | "manual";
const CHAVE = "calixto:simulador-impostos";

function ler(): { regime: Regime; atividade: AtividadeMei; anexo: AnexoSimples; manual: string } {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) return JSON.parse(bruto);
  } catch {
    /* ok */
  }
  return { regime: "mei", atividade: "servicos", anexo: "III", manual: "6" };
}

/**
 * "Quanto vou pagar de imposto?" (10/nov/2026) — substitui a parte de notas
 * fiscais. Usa o faturamento real do app (mês e últimos 12 meses), estima o
 * imposto e diz quanto separar. É só estimativa.
 */
export function SimuladorImpostos({ faturamentoMes, faturamento12m, ehMei }: { faturamentoMes: number; faturamento12m: number; ehMei: boolean }) {
  const [regime, setRegime] = React.useState<Regime>(ehMei ? "mei" : "simples");
  const [atividade, setAtividade] = React.useState<AtividadeMei>("servicos");
  const [anexo, setAnexo] = React.useState<AnexoSimples>("III");
  const [manual, setManual] = React.useState("6");
  const [mesTexto, setMesTexto] = React.useState("");

  React.useEffect(() => {
    const s = ler();
    setRegime(s.regime);
    setAtividade(s.atividade);
    setAnexo(s.anexo);
    setManual(s.manual);
  }, []);
  React.useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ regime, atividade, anexo, manual }));
    } catch {
      /* ok */
    }
  }, [regime, atividade, anexo, manual]);

  const fatMes = mesTexto.trim() ? Number(mesTexto.replace(/\./g, "").replace(",", ".")) || 0 : faturamentoMes;
  let imposto = 0;
  let aliquota = 0;
  let explicacao = "";
  if (regime === "mei") {
    imposto = dasMei(atividade);
    aliquota = fatMes > 0 ? (imposto / fatMes) * 100 : 0;
    explicacao = `DAS fixo do MEI: 5% do salário mínimo (R$ ${SALARIO_MINIMO_PADRAO.toLocaleString("pt-BR")}) ${atividade === "comercio" ? "+ R$ 1 de ICMS" : atividade === "servicos" ? "+ R$ 5 de ISS" : "+ R$ 1 de ICMS + R$ 5 de ISS"}. Vence todo dia 20.`;
  } else if (regime === "simples") {
    const r = impostoSimplesDoMes(anexo, faturamento12m, fatMes);
    imposto = r.imposto;
    aliquota = r.aliquota;
    explicacao = `Simples Nacional, ${ROTULO_ANEXO[anexo].split(" — ")[0]}: alíquota efetiva de ${aliquota.toFixed(2).replace(".", ",")}% calculada sobre ${formatarMoeda(faturamento12m || fatMes * 12)} faturados nos últimos 12 meses.`;
  } else {
    aliquota = Number(manual.replace(",", ".")) || 0;
    imposto = Number(((fatMes * aliquota) / 100).toFixed(2));
    explicacao = "Percentual informado por você (o que o seu contador passou).";
  }
  const usoLimite = Math.min(100, (faturamento12m / LIMITE_MEI_ANUAL) * 100);

  return (
    <Card padding="lg" className="flex flex-col gap-4" id="simulador">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
          <Calculator size={20} />
        </span>
        <div>
          <h2 className="text-h3 text-foreground">Quanto vou pagar de imposto?</h2>
          <p className="text-small text-muted">Uma estimativa com base no que você faturou no app, pra separar o dinheiro antes do vencimento.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-muted/10 p-1">
        {(
          [
            ["mei", "MEI"],
            ["simples", "Simples Nacional"],
            ["manual", "Outro (digito o %)"],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => setRegime(id)}
            className={cn("rounded-lg px-3 py-1.5 text-small font-medium", regime === id ? "bg-card text-accent-700 shadow-sm" : "text-muted")}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {regime === "mei" && (
          <label className="flex flex-col gap-1.5 text-small font-medium text-foreground">
            O que você faz
            <select value={atividade} onChange={(e) => setAtividade(e.target.value as AtividadeMei)} className="h-11 rounded-xl border border-border bg-card px-3 text-body">
              <option value="comercio">Comércio ou indústria</option>
              <option value="servicos">Serviços</option>
              <option value="ambos">Comércio e serviços</option>
            </select>
          </label>
        )}
        {regime === "simples" && (
          <label className="flex flex-col gap-1.5 text-small font-medium text-foreground">
            Tipo de atividade
            <select value={anexo} onChange={(e) => setAnexo(e.target.value as AnexoSimples)} className="h-11 rounded-xl border border-border bg-card px-3 text-body">
              {(Object.keys(ROTULO_ANEXO) as AnexoSimples[]).map((a) => (
                <option key={a} value={a}>
                  {ROTULO_ANEXO[a]}
                </option>
              ))}
            </select>
          </label>
        )}
        {regime === "manual" && <Input label="Percentual de imposto (%)" inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} />}
        <Input
          label="Faturamento do mês"
          inputMode="decimal"
          value={mesTexto}
          onChange={(e) => setMesTexto(e.target.value)}
          placeholder={faturamentoMes.toFixed(2).replace(".", ",")}
          helperText="Vazio = o que entrou no app este mês."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-accent-200 p-3 dark:border-accent-800">
          <p className="text-xs text-muted">Imposto estimado do mês</p>
          <p className="text-h3 text-foreground">{formatarMoeda(imposto)}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted">Quanto isso pesa no faturamento</p>
          <p className="text-h3 text-foreground">{aliquota.toFixed(2).replace(".", ",")}%</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted">Separe por semana</p>
          <p className="text-h3 text-foreground">{formatarMoeda(imposto / 4)}</p>
        </div>
      </div>
      <p className="text-small text-foreground">{explicacao}</p>

      {regime === "mei" && (
        <div className="flex flex-col gap-1.5">
          <p className="text-small text-foreground">
            Limite do MEI: {formatarMoeda(faturamento12m)} de {formatarMoeda(LIMITE_MEI_ANUAL)} nos últimos 12 meses
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-muted/20">
            <div className={cn("h-full rounded-full", usoLimite >= 80 ? "bg-rose-500" : "bg-accent-600")} style={{ width: `${usoLimite}%` }} />
          </div>
          {usoLimite >= 80 && <p className="text-xs text-rose-700 dark:text-rose-300">Perto do limite — vale conversar com um contador sobre virar ME no Simples.</p>}
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        Estimativa para planejamento. O valor oficial é o da guia (DAS/DARF) gerada no Portal do Simples Nacional ou pelo seu contador. O app não emite nota
        fiscal.
      </p>
    </Card>
  );
}
