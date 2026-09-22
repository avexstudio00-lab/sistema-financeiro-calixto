"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Wallet, Pencil, Trash2, Landmark, PiggyBank, Banknote, CreditCard, Smartphone, Receipt } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarContas, criarConta, atualizarConta, deletarConta } from "@/lib/data/contas";
import { listarTransacoes } from "@/lib/data/transacoes";
import { cicloAtual } from "@/lib/data/faturaCartao";
import { formatarMoeda } from "@/lib/format";
import type { Conta, Transacao } from "@/lib/data/tipos";

const TIPOS: { id: Conta["tipo"]; label: string; icon: typeof Landmark }[] = [
  { id: "corrente", label: "Conta corrente", icon: Landmark },
  { id: "poupanca", label: "Poupança", icon: PiggyBank },
  { id: "dinheiro", label: "Dinheiro", icon: Banknote },
  { id: "cartao_credito", label: "Cartão de crédito", icon: CreditCard },
  { id: "carteira_digital", label: "Carteira digital", icon: Smartphone },
];

function iconeDoTipo(tipo: Conta["tipo"]) {
  return TIPOS.find((t) => t.id === tipo)?.icon ?? Wallet;
}

function labelDoTipo(tipo: Conta["tipo"]) {
  return TIPOS.find((t) => t.id === tipo)?.label ?? tipo;
}

interface FormularioConta {
  nome: string;
  tipo: Conta["tipo"];
  saldoInicial: string;
  limite: string;
  diaFechamento: string;
  diaVencimento: string;
}

const FORM_VAZIO: FormularioConta = {
  nome: "",
  tipo: "corrente",
  saldoInicial: "",
  limite: "",
  diaFechamento: "",
  diaVencimento: "",
};

const INPUT_DIA_CLASSE =
  "h-11 w-full rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100";

