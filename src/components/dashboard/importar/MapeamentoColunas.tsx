"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Briefcase, User } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import { ROTULO_CAMPO, type CampoCanonico, type Estrutura, type ResultadoInterpretacao } from "@/lib/util/csvImportacao";
import type { Conta } from "@/lib/data/tipos";

const OPCOES: CampoCanonico[] = ["ignorar", "data", "descricao", "valor", "credito", "debito", "tipo", "categoria", "forma_pagamento", "vencimento"];

/** Passo 2: prévia das 5 primeiras linhas + mapeamento ajustável + resumo. */
export function MapeamentoColunas({
  nomeArquivo,
  estrutura,
  mapeamento,
  onMapeamento,
  inverterSinal,
  onInverterSinal,
  interpretacao,
  contas,
  contaId,
  onConta,
  tipoNegocio,
  onTipoNegocio,
  podeNegocio,
  criarCategorias,
  onCriarCategorias,
  verificando,
  onVoltar,
  onAvancar,
}: {
  nomeArquivo: string;
  estrutura: Estrutura;
  mapeamento: CampoCanonico[];
  onMapeamento: (m: CampoCanonico[]) => void;
  inverterSinal: boolean;
  onInverterSinal: (v: boolean) => void;
  interpretacao: ResultadoInterpretacao;
  contas: Conta[];
  contaId: string;
  onConta: (id: string) => void;
  tipoNegocio: "pessoal" | "negocio";
  onTipoNegocio: (t: "pessoal" | "negocio") => void;
  podeNegocio: boolean;
  criarCategorias: boolean;
  onCriarCategorias: (v: boolean) => void;
  verificando: boolean;
  onVoltar: () => void;
  onAvancar: () => void;
}) {
  const previa = estrutura.linhas.slice(0, 5);
  const temData = mapeamento.includes("data");
  const temValor = mapeamento.includes("valor") || mapeamento.includes("credito") || mapeamento.includes("debito");
  const temCategoria = mapeamento.includes("categoria");
  const pronto = temData && temValor && !!contaId && interpretacao.validos.length > 0;

  function trocar(i: number, campo: CampoCanonico) {
    const novo = [...mapeamento];
    // Campo único (fora descrição/ignorar): tira de onde estava.
    if (campo !== "ignorar" && campo !== "descricao") {
      const anterior = novo.indexOf(campo);
      if (anterior >= 0) novo[anterior] = "ignorar";
    }
    novo[i] = campo;
    onMapeamento(novo);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card padding="lg" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-h3 text-foreground" title={nomeArquivo}>
            {nomeArquivo}
          </h2>
          {estrutura.formatoNativo && <Badge variant="primary" size="sm">Formato do app</Badge>}
          <Badge variant="neutral" size="sm">
            Separador {estrutura.delimitador === "\t" ? "tabulação" : `"${estrutura.delimitador}"`}
          </Badge>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-small font-medium text-foreground">Esses lançamentos são de onde?</span>
          <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
            {(["pessoal", "negocio"] as const).map((t) => (
              <button
                key={t}
                type="button"
                disabled={t === "negocio" && !podeNegocio}
                onClick={() => onTipoNegocio(t)}
                className={cn(
                  "flex h-11 items-center justify-center gap-2 rounded-xl border text-small font-medium transition-colors disabled:opacity-40",
                  tipoNegocio === t ? "border-primary-700 bg-primary-700 text-white" : "border-border bg-card text-foreground hover:bg-muted/10"
                )}
              >
                {t === "pessoal" ? <User size={16} /> : <Briefcase size={16} />}
                {t === "pessoal" ? "Pessoal" : "Negócio"}
              </button>
            ))}
          </div>
          {!podeNegocio && <span className="text-xs text-muted">Importar para o negócio está disponível nos planos com &quot;Minha empresa&quot;.</span>}
        </div>

        <label className="flex flex-col gap-1.5 sm:max-w-sm">
          <span className="text-small font-medium text-foreground">Em qual carteira lançar?</span>
          <select
            value={contaId}
            onChange={(e) => onConta(e.target.value)}
            className="h-11 rounded-xl border border-border bg-card px-4 text-small text-foreground"
          >
            <option value="">Selecione a carteira...</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">Todas as linhas vão para esta carteira, e o saldo dela é ajustado (receita soma, despesa subtrai).</span>
        </label>
      </Card>

      <Card padding="lg" className="flex min-w-0 flex-col gap-3">
        <div>
          <h3 className="text-body font-semibold text-foreground">Prévia e colunas</h3>
          <p className="text-small text-muted">Confira o que cada coluna significa. Se algo estiver errado, troque no seletor acima da coluna.</p>
        </div>
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[560px] border-collapse text-small">
            <thead>
              <tr>
                {estrutura.cabecalhos.map((h, i) => (
                  <th key={i} className="border-b border-border p-2 text-left align-bottom font-medium">
                    <span className="mb-1 block max-w-[160px] truncate text-xs text-muted" title={h}>
                      {h}
                    </span>
                    <select
                      aria-label={`O que é a coluna ${h}`}
                      value={mapeamento[i] ?? "ignorar"}
                      onChange={(e) => trocar(i, e.target.value as CampoCanonico)}
                      className={cn(
                        "h-9 w-full min-w-[130px] rounded-lg border px-2 text-xs",
                        (mapeamento[i] ?? "ignorar") === "ignorar" ? "border-border bg-card text-muted" : "border-primary-700 bg-primary-50 text-foreground"
                      )}
                    >
                      {OPCOES.map((o) => (
                        <option key={o} value={o}>
                          {ROTULO_CAMPO[o]}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previa.map((linha, r) => (
                <tr key={r} className="border-b border-border last:border-0">
                  {estrutura.cabecalhos.map((_, i) => (
                    <td key={i} className="max-w-[200px] truncate p-2 text-foreground" title={linha[i] ?? ""}>
                      {linha[i] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(!temData || !temValor) && (
          <p className="text-small font-medium text-rose-700 dark:text-rose-300">
            Marque pelo menos uma coluna como <strong>Data</strong> e uma como <strong>Valor</strong> (ou Entrada/Saída).
          </p>
        )}

        <label className="flex items-start gap-2 text-small text-foreground">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={inverterSinal} onChange={(e) => onInverterSinal(e.target.checked)} />
          <span>
            Inverter sinal dos valores
            <span className="block text-xs text-muted">
              Use em fatura de cartão, onde gasto vem positivo (ex.: fatura do Nubank).{estrutura.sugereInverterSinal ? " Já marcado: parece uma fatura de cartão." : ""}
            </span>
          </span>
        </label>
        {temCategoria && (
          <label className="flex items-start gap-2 text-small text-foreground">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={criarCategorias} onChange={(e) => onCriarCategorias(e.target.checked)} />
            <span>
              Criar categorias novas automaticamente
              <span className="block text-xs text-muted">Desmarcado: categoria que não existir vai para &quot;Outras despesas&quot; / &quot;Outras receitas&quot;.</span>
            </span>
          </label>
        )}
      </Card>

      <Card padding="lg" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted">Linhas válidas</p>
          <p className="text-h3 text-foreground">{interpretacao.validos.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Com problema</p>
          <p className="text-h3 text-foreground">{interpretacao.rejeitados.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Receitas</p>
          <p className="text-body font-semibold text-primary-700 dark:text-primary-300">{formatarMoeda(interpretacao.totalReceitas)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Despesas</p>
          <p className="text-body font-semibold text-rose-700 dark:text-rose-300">{formatarMoeda(interpretacao.totalDespesas)}</p>
        </div>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="tertiary" onClick={onVoltar}>
          <ArrowLeft size={18} /> Trocar arquivo
        </Button>
        <Button type="button" disabled={!pronto || verificando} onClick={onAvancar}>
          {verificando ? "Conferindo duplicadas..." : "Conferir antes de importar"} <ArrowRight size={18} />
        </Button>
      </div>
      {!contaId && <p className="text-right text-xs text-muted">Escolha a carteira para continuar.</p>}
    </div>
  );
}
