"use client";

import * as React from "react";
import { Check, Pencil, Target } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buscarPerfilNegocio, salvarMetaFaturamento } from "@/lib/data/perfilFiscal";

/**
 * Meta do mês no painel da empresa (10/nov/2026): quanto quer faturar, a
 * barra de progresso, quanto falta e quanto precisa vender por dia nos dias
 * que sobram — e a projeção pelo ritmo atual.
 */
export function MetaMesEmpresa({ contaMestreId, faturado, ano, mes, podeEditar }: { contaMestreId: string; faturado: number; ano: number; mes: number; podeEditar: boolean }) {
  const [meta, setMeta] = React.useState<number | null | undefined>(undefined);
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState("");

  React.useEffect(() => {
    buscarPerfilNegocio(contaMestreId).then((p) => setMeta(p.meta));
  }, [contaMestreId]);

  const hoje = new Date();
  const mesAtual = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
  if (meta === undefined) return null;
  if (!mesAtual && !meta) return null;

  async function salvar() {
    const v = Number(texto.replace(/\./g, "").replace(",", "."));
    const nova = Number.isFinite(v) && v > 0 ? v : null;
    await salvarMetaFaturamento(contaMestreId, nova);
    setMeta(nova);
    setEditando(false);
  }

  const diasNoMes = new Date(ano, mes, 0).getDate();
  const diaAtual = mesAtual ? hoje.getDate() : diasNoMes;
  const diasRestantes = Math.max(1, diasNoMes - diaAtual + 1);
  const progresso = meta ? Math.min(100, (faturado / meta) * 100) : 0;
  const falta = meta ? Math.max(0, meta - faturado) : 0;
  const projecao = diaAtual > 0 ? (faturado / diaAtual) * diasNoMes : 0;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-small font-semibold text-foreground">
          <Target size={16} className="text-accent-700" />
          Meta do mês
        </p>
        {podeEditar && !editando && (
          <button
            type="button"
            onClick={() => {
              setTexto(meta ? String(meta).replace(".", ",") : "");
              setEditando(true);
            }}
            className="flex items-center gap-1 text-xs font-semibold text-accent-700 hover:underline dark:text-accent-300"
          >
            <Pencil size={12} /> {meta ? "Alterar" : "Definir"}
          </button>
        )}
      </div>
      {editando ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44">
            <Input label="Quero faturar no mês (R$)" inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="10.000,00" autoFocus />
          </div>
          <Button size="sm" onClick={() => void salvar()}>
            <Check size={14} /> Salvar
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
      ) : !meta ? (
        <p className="text-small text-muted">Defina quanto quer faturar por mês e acompanhe aqui quanto falta e quanto vender por dia.</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-h3 text-foreground">{formatarMoeda(faturado)}</p>
            <p className="text-small text-muted">de {formatarMoeda(meta)}</p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted/20" role="progressbar" aria-valuenow={Math.round(progresso)} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da meta">
            <div className={cn("h-full rounded-full transition-all", progresso >= 100 ? "bg-primary-600" : "bg-accent-600")} style={{ width: `${progresso}%` }} />
          </div>
          {progresso >= 100 ? (
            <p className="text-small font-semibold text-primary-700 dark:text-primary-300">Meta batida! 🎉 {formatarMoeda(faturado - meta)} acima.</p>
          ) : (
            <p className="text-small text-foreground">
              Faltam <strong>{formatarMoeda(falta)}</strong>
              {mesAtual ? (
                <>
                  {" "}— dá <strong>{formatarMoeda(falta / diasRestantes)}</strong> por dia nos {diasRestantes} {diasRestantes === 1 ? "dia que falta" : "dias que faltam"}.
                </>
              ) : null}
            </p>
          )}
          {mesAtual && progresso < 100 && faturado > 0 && (
            <p className={cn("text-xs", projecao >= meta ? "text-primary-700 dark:text-primary-300" : "text-amber-800 dark:text-amber-200")}>
              No ritmo de agora, o mês fecha em {formatarMoeda(projecao)} {projecao >= meta ? "— vai bater a meta." : "— abaixo da meta."}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
