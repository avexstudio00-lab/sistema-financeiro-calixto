"use client";

import * as React from "react";
import { X, Plus, Sparkles, Trash2, Home, Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarCategorias } from "@/lib/data/categorias";
import { listarContas } from "@/lib/data/contas";
import {
  criarTransacao,
  atualizarTransacao,
  deletarTransacao,
  listarDescricoesUsadas,
  type DescricaoUsada,
} from "@/lib/data/transacoes";
import type { Categoria, Conta, Transacao } from "@/lib/data/tipos";

const FORMAS_PAGAMENTO = [
  { id: "pix", label: "Pix" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "boleto", label: "Boleto" },
] as const;

export interface NovaTransacaoModalProps {
  aberto: boolean;
  onFechar: () => void;
  onSalvo: () => void;
  bloqueado?: boolean;
  transacaoEditando?: Transacao | null;
  /** Mundo em que o modal foi aberto ("Minha vida" ou "Minha empresa") — o
   * valor de `tipo_negocio` gravado é sempre o do mundo atual, sem depender
   * de o usuário escolher manualmente (pra não misturar pessoal e negócio
   * na mesma tela). Ignorado pra quem não é MEI/ME (sempre "pessoal"). */
  mundo?: "pessoal" | "negocio";
  /** Categoria já marcada quando o modal abre pra uma anotação nova (ex: um
   * atalho de "Registrar retirada de pró-labore" já abre com a categoria
   * certa escolhida). Ignorado ao editar uma anotação existente. */
  categoriaIdInicial?: string;
}

