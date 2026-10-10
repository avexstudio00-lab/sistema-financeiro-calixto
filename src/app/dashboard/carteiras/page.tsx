"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Wallet, Pencil, Trash2, Landmark, PiggyBank, Banknote, CreditCard, Smartphone, Receipt, ArrowLeftRight, Building2 } from "lucide-react";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { criarTransferencia } from "@/lib/data/transacoes";
import { dividirCarteirasPessoalEmpresa, type DivisaoCarteiras } from "@/lib/data/patrimonio";
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
  const { user, papel, podeAcessarMinhaEmpresa } = useAuth();
  const temEmpresaPropria = papel === "dono" && podeAcessarMinhaEmpresa;
  const [divisao, setDivisao] = React.useState<DivisaoCarteiras | null>(null);
  // Transferência entre carteiras (item 4.18: não conta como gasto/receita).
  const [transferindo, setTransferindo] = React.useState(false);
  const [transfOrigem, setTransfOrigem] = React.useState("");
  const [transfDestino, setTransfDestino] = React.useState("");
  const [transfValor, setTransfValor] = React.useState("");
  const [transfData, setTransfData] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [transfDescricao, setTransfDescricao] = React.useState("");
  const [transfErro, setTransfErro] = React.useState<string | null>(null);
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
    // Recarregar depois de salvar NÃO mostra o spinner (só a 1ª carga):
    // trocar a lista pelo spinner jogava a tela pro topo e fechava o que
    // estava aberto (pedido do usuário em 05/out/2026).
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
    // Item 6.9: quanto de cada carteira é caixa da empresa x pessoal.
    if (temEmpresaPropria) setDivisao(await dividirCarteirasPessoalEmpresa(user.id, listaContas));
  }, [user, temEmpresaPropria]);

  async function handleTransferir(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const valor = Number(transfValor.trim().replace(/\./g, "").replace(",", "."));
    if (!transfOrigem || !transfDestino) {
      setTransfErro("Escolha a carteira de origem e a de destino.");
      return;
    }
    setSalvando(true);
    setTransfErro(null);
    const { error } = await criarTransferencia({
      usuarioId: user.id,
      contaOrigemId: transfOrigem,
      contaDestinoId: transfDestino,
      valor,
      data: transfData,
      descricao: transfDescricao,
    });
    setSalvando(false);
    if (error) {
      setTransfErro((error as { message?: string }).message ?? "Não foi possível transferir.");
      return;
    }
    setTransferindo(false);
    setTransfValor("");
    setTransfDescricao("");
    carregar();
  }

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

      {contas.length >= 2 && (
        <Card className="flex flex-col gap-3">
          {!transferindo ? (
            <button
              type="button"
              onClick={() => {
                setTransferindo(true);
                setTransfErro(null);
              }}
              className="flex items-center gap-2 self-start text-small font-semibold text-primary-700 hover:underline"
            >
              <ArrowLeftRight size={16} />
              Transferir entre carteiras
            </button>
          ) : (
            <form onSubmit={handleTransferir} className="flex flex-col gap-3">
              <p className="text-small font-semibold text-foreground">Transferir entre carteiras</p>
              <p className="text-xs text-muted">
                Dinheiro que só muda de lugar (ex.: corrente → poupança, pagar a fatura do cartão). Não conta como gasto nem como
                receita nos relatórios.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-small font-medium text-foreground">
                  Sai de
                  <select value={transfOrigem} onChange={(e) => setTransfOrigem(e.target.value)} className="h-11 rounded-xl border border-border bg-card px-3 text-small text-foreground">
                    <option value="">Escolha...</option>
                    {contas.filter((c) => c.tipo !== "cartao_credito").map((c) => (
                      <option key={c.id} value={c.id}>{c.nome} — {formatarMoeda(Number(c.saldo_atual))}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-small font-medium text-foreground">
                  Entra em
                  <select value={transfDestino} onChange={(e) => setTransfDestino(e.target.value)} className="h-11 rounded-xl border border-border bg-card px-3 text-small text-foreground">
                    <option value="">Escolha...</option>
                    {contas.filter((c) => c.id !== transfOrigem).map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </label>
                <Input label="Valor" inputMode="decimal" value={transfValor} onChange={(e) => setTransfValor(e.target.value)} placeholder="0,00" />
                <DateMaskInput label="Data" value={transfData} onChange={setTransfData} />
              </div>
              <Input label="Descrição (opcional)" value={transfDescricao} onChange={(e) => setTransfDescricao(e.target.value)} placeholder="Ex.: Pagamento da fatura" />
              {transfErro && <p className="text-small text-rose-700">{transfErro}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={salvando}>{salvando ? "Transferindo..." : "Transferir"}</Button>
                <Button type="button" variant="tertiary" onClick={() => setTransferindo(false)}>Cancelar</Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {divisao && divisao.porConta.some((d) => d.mista) && (
        <Card className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-small font-semibold text-foreground">
            <Building2 size={16} className="text-primary-700" />
            Pessoal x empresa nas suas carteiras
          </p>
          <p className="text-xs text-muted">
            Calculado pelos lançamentos marcados como &quot;negócio&quot; em cada carteira: entradas da empresa − saídas da empresa.
          </p>
          <div className="grid gap-1 text-small sm:grid-cols-2">
            <p className="text-muted">Total da empresa: <strong className="text-foreground">{formatarMoeda(divisao.totalEmpresa)}</strong></p>
            <p className="text-muted">Total pessoal: <strong className="text-foreground">{formatarMoeda(divisao.totalPessoal)}</strong></p>
          </div>
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
                  {(() => {
                    const d = divisao?.porConta.find((x) => x.conta.id === c.id);
                    if (!d || !d.mista) return null;
                    return (
                      <div className="mt-2 flex flex-col gap-0.5 rounded-xl bg-muted/5 p-2 text-xs">
                        <span className="font-semibold text-foreground">Conta mista</span>
                        <span className="text-muted">Empresa (capital de giro): <strong className="text-foreground">{formatarMoeda(d.parteEmpresa)}</strong></span>
                        <span className="text-muted">Pessoal: <strong className="text-foreground">{formatarMoeda(d.partePessoal)}</strong></span>
                      </div>
                    );
                  })()}
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
