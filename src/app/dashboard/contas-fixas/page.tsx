"use client";

import * as React from "react";
import { CalendarClock, CheckCircle2, Pause, Play, PlusCircle, Repeat, Trash2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarCategorias } from "@/lib/data/categorias";
import { listarContas } from "@/lib/data/contas";
import {
  listarContasFixas,
  criarContaFixa,
  alternarAtivaContaFixa,
  removerContaFixa,
  buscarUltimoLancamentoGerado,
  gerarLancamentosPendentes,
} from "@/lib/data/contasFixas";
import { deletarTransacao } from "@/lib/data/transacoes";
import { formatarMoeda } from "@/lib/format";
import type { Categoria, Conta, ContaFixa, Transacao } from "@/lib/data/tipos";

const SELECT_CLASSE =
  "h-11 w-full rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100";

function estadoInicialForm() {
  return {
    descricao: "",
    valor: "",
    tipo: "despesa" as "receita" | "despesa",
    categoriaId: "",
    contaId: "",
    diaVencimento: "5",
    dataFim: "",
  };
}

export default function ContasFixasPage() {
  const { user } = useAuth();
  const [contasFixas, setContasFixas] = React.useState<ContaFixa[]>([]);
  const [categorias, setCategorias] = React.useState<Categoria[]>([]);
  const [contas, setContas] = React.useState<Conta[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [salvando, setSalvando] = React.useState(false);
  const [alternando, setAlternando] = React.useState<string | null>(null);
  const [avisoGeracao, setAvisoGeracao] = React.useState<number | null>(null);
  const [form, setForm] = React.useState(estadoInicialForm());
  // Fluxo de confirmação ao remover uma conta fixa (ver iniciarRemocao abaixo):
  // antes de apagar, checa se ela já gerou algum lançamento este mês, pra
  // oferecer a opção de apagar esse lançamento também (revertendo o saldo)
  // em vez de deixá-lo "esquecido" contando no saldo e nos resumos.
  const [confirmandoRemocaoId, setConfirmandoRemocaoId] = React.useState<string | null>(null);
  const [verificandoLancamento, setVerificandoLancamento] = React.useState(false);
  const [lancamentoVinculado, setLancamentoVinculado] = React.useState<Transacao | null>(null);

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    // Antes de listar, gera (se ainda não gerou este mês) os lançamentos das
    // contas fixas cujo dia de vencimento já chegou — assim quem entra aqui
    // sempre vê o estado mais atual, sem precisar de cron/infra separada.
    const geradas = await gerarLancamentosPendentes(user.id);
    setAvisoGeracao(geradas > 0 ? geradas : null);

    const [fixas, cats, listaContas] = await Promise.all([
      listarContasFixas(user.id),
      listarCategorias(user.id),
      listarContas(user.id),
    ]);
    setContasFixas(fixas);
    setCategorias(cats);
    setContas(listaContas);
    setCarregando(false);
  }, [user]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const categoriasDoTipo = categorias.filter((c) => c.tipo === form.tipo);

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const valor = Number(form.valor.replace(",", "."));
    const dia = Number(form.diaVencimento);
    if (!form.descricao.trim() || !valor || valor <= 0 || !dia || dia < 1 || dia > 31) return;

    setSalvando(true);
    const { error } = await criarContaFixa({
      usuario_id: user.id,
      descricao: form.descricao.trim(),
      valor,
      tipo: form.tipo,
      categoria_id: form.categoriaId || null,
      conta_id: form.contaId || null,
      dia_vencimento: dia,
      data_inicio: new Date().toISOString().slice(0, 10),
      data_fim: form.dataFim || null,
    });
    if (!error) {
      setForm(estadoInicialForm());
      await carregar();
    }
    setSalvando(false);
  }

  async function handleAlternarAtiva(cf: ContaFixa) {
    setAlternando(cf.id);
    await alternarAtivaContaFixa(cf.id, !cf.ativa);
    await carregar();
    setAlternando(null);
  }

  const mesAtual = new Date().getMonth() + 1;
  const anoAtual = new Date().getFullYear();

  // Passo 1 do fluxo de remoção: abre a confirmação e, se essa conta fixa já
  // gerou lançamento este mês (mesma checagem do badge "Já lançada este
  // mês"), busca esse lançamento pra oferecer a opção de apagá-lo também.
  async function iniciarRemocao(cf: ContaFixa) {
    setConfirmandoRemocaoId(cf.id);
    setLancamentoVinculado(null);
    const geradaEsteMes = cf.ultimo_ano_gerado === anoAtual && cf.ultimo_mes_gerado === mesAtual;
    if (!geradaEsteMes) return;
    setVerificandoLancamento(true);
    const lancamento = await buscarUltimoLancamentoGerado(cf.id);
    setLancamentoVinculado(lancamento);
    setVerificandoLancamento(false);
  }

  function cancelarRemocao() {
    setConfirmandoRemocaoId(null);
    setLancamentoVinculado(null);
    setVerificandoLancamento(false);
  }

  // Passo 2: remove de fato. `apagarLancamento` só é oferecido quando existe
  // um lançamento vinculado este mês — se o usuário escolher apagar também,
  // reaproveita `deletarTransacao` (mesma função usada em "Lançamentos do
  // mês"), que já reverte o efeito no saldo da carteira sozinha.
  async function confirmarRemocao(cf: ContaFixa, apagarLancamento: boolean) {
    setAlternando(cf.id);
    if (apagarLancamento && lancamentoVinculado) {
      await deletarTransacao(lancamentoVinculado);
    }
    await removerContaFixa(cf.id);
    await carregar();
    setAlternando(null);
    cancelarRemocao();
  }

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div>
        <h1 className="text-h2 text-foreground">Contas fixas recorrentes</h1>
        <p className="text-body text-muted">
          Cadastre aluguel, assinaturas e outras contas que se repetem todo mês — a gente lança
          automaticamente pra você no dia do vencimento.
        </p>
      </div>

      {avisoGeracao !== null && (
        <Card className="flex items-center gap-3 border-primary-200 bg-primary-50">
          <CheckCircle2 size={20} className="shrink-0 text-primary-600" />
          <p className="text-body text-primary-900">
            {avisoGeracao === 1
              ? "1 lançamento foi criado automaticamente agora, de uma conta fixa que venceu."
              : `${avisoGeracao} lançamentos foram criados automaticamente agora, de contas fixas que venceram.`}
          </p>
        </Card>
      )}

      <Card padding="lg" className="flex flex-col gap-4">
        <h2 className="text-h3 text-foreground">Nova conta fixa</h2>
        <form onSubmit={handleCriar} className="flex flex-col gap-4">
          <div className="flex gap-2">
            {(["despesa", "receita"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, tipo: t, categoriaId: "" }))}
                className={`rounded-full px-4 py-1.5 text-small font-medium transition-colors ${
                  form.tipo === t ? "bg-primary-50 text-primary-700" : "text-muted hover:bg-muted/10"
                }`}
              >
                {t === "despesa" ? "Gasto fixo" : "Receita fixa"}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Descrição"
              placeholder="Ex: Aluguel, Netflix, Academia"
              value={form.descricao}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
            />
            <Input
              label="Valor"
              inputMode="decimal"
              placeholder="Ex: 150,00"
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-small font-medium text-foreground">Categoria</label>
              <select
                value={form.categoriaId}
                onChange={(e) => setForm((f) => ({ ...f, categoriaId: e.target.value }))}
                className={SELECT_CLASSE}
              >
                <option value="">Sem categoria</option>
                {categoriasDoTipo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-small font-medium text-foreground">Carteira</label>
              <select
                value={form.contaId}
                onChange={(e) => setForm((f) => ({ ...f, contaId: e.target.value }))}
                className={SELECT_CLASSE}
              >
                <option value="">Sem carteira</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Dia do vencimento"
              type="number"
              min={1}
              max={31}
              value={form.diaVencimento}
              onChange={(e) => setForm((f) => ({ ...f, diaVencimento: e.target.value }))}
            />
          </div>

          <Input
            label="Repetir até (opcional)"
            type="date"
            value={form.dataFim}
            onChange={(e) => setForm((f) => ({ ...f, dataFim: e.target.value }))}
            helperText="Deixe em branco pra repetir todo mês, sem data pra parar."
          />

          <Button
            type="submit"
            disabled={salvando || !form.descricao.trim() || !form.valor}
            className="self-start"
          >
            <PlusCircle size={18} />
            Criar conta fixa
          </Button>
        </form>
      </Card>

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : contasFixas.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Repeat size={32} className="text-muted" />
          <p className="text-body text-muted">Nenhuma conta fixa cadastrada ainda.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {contasFixas.map((cf) => {
            const geradaEsteMes = cf.ultimo_ano_gerado === anoAtual && cf.ultimo_mes_gerado === mesAtual;
            const confirmandoEsta = confirmandoRemocaoId === cf.id;
            return (
              <Card key={cf.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        cf.tipo === "receita" ? "bg-primary-50 text-primary-600" : "bg-rose-50 text-red-500"
                      }`}
                    >
                      <CalendarClock size={18} />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-body font-medium text-foreground">{cf.descricao}</p>
                        {!cf.ativa && (
                          <Badge variant="neutral" size="sm">
                            Pausada
                          </Badge>
                        )}
                        {cf.ativa && geradaEsteMes && (
                          <Badge variant="accent" size="sm">
                            Já lançada este mês
                          </Badge>
                        )}
                      </div>
                      <p className="text-small text-muted">
                        Todo dia {cf.dia_vencimento}
                        {cf.categorias?.nome ? ` · ${cf.categorias.nome}` : ""}
                        {cf.contas?.nome ? ` · ${cf.contas.nome}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className={`text-body font-semibold ${cf.tipo === "receita" ? "text-primary-600" : "text-red-500"}`}>
                      {cf.tipo === "receita" ? "+" : "-"}
                      {formatarMoeda(Number(cf.valor))}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleAlternarAtiva(cf)}
                      disabled={alternando === cf.id}
                      aria-label={cf.ativa ? "Pausar conta fixa" : "Reativar conta fixa"}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10 hover:text-foreground"
                    >
                      {cf.ativa ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => (confirmandoEsta ? cancelarRemocao() : iniciarRemocao(cf))}
                      disabled={alternando === cf.id}
                      aria-label="Remover conta fixa"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10 hover:text-rose-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {confirmandoEsta && (
                  <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    {verificandoLancamento ? (
                      <p className="text-small text-amber-900">Verificando lançamentos desta conta fixa...</p>
                    ) : lancamentoVinculado ? (
                      <>
                        <p className="text-small text-amber-900">
                          Essa conta fixa já gerou o lançamento <strong>&quot;{lancamentoVinculado.descricao}&quot;</strong> de{" "}
                          <strong>{formatarMoeda(Number(lancamentoVinculado.valor))}</strong> este mês. O que você quer fazer com ele?
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="tertiary" onClick={cancelarRemocao}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={alternando === cf.id}
                            onClick={() => confirmarRemocao(cf, false)}
                          >
                            Remover só a conta fixa (manter o lançamento)
                          </Button>
                          <Button
                            size="sm"
                            disabled={alternando === cf.id}
                            onClick={() => confirmarRemocao(cf, true)}
                            className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
                          >
                            Remover conta fixa e o lançamento
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-small text-amber-900">Tem certeza que quer remover essa conta fixa?</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="tertiary" onClick={cancelarRemocao}>
                            Não
                          </Button>
                          <Button
                            size="sm"
                            disabled={alternando === cf.id}
                            onClick={() => confirmarRemocao(cf, false)}
                            className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
                          >
                            Sim, apagar
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Container>
  );
}