export function NovaTransacaoModal({
  aberto,
  onFechar,
  onSalvo,
  bloqueado,
  transacaoEditando,
  mundo = "pessoal",
  categoriaIdInicial,
}: NovaTransacaoModalProps) {
  const { user, perfil } = useAuth();
  const ehNegocio = perfil?.tipo_perfil === "mei" || perfil?.tipo_perfil === "me";
  const editando = !!transacaoEditando;

  const [categorias, setCategorias] = React.useState<Categoria[]>([]);
  const [contas, setContas] = React.useState<Conta[]>([]);
  const [descricoesUsadas, setDescricoesUsadas] = React.useState<DescricaoUsada[]>([]);
  const [tipo, setTipo] = React.useState<"receita" | "despesa">("despesa");
  const [valor, setValor] = React.useState("");
  const [descricao, setDescricao] = React.useState("");
  const [categoriaId, setCategoriaId] = React.useState("");
  const [contaId, setContaId] = React.useState("");
  const [data, setData] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [formaPagamento, setFormaPagamento] =
    React.useState<(typeof FORMAS_PAGAMENTO)[number]["id"]>("pix");
  const [tipoNegocio, setTipoNegocio] = React.useState<"pessoal" | "negocio">("pessoal");
  const [salvando, setSalvando] = React.useState(false);
  const [excluindo, setExcluindo] = React.useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (aberto && user) {
      listarCategorias(user.id).then(setCategorias);
      listarContas(user.id).then((lista) => {
        setContas(lista);
        if (!transacaoEditando && lista[0]) setContaId(lista[0].id);
      });
      listarDescricoesUsadas(user.id).then(setDescricoesUsadas);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, user]);

  const sugestoesDescricao = React.useMemo(
    () => descricoesUsadas.filter((d) => d.tipo === tipo).map((d) => d.descricao),
    [descricoesUsadas, tipo]
  );

  React.useEffect(() => {
    if (aberto && transacaoEditando) {
      setTipo(transacaoEditando.tipo);
      setValor(String(transacaoEditando.valor).replace(".", ","));
      setDescricao(transacaoEditando.descricao ?? "");
      setCategoriaId(transacaoEditando.categoria_id ?? "");
      setContaId(transacaoEditando.conta_id ?? "");
      setData(transacaoEditando.data);
      setFormaPagamento(
        (transacaoEditando.forma_pagamento as (typeof FORMAS_PAGAMENTO)[number]["id"]) ?? "pix"
      );
      setTipoNegocio(transacaoEditando.tipo_negocio === "negocio" ? "negocio" : "pessoal");
    }
  }, [aberto, transacaoEditando]);

  React.useEffect(() => {
    if (!aberto) {
      setValor("");
      setDescricao("");
      setCategoriaId(categoriaIdInicial ?? "");
      setContaId("");
      setErro(null);
      setTipo("despesa");
      setData(new Date().toISOString().slice(0, 10));
      setFormaPagamento("pix");
      setTipoNegocio(mundo);
      setConfirmandoExclusao(false);
    }
  }, [aberto, mundo, categoriaIdInicial]);

  if (!aberto) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const valorNumero = Number(valor.replace(",", "."));
    if (!valorNumero || valorNumero <= 0) {
      setErro("Digite um valor válido.");
      return;
    }
    if (!descricao.trim()) {
      setErro("Digite uma descrição rápida.");
      return;
    }

    setErro(null);
    setSalvando(true);
    const dados = {
      usuario_id: user.id,
      conta_id: contaId || null,
      categoria_id: categoriaId || null,
      tipo,
      valor: valorNumero,
      descricao: descricao.trim(),
      data,
      forma_pagamento: formaPagamento,
      tipo_negocio: ehNegocio ? tipoNegocio : "pessoal",
    };
    const { error } = transacaoEditando
      ? await atualizarTransacao(transacaoEditando, dados)
      : await criarTransacao(dados);
    setSalvando(false);

    if (error) {
      setErro("Não foi possível salvar. Tente novamente.");
      return;
    }
    onSalvo();
    onFechar();
  }

  async function handleExcluir() {
    if (!transacaoEditando) return;
    setExcluindo(true);
    const { error } = await deletarTransacao(transacaoEditando);
    setExcluindo(false);

    if (error) {
      setErro("Não foi possível apagar. Tente novamente.");
      return;
    }
    onSalvo();
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl bg-card p-6 shadow-card-hover sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-h3 text-foreground">{editando ? "Editar anotação" : "Nova anotação"}</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10"
          >
            <X size={20} />
          </button>
        </div>

        {confirmandoExclusao ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-red-500">
              <Trash2 size={26} />
            </span>
            <p className="text-body text-foreground">
              Apagar &ldquo;{transacaoEditando?.descricao}&rdquo;? O saldo da conta é ajustado
              automaticamente. Essa ação não pode ser desfeita.
            </p>
            <div className="flex w-full gap-2">
              <Button
                variant="tertiary"
                onClick={() => setConfirmandoExclusao(false)}
                disabled={excluindo}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleExcluir}
                disabled={excluindo}
                className="flex-1 bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
              >
                {excluindo ? "Apagando..." : "Sim, apagar"}
              </Button>
            </div>
            {erro && <p className="text-small text-rose-600">{erro}</p>}
          </div>
        ) : bloqueado ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
              <Sparkles size={26} />
            </span>
            <p className="text-body text-foreground">
              Você já usou suas 30 anotações grátis deste mês. Assine um plano pago para anotar
              sem limites.
            </p>
            <Button onClick={onFechar} className="w-full">
              Entendi
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTipo("despesa")}
                className={cn(
                  "flex-1 rounded-xl border-2 py-2.5 text-small font-semibold transition-all",
                  tipo === "despesa" ? "border-rose-400 bg-rose-50 text-rose-600" : "border-border text-muted"
                )}
              >
                Saída
              </button>
              <button
                type="button"
                onClick={() => setTipo("receita")}
                className={cn(
                  "flex-1 rounded-xl border-2 py-2.5 text-small font-semibold transition-all",
                  tipo === "receita"
                    ? "border-primary-400 bg-primary-50 text-primary-700"
                    : "border-border text-muted"
                )}
              >
                Entrada
              </button>
            </div>

            <Input
              label="Valor"
              inputMode="decimal"
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
            />
            <Input
              label="Descrição"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Mercado, Uber, Salário..."
              list="sugestoes-descricao"
              autoComplete="off"
            />
            <datalist id="sugestoes-descricao">
              {sugestoesDescricao.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>

            {categorias.filter((c) => c.tipo === tipo).length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Categoria</span>
                <div className="flex flex-wrap gap-2">
                  {categorias
                    .filter((c) => c.tipo === tipo)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCategoriaId(c.id)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-small font-medium transition-all",
                          categoriaId === c.id
                            ? "border-primary-500 bg-primary-50 text-primary-700"
                            : "border-border text-muted"
                        )}
                      >
                        {c.nome}
                      </button>
                    ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Forma de pagamento</span>
                <select
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value as typeof formaPagamento)}
                  className="h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
                >
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {contas.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Conta</span>
                <select
                  value={contaId}
                  onChange={(e) => setContaId(e.target.value)}
                  className="h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
                >
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {ehNegocio && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-small font-medium",
                  tipoNegocio === "negocio" ? "bg-accent-50 text-accent-700" : "bg-primary-50 text-primary-700"
                )}
              >
                {tipoNegocio === "negocio" ? <Building2 size={16} /> : <Home size={16} />}
                {tipoNegocio === "negocio" ? "Anotando como gasto/receita do negócio" : "Anotando como gasto/receita pessoal"}
              </div>
            )}

            {erro && <p className="text-small text-rose-600">{erro}</p>}

            <Button type="submit" size="lg" disabled={salvando} className="mt-1 w-full">
              {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar anotação"}
              {!salvando && <Plus size={18} />}
            </Button>
            {editando && (
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(true)}
                className="flex items-center justify-center gap-2 py-1 text-small font-medium text-red-500 hover:text-red-600"
              >
                <Trash2 size={16} />
                Apagar essa anotação
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
