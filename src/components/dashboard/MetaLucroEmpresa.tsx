"use client";

import * as React from "react";
import { Check, ChevronDown, Pencil, PiggyBank } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatarMoeda } from "@/lib/format";
import { listarVendas } from "@/lib/data/vendas";
import { listarVendedores, calcularResultadoVendedores, custoVendedores } from "@/lib/data/vendedores";
import { buscarMetaLucro, buscarPerfilNegocio, faturamentoUltimos12Meses, impostoEstimadoMes, salvarMetaLucro } from "@/lib/data/perfilFiscal";

/**
 * Meta de lucro líquido do mês (13/nov/2026): quanto sobrou de verdade das
 * vendas depois do custo das peças, das taxas da maquininha, do imposto
 * estimado e do que vai para os vendedores (comissão ou o que ficaram acima
 * do repasse). Barra de progresso contra a meta e quanto falta.
 */

interface Conta {
  faturamento: number;
  custo: number;
  taxas: number;
  imposto: number;
  vendedores: number;
  lucro: number;
}

export function MetaLucroEmpresa({ contaMestreId, ano, mes, podeEditar }: { contaMestreId: string; ano: number; mes: number; podeEditar: boolean }) {
  const [meta, setMeta] = React.useState<number | null | undefined>(undefined);
  const [conta, setConta] = React.useState<Conta | null>(null);
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState("");
  const [detalhe, setDetalhe] = React.useState(false);

  React.useEffect(() => {
    let ativo = true;
    const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;
    Promise.all([
      buscarMetaLucro(contaMestreId),
      listarVendas(contaMestreId, { inicio, fim }),
      listarVendedores(contaMestreId),
      buscarPerfilNegocio(contaMestreId),
      faturamentoUltimos12Meses(contaMestreId),
    ]).then(([m, vendas, vendedores, perfil, fat12]) => {
      if (!ativo) return;
      const faturamento = vendas.reduce((a, v) => a + Number(v.valor_total), 0);
      const custo = vendas.reduce((a, v) => a + Number(v.custo_unitario ?? 0) * Number(v.quantidade), 0);
      const taxas = vendas.reduce((a, v) => a + Number(v.taxa_maquininha ?? 0), 0);
      const imposto = faturamento > 0 ? impostoEstimadoMes(perfil.fiscal, faturamento, fat12) : 0;
      const pagoVendedores = custoVendedores(calcularResultadoVendedores(vendas, vendedores));
      setMeta(m);
      setConta({ faturamento, custo, taxas, imposto, vendedores: pagoVendedores, lucro: faturamento - custo - taxas - imposto - pagoVendedores });
    });
    return () => {
      ativo = false;
    };
  }, [contaMestreId, ano, mes]);

  if (meta === undefined || !conta) return null;

  async function salvar() {
    const v = Number(texto.replace(/\./g, "").replace(",", "."));
    const nova = Number.isFinite(v) && v > 0 ? v : null;
    const { error } = await salvarMetaLucro(contaMestreId, nova);
    if (error) {
      console.error("Erro ao salvar meta de lucro:", error);
      return;
    }
    setMeta(nova);
    setEditando(false);
  }

  const progresso = meta ? Math.max(0, Math.min(100, (conta.lucro / meta) * 100)) : 0;
  const falta = meta ? Math.max(0, meta - conta.lucro) : 0;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-small font-semibold text-foreground">
          <PiggyBank size={16} className="text-accent-700" />
          Lucro líquido do mês
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
            <Pencil size={12} /> {meta ? "Alterar meta" : "Definir meta"}
          </button>
        )}
      </div>

      <p className={conta.lucro >= 0 ? "text-h3 text-foreground" : "text-h3 text-rose-600"}>{formatarMoeda(conta.lucro)}</p>

      {editando ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-48">
            <Input label="Quero de lucro líquido (R$)" inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="3.000,00" autoFocus />
          </div>
          <Button size="sm" onClick={() => void salvar()}>
            <Check size={14} /> Salvar
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
      ) : meta ? (
        <div className="flex flex-col gap-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted/15">
            <div className="h-full rounded-full bg-accent-500" style={{ width: `${progresso}%` }} />
          </div>
          <p className="text-xs text-muted">
            Meta {formatarMoeda(meta)} · {falta > 0 ? `faltam ${formatarMoeda(falta)}` : "meta batida! 🎉"}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">Defina uma meta de lucro e acompanhe quanto sobra de verdade, já tirando custo, taxas, imposto e vendedores.</p>
      )}

      <button type="button" onClick={() => setDetalhe((d) => !d)} className="flex items-center gap-1 self-start text-xs font-semibold text-muted hover:text-foreground">
        <ChevronDown size={14} className={detalhe ? "rotate-180 transition-transform" : "transition-transform"} />
        Como chegamos nesse número
      </button>
      {detalhe && (
        <div className="flex flex-col gap-1 rounded-xl bg-muted/5 p-3 text-small">
          {(
            [
              ["Vendas", conta.faturamento, false],
              ["Custo das peças", conta.custo, true],
              ["Taxas da maquininha", conta.taxas, true],
              ["Imposto estimado", conta.imposto, true],
              ["Vendedores (comissão / acima do repasse)", conta.vendedores, true],
            ] as const
          ).map(([rotulo, valor, menos]) => (
            <div key={rotulo} className="flex items-center justify-between gap-2">
              <span className="text-muted">{rotulo}</span>
              <span className="shrink-0 text-foreground">
                {menos ? "− " : ""}
                {formatarMoeda(valor)}
              </span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-border pt-1 font-semibold">
            <span className="text-foreground">Lucro líquido</span>
            <span className="text-foreground">{formatarMoeda(conta.lucro)}</span>
          </div>
          <p className="mt-1 text-xs text-muted">Contas fixas e outros gastos da empresa não entram aqui; veja no Fluxo de caixa.</p>
        </div>
      )}
    </Card>
  );
}