export default function CarteirasPage() {
  const { user } = useAuth();
  const [contas, setContas] = React.useState<Conta[]>([]);
  const [transacoes, setTransacoes] = React.useState<Transacao[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [formAberto, setFormAberto] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormularioConta>(FORM_VAZIO);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    // Busca as transações também (sem filtro de período, mesmo padrão do
    // Extrato completo) só pra calcular o total da fatura em aberto de cada
    // cartão de crédito -- nunca usada pra recalcular saldo, isso continua
    // vindo só de `saldo_atual`.
    const [listaContas, listaTransacoes] = await Promise.all([
      listarContas(user.id),
      listarTransacoes(user.id),
    ]);
    setContas(listaContas);
    setTransacoes(listaTransacoes);
    setCarregando(false);
  }, [user]);

  const totalFaturaAberta = React.useCallback(
    (conta: Conta) => {
      if (conta.tipo !== "cartao_credito" || !conta.dia_fechamento || !conta.dia_vencimento) return null;
      const ciclo = cicloAtual(conta.dia_fechamento, conta.dia_vencimento);
      const total = transacoes
        .filter((t) => t.conta_id === conta.id && t.data >= ciclo.inicio && t.data <= ciclo.fechamento)
        .reduce((soma, t) => soma + (t.tipo === "despesa" ? Number(t.valor) : -Number(t.valor)), 0);
      return { ciclo, total };
    },
    [transacoes]
  );

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const saldoTotal = contas.reduce((soma, c) => soma + Number(c.saldo_atual), 0);

  function abrirNovo() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setErro(null);
    setFormAberto(true);
  }

  function abrirEdicao(conta: Conta) {
    setEditandoId(conta.id);
    setForm({
      nome: conta.nome,
      tipo: conta.tipo,
      saldoInicial: String(conta.saldo_inicial).replace(".", ","),
      limite: conta.limite !== null ? String(conta.limite).replace(".", ",") : "",
      diaFechamento: conta.dia_fechamento !== null ? String(conta.dia_fechamento) : "",
      diaVencimento: conta.dia_vencimento !== null ? String(conta.dia_vencimento) : "",
    });
    setErro(null);
    setFormAberto(true);
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (form.nome.trim().length < 2) {
      setErro("Digite um nome pra essa carteira.");
      return;
    }

    const limite = form.tipo === "cartao_credito" && form.limite ? Number(form.limite.replace(",", ".")) : null;
    const diaFechamento =
      form.tipo === "cartao_credito" && form.diaFechamento ? Number(form.diaFechamento) : null;
    const diaVencimento =
      form.tipo === "cartao_credito" && form.diaVencimento ? Number(form.diaVencimento) : null;

    if (
      (diaFechamento !== null && (diaFechamento < 1 || diaFechamento > 31)) ||
      (diaVencimento !== null && (diaVencimento < 1 || diaVencimento > 31))
    ) {
      setErro("Dia de fechamento/vencimento precisa ser um número entre 1 e 31.");
      return;
    }

    setErro(null);
    setSalvando(true);
    const { error } = editandoId
      ? await atualizarConta(editandoId, {
          nome: form.nome.trim(),
          tipo: form.tipo,
          limite,
          diaFechamento,
          diaVencimento,
        })
      : await criarConta(
          user.id,
          form.nome.trim(),
          form.tipo,
          Number(form.saldoInicial.replace(",", ".")) || 0,
          limite,
          diaFechamento,
          diaVencimento
        );
    setSalvando(false);

    if (error) {
      setErro("Não foi possível salvar. Tente novamente.");
      return;
    }
    setFormAberto(false);
    setForm(FORM_VAZIO);
    setEditandoId(null);
    carregar();
  }

  async function handleExcluir(id: string) {
    setSalvando(true);
    const { error } = await deletarConta(id);
    setSalvando(false);
    setConfirmandoExclusaoId(null);

    if (error) {
      setErro("Essa carteira ainda tem lançamentos nela — mova ou apague os lançamentos antes de excluir.");
      return;
    }
    carregar();
  }

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Minhas carteiras</h1>
          <p className="text-body text-muted">Contas, cartões e dinheiro que você usa pra registrar seus gastos.</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={18} />
          Nova carteira
        </Button>
      </div>

      {contas.length > 0 && (
        <Card className="flex flex-col gap-2">
          <p className="text-small text-muted">Saldo somado de todas as carteiras</p>
          <p className={`text-h2 ${saldoTotal >= 0 ? "text-primary-500" : "text-red-500"}`}>
            {formatarMoeda(saldoTotal)}
          </p>
        </Card>
      )}

      {erro && !formAberto && <p className="text-small text-rose-600">{erro}</p>}

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-h3 text-foreground">{editandoId ? "Editar carteira" : "Nova carteira"}</h2>
          <form onSubmit={handleSalvar} className="flex flex-col gap-4">
            <Input
              label="Nome"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: Nubank, Carteira, Caixinha"
              autoFocus
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-foreground">Tipo</span>
              <div className="flex flex-wrap gap-2">
                {TIPOS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, tipo: t.id }))}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-small font-medium transition-all ${
                      form.tipo === t.id
                        ? "border-primary-500 bg-primary-50 text-primary-700"
                        : "border-border text-muted"
                    }`}
                  >
                    <t.icon size={14} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            {!editandoId && (
              <Input
                label="Saldo inicial"
                inputMode="decimal"
                value={form.saldoInicial}
                onChange={(e) => setForm((f) => ({ ...f, saldoInicial: e.target.value }))}
                placeholder="0,00"
              />
            )}
            {form.tipo === "cartao_credito" && (
              <>
                <Input
                  label="Limite (opcional)"
                  inputMode="decimal"
                  value={form.limite}
                  onChange={(e) => setForm((f) => ({ ...f, limite: e.target.value }))}
                  placeholder="0,00"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-small font-medium text-foreground">Dia de fechamento (opcional)</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      inputMode="numeric"
                      value={form.diaFechamento}
                      onChange={(e) => setForm((f) => ({ ...f, diaFechamento: e.target.value }))}
                      placeholder="Ex: 28"
                      className={INPUT_DIA_CLASSE}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-small font-medium text-foreground">Dia de vencimento (opcional)</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      inputMode="numeric"
                      value={form.diaVencimento}
                      onChange={(e) => setForm((f) => ({ ...f, diaVencimento: e.target.value }))}
                      placeholder="Ex: 5"
                      className={INPUT_DIA_CLASSE}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted">
                  Preenchendo os dois, esta carteira ganha uma tela de fatura organizada por ciclo de
                  fechamento (em vez do mês civil) -- ver "Ver fatura" no card depois de salvar.
                </p>
              </>
            )}
            {erro && <p className="text-small text-rose-600">{erro}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={salvando} className="flex-1">
                {salvando ? "Salvando..." : "Salvar carteira"}
              </Button>
              <Button type="button" variant="tertiary" onClick={() => setFormAberto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : contas.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Wallet size={28} className="text-primary-400" />
          <p className="text-body text-muted">Você ainda não tem carteiras cadastradas.</p>
          <Button onClick={abrirNovo}>
            <Plus size={18} />
            Cadastrar minha primeira carteira
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {contas.map((c) => {
            const Icone = iconeDoTipo(c.tipo);
            const fatura = totalFaturaAberta(c);
            return (
              <Card key={c.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <Icone size={18} />
                  </span>
                  <div>
                    <p className="text-body font-semibold text-foreground">{c.nome}</p>
                    <p className="text-small text-muted">{labelDoTipo(c.tipo)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted">Saldo atual</p>
                  <p
                    className={`text-h3 ${Number(c.saldo_atual) >= 0 ? "text-foreground" : "text-red-500"}`}
                  >
                    {formatarMoeda(Number(c.saldo_atual))}
                  </p>
                  {c.limite !== null && (
                    <p className="text-xs text-muted">Limite: {formatarMoeda(Number(c.limite))}</p>
                  )}
                </div>

                {fatura && (
                  <div className="rounded-xl bg-muted/5 p-3">
                    <p className="text-xs text-muted">
                      {fatura.ciclo.rotulo} (em aberto) · fecha dia {new Date(fatura.ciclo.fechamento + "T00:00:00").getDate()} ·
                      vence dia {new Date(fatura.ciclo.vencimento + "T00:00:00").getDate()}
                    </p>
                    <p className="text-body font-semibold text-foreground">{formatarMoeda(fatura.total)}</p>
                  </div>
                )}

                <div className="flex items-center gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(c)}
                    className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
                  >
                    <Pencil size={12} />
                    Editar
                  </button>
                  {c.tipo === "cartao_credito" && c.dia_fechamento && c.dia_vencimento && (
                    <Link
                      href={`/dashboard/cartao/${c.id}`}
                      className="flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
                    >
                      <Receipt size={12} />
                      Ver fatura
                    </Link>
                  )}
                  {confirmandoExclusaoId === c.id ? (
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-xs text-muted">Apagar?</span>
                      <Button size="sm" variant="tertiary" onClick={() => setConfirmandoExclusaoId(null)}>
                        Não
                      </Button>
                      <Button
                        size="sm"
                        disabled={salvando}
                        onClick={() => handleExcluir(c.id)}
                        className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
                      >
                        Sim, apagar
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label="Apagar carteira"
                      onClick={() => setConfirmandoExclusaoId(c.id)}
                      className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Container>
  );
}
