"use client";

import * as React from "react";
import { AlertTriangle, ArrowLeftRight, Pencil, Trash2, Wallet } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { SeletorCarteira } from "@/components/dashboard/SeletorCarteira";
import { formatarMoeda } from "@/lib/format";
import { useAuth } from "@/lib/auth/AuthProvider";
import { excluirPagamentoInvestimento } from "@/lib/data/investimentos";
import {
  calcularLucroRevenda,
  ehRecebimentoEmBem,
  registrarPermutaRevenda,
  registrarRecebimentoRevenda,
  salvarPrecoRevenda,
  textoLucroRevenda,
  totalRecebidoRevenda,
} from "@/lib/data/revenda";
import type { Investimento, PagamentoInvestimento, ParcelaInvestimento } from "@/lib/data/tipos";

function parsear(texto: string): number {
  return Number(texto.trim().replace(/\./g, "").replace(",", "."));
}

/**
 * Bloco de Compra e revenda (item 5.3): preço de custo × preço de revenda,
 * lucro e margem em tempo real, quanto já foi recebido e registro de
 * recebimentos (entram numa carteira). Quitação automática quando o
 * recebido cobre o preço de revenda.
 */
export function PainelRevenda({
  inv,
  parcelas,
  pagamentos,
  onAlterado,
}: {
  inv: Investimento;
  parcelas: ParcelaInvestimento[];
  pagamentos: PagamentoInvestimento[];
  onAlterado: () => void;
}) {
  const { user } = useAuth();
  const custo = Number(inv.valor_investido);
  const preco = inv.preco_revenda != null ? Number(inv.preco_revenda) : null;
  const lucro = calcularLucroRevenda(custo, preco);
  const recebido = totalRecebidoRevenda(parcelas, pagamentos);
  const recebimentos = pagamentos.filter((p) => p.tipo === "recebimento");

  const [editandoPreco, setEditandoPreco] = React.useState(false);
  const [precoTexto, setPrecoTexto] = React.useState("");
  const [recebendo, setRecebendo] = React.useState(false);
  const [valorTexto, setValorTexto] = React.useState("");
  const [data, setData] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [contaId, setContaId] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  // Item 4.13: operação de rolo (dinheiro + bem recebido na troca).
  const [permutando, setPermutando] = React.useState(false);
  const [bemDescricao, setBemDescricao] = React.useState("");
  const [bemValorTexto, setBemValorTexto] = React.useState("");
  const [dinheiroTexto, setDinheiroTexto] = React.useState("");
  const [destinarRevenda, setDestinarRevenda] = React.useState(true);
  const [aviso, setAviso] = React.useState<string | null>(null);

  const precoDigitado = parsear(precoTexto);
  const lucroPrevia = editandoPreco ? calcularLucroRevenda(custo, precoDigitado) : null;

  async function salvarPreco() {
    const v = precoTexto.trim() === "" ? null : precoDigitado;
    if (v != null && (!Number.isFinite(v) || v <= 0)) {
      setErro("Digite um preço de revenda válido.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const { error } = await salvarPrecoRevenda(inv.id, v);
    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar o preço.");
      return;
    }
    setEditandoPreco(false);
    onAlterado();
  }

  async function confirmarRecebimento() {
    if (!user) return;
    const v = parsear(valorTexto);
    if (!v || v <= 0) {
      setErro("Digite o valor recebido.");
      return;
    }
    if (!contaId) {
      setErro("Escolha em qual carteira o dinheiro entrou.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const { error } = await registrarRecebimentoRevenda({ investimento: inv, usuarioId: user.id, valor: v, data, contaId });
    setSalvando(false);
    if (error) {
      setErro("Não foi possível registrar o recebimento.");
      return;
    }
    setRecebendo(false);
    setValorTexto("");
    onAlterado();
  }

  const bemValor = parsear(bemValorTexto || "0");
  const dinheiroValor = parsear(dinheiroTexto || "0");
  const receitaPermuta = (Number.isFinite(bemValor) ? bemValor : 0) + (Number.isFinite(dinheiroValor) ? dinheiroValor : 0);
  const lucroPermuta = permutando && receitaPermuta > 0 ? calcularLucroRevenda(custo, recebido + receitaPermuta) : null;

  async function confirmarPermuta() {
    if (!user) return;
    if (bemDescricao.trim().length < 2) {
      setErro("Descreva o bem recebido (ex.: iPhone 11 64GB).");
      return;
    }
    if (!bemValor || bemValor <= 0) {
      setErro("Informe quanto vale o bem recebido na troca.");
      return;
    }
    if (dinheiroValor > 0 && !contaId) {
      setErro("Escolha em qual carteira entrou a parte em dinheiro.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const r = await registrarPermutaRevenda({
      investimento: inv,
      usuarioId: user.id,
      data,
      descricaoBem: bemDescricao,
      valorBem: bemValor,
      dinheiro: dinheiroValor > 0 ? { valor: dinheiroValor, contaId } : null,
      destinarRevenda,
    });
    setSalvando(false);
    if (r.error) {
      setErro(r.error.message);
      return;
    }
    setPermutando(false);
    setBemDescricao("");
    setBemValorTexto("");
    setDinheiroTexto("");
    setAviso(destinarRevenda ? `"${bemDescricao.trim()}" entrou como novo item de revenda, com custo de ${formatarMoeda(bemValor)}.` : null);
    onAlterado();
  }

  async function excluir(p: PagamentoInvestimento) {
    setSalvando(true);
    await excluirPagamentoInvestimento(p);
    setSalvando(false);
    onAlterado();
  }

  const faltaReceber = preco != null ? Math.max(preco - recebido, 0) : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-3 py-3">
      <div className="grid grid-cols-2 gap-2 text-small sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">Preço de custo</p>
          <p className="font-semibold text-foreground">{formatarMoeda(custo)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Preço de revenda</p>
          <p className="font-semibold text-foreground">{preco != null ? formatarMoeda(preco) : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Recebido</p>
          <p className="font-semibold text-foreground">
            {formatarMoeda(recebido)}
            {faltaReceber != null && faltaReceber > 0 ? <span className="block text-xs font-normal text-muted">falta {formatarMoeda(faltaReceber)}</span> : null}
          </p>
        </div>
      </div>

      {lucro ? (
        <span
          className={`self-start rounded-full px-2.5 py-1 text-xs font-semibold ${
            lucro.lucro >= 0 ? "bg-primary-50 text-primary-800 dark:text-primary-200" : "bg-rose-50 text-red-700 dark:text-rose-200"
          }`}
        >
          {textoLucroRevenda(lucro)}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 self-start rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:text-amber-200">
          <AlertTriangle size={12} /> Preço de revenda pendente
        </span>
      )}

      {editandoPreco ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-36">
              <Input label="Preço efetivo de revenda" inputMode="decimal" value={precoTexto} onChange={(e) => setPrecoTexto(e.target.value)} placeholder="0,00" />
            </div>
            <Button size="sm" disabled={salvando} onClick={salvarPreco}>
              Salvar
            </Button>
            <Button size="sm" variant="tertiary" onClick={() => setEditandoPreco(false)}>
              Cancelar
            </Button>
          </div>
          {lucroPrevia && <p className="text-xs font-medium text-foreground">{textoLucroRevenda(lucroPrevia)}</p>}
        </div>
      ) : recebendo ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-32">
              <Input label="Valor recebido" inputMode="decimal" value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} placeholder="0,00" />
            </div>
            <DateMaskInput label="Data" value={data} onChange={setData} />
          </div>
          <SeletorCarteira valor={contaId} onChange={setContaId} />
          <div className="flex gap-2">
            <Button size="sm" disabled={salvando} onClick={confirmarRecebimento}>
              {salvando ? "Salvando..." : "Confirmar recebimento"}
            </Button>
            <Button size="sm" variant="tertiary" onClick={() => setRecebendo(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : permutando ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <p className="text-small font-semibold text-foreground">A negociação inclui receber outro bem como parte do pagamento</p>
          <Input label="Bem recebido na troca" value={bemDescricao} onChange={(e) => setBemDescricao(e.target.value)} placeholder="Ex.: iPhone 11 64GB" />
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-36">
              <Input label="Avaliação do bem (R$)" inputMode="decimal" value={bemValorTexto} onChange={(e) => setBemValorTexto(e.target.value)} placeholder="0,00" />
            </div>
            <div className="w-36">
              <Input label="Dinheiro recebido junto" inputMode="decimal" value={dinheiroTexto} onChange={(e) => setDinheiroTexto(e.target.value)} placeholder="0,00" />
            </div>
            <DateMaskInput label="Data" value={data} onChange={setData} />
          </div>
          {dinheiroValor > 0 && <SeletorCarteira valor={contaId} onChange={setContaId} rotulo="O dinheiro entrou em qual carteira?" />}
          <label className="flex items-center gap-2 text-small text-foreground">
            <input type="checkbox" checked={destinarRevenda} onChange={(e) => setDestinarRevenda(e.target.checked)} className="h-4 w-4 accent-emerald-700" />
            Destinar o bem recebido para revenda imediata (cria um novo item com esse custo)
          </label>
          {receitaPermuta > 0 && (
            <p className="text-xs text-foreground">
              Receita desta negociação: <strong>{formatarMoeda(receitaPermuta)}</strong> ({formatarMoeda(dinheiroValor || 0)} em dinheiro + {formatarMoeda(bemValor || 0)} em bem)
              {lucroPermuta ? <> · {textoLucroRevenda(lucroPermuta)} no total</> : null}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={salvando} onClick={confirmarPermuta}>
              {salvando ? "Salvando..." : "Confirmar troca"}
            </Button>
            <Button size="sm" variant="tertiary" onClick={() => setPermutando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setEditandoPreco(true);
              setErro(null);
              setPrecoTexto(preco != null ? String(preco).replace(".", ",") : "");
            }}
            className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
          >
            <Pencil size={12} /> {preco != null ? "Editar preço de revenda" : "Definir preço de revenda"}
          </button>
          {inv.forma_pagamento !== "parcelado" && (
            <button
              type="button"
              onClick={() => {
                setRecebendo(true);
                setErro(null);
                setValorTexto(faltaReceber ? String(faltaReceber.toFixed(2)).replace(".", ",") : "");
              }}
              className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
            >
              <Wallet size={12} /> Registrar recebimento
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setPermutando(true);
              setErro(null);
              setAviso(null);
            }}
            className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
          >
            <ArrowLeftRight size={12} /> Recebi um bem na troca (rolo)
          </button>
        </div>
      )}
      {aviso && <p className="text-xs font-medium text-primary-800 dark:text-primary-200">{aviso}</p>}

      {recebimentos.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2">
          <p className="text-xs font-medium text-foreground">Recebimentos</p>
          {recebimentos.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-foreground">
                {new Date(p.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR")} · {formatarMoeda(Number(p.valor_pago))}
                {ehRecebimentoEmBem(p) ? ` · bem na troca${inv.descricao_bem_permuta ? ` (${inv.descricao_bem_permuta})` : ""}` : ""}
              </span>
              <button
                type="button"
                disabled={salvando}
                onClick={() => void excluir(p)}
                aria-label="Excluir recebimento"
                className="flex h-7 items-center gap-1 rounded-lg px-2 text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300"
              >
                <Trash2 size={12} /> Excluir
              </button>
            </div>
          ))}
        </div>
      )}

      {erro && <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{erro}</p>}
    </div>
  );
}

/**
 * Investimentos/empréstimos antigos (antes do item 5.10) não tiraram o
 * dinheiro de nenhuma carteira — por isso o saldo das contas não mudava.
 * Este aviso permite escolher a carteira agora e debitar o valor.
 */
export function VincularContaOrigem({ inv, onAlterado }: { inv: Investimento; onAlterado: () => void }) {
  const { user } = useAuth();
  const [aberto, setAberto] = React.useState(false);
  const [contaId, setContaId] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const chaveDispensa = `calixto:origem-dispensada:${inv.id}`;
  const [dispensado, setDispensado] = React.useState(true);

  React.useEffect(() => {
    try {
      setDispensado(localStorage.getItem(chaveDispensa) === "1");
    } catch {
      setDispensado(false);
    }
  }, [chaveDispensa]);

  // Já quitado: o dinheiro saiu e voltou, não há saldo a corrigir.
  // Card nascido de troca (rolo): nada saiu de carteira nenhuma.
  if (inv.conta_origem_id || inv.transacao_origem_id || inv.quitado || inv.permuta_origem_id || dispensado) return null;

  function dispensar() {
    try {
      localStorage.setItem(chaveDispensa, "1");
    } catch {
      /* sem armazenamento: só esconde nesta visita */
    }
    setDispensado(true);
  }

  async function confirmar() {
    if (!user || !contaId) return;
    setSalvando(true);
    setErro(null);
    const { vincularContaOrigem } = await import("@/lib/data/revenda");
    const { error } = await vincularContaOrigem(inv, user.id, contaId);
    setSalvando(false);
    if (error) {
      setErro("Não foi possível debitar a carteira.");
      return;
    }
    setAberto(false);
    onAlterado();
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700">
      <p className="text-xs text-foreground">
        <strong>Sem carteira de origem:</strong> o valor de {formatarMoeda(Number(inv.valor_investido))} ainda não saiu do saldo de nenhuma conta.
      </p>
      {aberto ? (
        <>
          <SeletorCarteira
            valor={contaId}
            onChange={setContaId}
            rotulo="Saiu de qual carteira?"
            ajuda={`Debita o valor com a data de ${new Date(inv.data_inicio + "T00:00:00").toLocaleDateString("pt-BR")}. Só faça isso se ainda não lançou essa saída à mão.`}
          />
          <div className="flex gap-2">
            <Button size="sm" disabled={!contaId || salvando} onClick={confirmar}>
              {salvando ? "Salvando..." : "Debitar da carteira"}
            </Button>
            <Button size="sm" variant="tertiary" onClick={() => setAberto(false)}>
              Agora não
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setAberto(true)} className="text-xs font-semibold text-primary-800 hover:underline dark:text-primary-200">
            Informar de qual carteira saiu
          </button>
          <button type="button" onClick={dispensar} className="text-xs text-muted hover:underline">
            Já lancei essa saída à mão
          </button>
        </div>
      )}
      {erro && <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{erro}</p>}
    </div>
  );
}
