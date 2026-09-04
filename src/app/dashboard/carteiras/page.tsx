"use client";

import * as React from "react";
import { Plus, Wallet, Pencil, Trash2, Landmark, PiggyBank, Banknote, CreditCard, Smartphone } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarContas, criarConta, atualizarConta, deletarConta } from "@/lib/data/contas";
import { formatarMoeda } from "@/lib/format";
import type { Conta } from "@/lib/data/tipos";

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
}

const FORM_VAZIO: FormularioConta = { nome: "", tipo: "corrente", saldoInicial: "", limite: "" };

export default function CarteirasPage() {
  const { user } = useAuth();
  const [contas, setContas] = React.useState<Conta[]>([]);
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
    setContas(await listarContas(user.id));
    setCarregando(false);
  }, [user]);

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

    setErro(null);
    setSalvando(true);
    const { error } = editandoId
      ? await atualizarConta(editandoId, { nome: form.nome.trim(), tipo: form.tipo, limite })
      : await criarConta(
          user.id,
          form.nome.trim(),
          form.tipo,
          Number(form.saldoInicial.replace(",", ".")) || 0,
          limite
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
      <div className="flex flex-wrap items-center justify-between gap-4">
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
              <Input
                label="Limite (opcional)"
                inputMode="decimal"
                value={form.limite}
                onChange={(e) => setForm((f) => ({ ...f, limite: e.target.value }))}
                placeholder="0,00"
              />
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

                <div className="flex items-center gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(c)}
                    className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
                  >
                    <Pencil size={12} />
                    Editar
                  </button>
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
