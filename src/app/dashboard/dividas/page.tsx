"use client";

import * as React from "react";
import { Plus, HandCoins, Trophy, Trash2, RotateCcw, Pencil, Calculator, TrendingUp } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  criarDivida,
  listarDividasComProgresso,
  alternarQuitadaDivida,
  removerDivida,
  atualizarDivida,
  calcularMesesParaQuitar,
  listarParcelasDivida,
  calcularStatusParcelasDivida,
  calcularCustoJuros,
  registrarPagamentoParcela,
  NOME_CATEGORIA_DIVIDA,
  type ParcelaDividaComStatus,
  type OpcoesParcelamentoDivida,
} from "@/lib/data/dividas";
import { adicionarMeses, gerarValoresSugeridosParcelas, gerarDatasSugeridasParcelas } from "@/lib/data/investimentos";
import { listarContas } from "@/lib/data/contas";
import { listarCategorias } from "@/lib/data/categorias";
import { AnelProgresso } from "@/components/dashboard/graficos/AnelProgresso";
import { ParcelasDivida } from "@/components/dashboard/ParcelasDivida";
import { cn } from "@/lib/utils";
import type { DividaComProgresso, DividaParcela, Conta } from "@/lib/data/tipos";

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const NOMES_MES_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function hojeIso(): string {
  const hoje = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
}

function mesAnoExtenso(dataIso: string): string {
  const [ano, mes] = dataIso.split("-").map(Number);
  return `${NOMES_MES_EXTENSO[mes - 1]} de ${ano}`;
}

export default function DividasPage() {
  const { user } = useAuth();

  const [dividas, setDividas] = React.useState<DividaComProgresso[]>([]);
  const [contas, setContas] = React.useState<Conta[]>([]);
  const [parcelas, setParcelas] = React.useState<DividaParcela[]>([]);
  const [categoriaDividaId, setCategoriaDividaId] = React.useState<string | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [formAberto, setFormAberto] = React.useState(false);
  const [nome, setNome] = React.useState("");
  const [valorTotal, setValorTotal] = React.useState("");
  // Dívida parcelada (23/set/2026) -- opcional: quando ligada, gera
  // `numeroParcelas` parcelas iguais (a última absorve o arredondamento,
  // mesmo helper já usado em Investimentos) a partir da data da 1ª parcela.
  // `valorEmprestado` é só pro simulador estático "vale a pena" (opcional).
  const [parcelada, setParcelada] = React.useState(false);
  const [numeroParcelas, setNumeroParcelas] = React.useState("2");
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = React.useState("");
  const [valorEmprestado, setValorEmprestado] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [removendoId, setRemovendoId] = React.useState<string | null>(null);
  const [dividaEditandoId, setDividaEditandoId] = React.useState<string | null>(null);
  const [edicao, setEdicao] = React.useState({ nome: "", valorTotal: "" });
  const [salvandoEdicao, setSalvandoEdicao] = React.useState(false);
  const [simulacaoEmEdicao, setSimulacaoEmEdicao] = React.useState<Record<string, string>>({});
  const [registrandoPagamento, setRegistrandoPagamento] = React.useState(false);

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    const [listaDividas, listaContas, listaCategorias, listaParcelas] = await Promise.all([
      listarDividasComProgresso(user.id),
      listarContas(user.id),
      listarCategorias(user.id),
      listarParcelasDivida(user.id),
    ]);
    setDividas(listaDividas);
    setContas(listaContas);
    setCategoriaDividaId(listaCategorias.find((c) => c.nome === NOME_CATEGORIA_DIVIDA)?.id ?? null);
    setParcelas(listaParcelas);
    setCarregando(false);
  }, [user]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const parcelasPorDivida = React.useMemo(() => {
    const mapa = new Map<string, DividaParcela[]>();
    for (const p of parcelas) {
      const lista = mapa.get(p.divida_id) ?? [];
      lista.push(p);
      mapa.set(p.divida_id, lista);
    }
    return mapa;
  }, [parcelas]);

  // Preview das parcelas geradas no formulário de criação -- só pra pessoa
  // ver o que vai ser criado antes de confirmar, não é editável aqui (fica
  // pro próximo incremento, se um dia for pedido).
  const previewParcelas = React.useMemo(() => {
    if (!parcelada) return [];
    const num = Number(numeroParcelas);
    const total = Number(valorTotal.replace(",", "."));
    if (!Number.isInteger(num) || num < 2 || !total || total <= 0 || !dataPrimeiraParcela) return [];
    const valores = gerarValoresSugeridosParcelas(total, num);
    const datas = [dataPrimeiraParcela, ...gerarDatasSugeridasParcelas(dataPrimeiraParcela, num - 1, "mensal")];
    return valores.map((v, i) => ({ numero: i + 1, valor: v, dataVencimento: datas[i] }));
  }, [parcelada, numeroParcelas, valorTotal, dataPrimeiraParcela]);

  async function handleCriarDivida(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const valor = Number(valorTotal.replace(",", "."));
    if (nome.trim().length < 2 || !valor || valor <= 0) {
      setErro("Preencha o nome e um valor total válido.");
      return;
    }

    let parcelamento: OpcoesParcelamentoDivida | undefined;
    if (parcelada) {
      if (previewParcelas.length === 0) {
        setErro("Preencha o número de parcelas (mínimo 2) e a data da 1ª parcela.");
        return;
      }
      const valorEmprestadoTexto = valorEmprestado.trim();
      let valorEmprestadoNum: number | null = null;
      if (valorEmprestadoTexto !== "") {
        valorEmprestadoNum = Number(valorEmprestadoTexto.replace(",", "."));
        if (!Number.isFinite(valorEmprestadoNum) || valorEmprestadoNum <= 0) {
          setErro("Valor emprestado inválido.");
          return;
        }
      }
      parcelamento = {
        valorEmprestado: valorEmprestadoNum,
        parcelas: previewParcelas.map((p) => ({ numero: p.numero, valor: p.valor, dataVencimento: p.dataVencimento })),
      };
    }

    setErro(null);
    setSalvando(true);
    await criarDivida(user.id, nome.trim(), valor, parcelamento);
    setSalvando(false);
    setNome("");
    setValorTotal("");
    setParcelada(false);
    setNumeroParcelas("2");
    setDataPrimeiraParcela("");
    setValorEmprestado("");
    setFormAberto(false);
    carregar();
  }

  async function handleAlternarQuitada(divida: DividaComProgresso) {
    await alternarQuitadaDivida(divida.id, !divida.quitada);
    carregar();
  }

  async function handleRemover(dividaId: string) {
    await removerDivida(dividaId);
    setRemovendoId(null);
    carregar();
  }

  function abrirEdicao(divida: DividaComProgresso) {
    setDividaEditandoId(divida.id);
    setEdicao({ nome: divida.nome, valorTotal: String(divida.valor_total) });
  }

  async function handleSalvarEdicao(divida: DividaComProgresso) {
    const valor = Number(edicao.valorTotal.replace(",", "."));
    if (edicao.nome.trim().length < 2 || !valor || valor <= 0) return;
    setSalvandoEdicao(true);
    await atualizarDivida(divida.id, { nome: edicao.nome.trim(), valorTotal: valor });
    setSalvandoEdicao(false);
    setDividaEditandoId(null);
    carregar();
  }

  async function handleRegistrarPagamento(
    divida: DividaComProgresso,
    parcela: ParcelaDividaComStatus,
    contaId: string | null
  ) {
    if (!user || !categoriaDividaId) return;
    setRegistrandoPagamento(true);
    await registrarPagamentoParcela({
      usuarioId: user.id,
      dividaId: divida.id,
      dividaNome: divida.nome,
      parcela,
      totalParcelas: (parcelasPorDivida.get(divida.id) ?? []).length,
      contaId,
      categoriaId: categoriaDividaId,
    });
    setRegistrandoPagamento(false);
    carregar();
  }

  const dividasEmAberto = dividas.filter((d) => !d.quitada);
  const dividasQuitadas = dividas.filter((d) => d.quitada);

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Dívidas</h1>
          <p className="text-body text-muted">
            Cadastre o que você quer quitar e acompanhe o tanto que já abateu.
          </p>
        </div>
        <Button onClick={() => setFormAberto((v) => !v)}>
          <Plus size={18} />
          Nova dívida
        </Button>
      </div>

      <Card className="flex items-start gap-3 border-primary-200 bg-primary-50/60">
        <HandCoins size={20} className="mt-0.5 shrink-0 text-primary-600" />
        <p className="text-small text-muted">
          Depois de cadastrar, sempre que anotar um pagamento na categoria{" "}
          <strong className="text-foreground">Dívida</strong>, escolha pra qual dívida ele é — o valor
          quitado aqui atualiza sozinho, direto pelo que você já anotou. Não precisa somar nada na mão.
        </p>
      </Card>

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-h3 text-foreground">Cadastrar nova dívida</h2>
          <form onSubmit={handleCriarDivida} className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input
                  label="Nome da dívida"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Dívida com meu pai"
                />
              </div>
              <div className="flex-1">
                <Input
                  label="Valor total"
                  inputMode="decimal"
                  value={valorTotal}
                  onChange={(e) => setValorTotal(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-foreground">É parcelada?</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setParcelada(false)}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2 text-small font-medium transition-all sm:flex-none sm:px-4",
                    !parcelada ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border text-muted"
                  )}
                >
                  Não, à vista
                </button>
                <button
                  type="button"
                  onClick={() => setParcelada(true)}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2 text-small font-medium transition-all sm:flex-none sm:px-4",
                    parcelada ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border text-muted"
                  )}
                >
                  Sim, parcelada
                </button>
              </div>
            </div>

            {parcelada && (
              <div className="flex flex-col gap-4 rounded-xl bg-muted/5 p-3">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                  <div className="w-full sm:w-40">
                    <Input
                      label="Quantas parcelas?"
                      inputMode="numeric"
                      value={numeroParcelas}
                      onChange={(e) => setNumeroParcelas(e.target.value.replace(/\D/g, ""))}
                      placeholder="Ex: 12"
                    />
                  </div>
                  <DateMaskInput
                    label="Data da 1ª parcela"
                    value={dataPrimeiraParcela}
                    onChange={setDataPrimeiraParcela}
                  />
                </div>
                <div className="sm:max-w-xs">
                  <Input
                    label="Valor emprestado (opcional)"
                    inputMode="decimal"
                    value={valorEmprestado}
                    onChange={(e) => setValorEmprestado(e.target.value)}
                    placeholder="0,00"
                  />
                  <p className="mt-1 text-small text-muted">
                    Quanto você pegou de verdade — pra ver quanto de juros vai pagar no total. Deixe em
                    branco se não quiser esse comparativo.
                  </p>
                </div>
                {previewParcelas.length > 0 && (
                  <div className="flex flex-col gap-1 rounded-lg bg-white p-2.5 ring-1 ring-inset ring-border">
                    <span className="text-small font-medium text-foreground">
                      {previewParcelas.length}x de {formatarMoeda(previewParcelas[0].valor)}
                    </span>
                    <span className="text-small text-muted">
                      1ª parcela em{" "}
                      {new Date(previewParcelas[0].dataVencimento + "T00:00:00").toLocaleDateString("pt-BR")}, última
                      em{" "}
                      {new Date(
                        previewParcelas[previewParcelas.length - 1].dataVencimento + "T00:00:00"
                      ).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                )}
              </div>
            )}

            <Button type="submit" disabled={salvando} className="sm:w-auto sm:self-start">
              {salvando ? "Salvando..." : "Criar"}
            </Button>
            {erro && <p className="text-small text-rose-600">{erro}</p>}
          </form>
        </Card>
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : dividas.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <HandCoins size={32} className="text-primary-400" />
          <p className="text-body text-muted">
            Você ainda não cadastrou nenhuma dívida. Que tal começar pela primeira?
          </p>
        </Card>
      ) : (
        <>
          {dividasEmAberto.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {dividasEmAberto.map((divida) => {
                const progresso =
                  divida.valor_total > 0 ? (divida.valor_pago / divida.valor_total) * 100 : 0;
                const quitandoSozinha = progresso >= 100;
                const simulacaoTexto = simulacaoEmEdicao[divida.id] ?? "";
                const pagamentoSimulado = Number(simulacaoTexto.replace(",", "."));
                const mesesSimulados =
                  simulacaoTexto.trim() === ""
                    ? null
                    : calcularMesesParaQuitar(divida.valor_restante, pagamentoSimulado);
                const parcelasComStatus = divida.parcelada
                  ? calcularStatusParcelasDivida(parcelasPorDivida.get(divida.id) ?? [], divida.valor_pago)
                  : [];
                const custoJuros = divida.parcelada
                  ? calcularCustoJuros(divida.valor_total, divida.valor_emprestado)
                  : null;

                if (dividaEditandoId === divida.id) {
                  return (
                    <Card key={divida.id} className="flex flex-col gap-4">
                      <h3 className="text-h3 text-foreground">Editar dívida</h3>
                      <Input
                        label="Nome da dívida"
                        value={edicao.nome}
                        onChange={(e) => setEdicao((prev) => ({ ...prev, nome: e.target.value }))}
                      />
                      <Input
                        label="Valor total"
                        inputMode="decimal"
                        value={edicao.valorTotal}
                        onChange={(e) => setEdicao((prev) => ({ ...prev, valorTotal: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button variant="tertiary" className="flex-1" onClick={() => setDividaEditandoId(null)}>
                          Cancelar
                        </Button>
                        <Button
                          className="flex-1"
                          disabled={salvandoEdicao}
                          onClick={() => handleSalvarEdicao(divida)}
                        >
                          {salvandoEdicao ? "Salvando..." : "Salvar"}
                        </Button>
                      </div>
                    </Card>
                  );
                }

                return (
                  <Card key={divida.id} className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="min-w-0 text-h3 text-foreground">{divida.nome}</h3>
                      <div className="flex items-center gap-2">
                        {divida.parcelada && (
                          <Badge variant="neutral" size="sm">
                            Parcelada
                          </Badge>
                        )}
                        {quitandoSozinha && (
                          <Badge variant="primary" size="sm">
                            <Trophy size={12} />
                            Quitada
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => abrirEdicao(divida)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-muted/10 hover:text-foreground"
                          aria-label="Editar dívida"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <AnelProgresso
                        percentual={progresso}
                        tamanho={88}
                        espessura={9}
                        corProgresso="#dc2626"
                      />
                      <div className="flex flex-col gap-1">
                        <span className="text-small text-muted">
                          {formatarMoeda(divida.valor_pago)} de {formatarMoeda(divida.valor_total)}
                        </span>
                        <span className="text-small font-medium text-rose-600">
                          Falta {formatarMoeda(divida.valor_restante)}
                        </span>
                      </div>
                    </div>

                    {custoJuros && (
                      <div className="flex flex-col gap-1 rounded-xl bg-amber-50 p-3">
                        <div className="flex items-center gap-1.5 text-small font-medium text-foreground">
                          <TrendingUp size={14} className="text-amber-600" />
                          Custo do empréstimo
                        </div>
                        <p className="text-small text-muted">
                          Pegou {formatarMoeda(custoJuros.valorEmprestado)}, vai pagar{" "}
                          {formatarMoeda(custoJuros.valorTotalAPagar)} no total —{" "}
                          <strong className="text-foreground">
                            {formatarMoeda(custoJuros.jurosTotal)} de juros ({custoJuros.percentualJuros.toFixed(0)}%)
                          </strong>
                          .
                        </p>
                      </div>
                    )}

                    {divida.parcelada && (
                      <ParcelasDivida
                        parcelas={parcelasComStatus}
                        contas={contas}
                        podeRegistrarPagamento={!!categoriaDividaId}
                        salvando={registrandoPagamento}
                        onRegistrarPagamento={(parcela, contaId) => handleRegistrarPagamento(divida, parcela, contaId)}
                      />
                    )}

                    {removendoId === divida.id ? (
                      <div className="flex flex-col gap-2 rounded-xl bg-rose-50 p-3">
                        <p className="text-small text-foreground">
                          Apagar &ldquo;{divida.nome}&rdquo;? Os pagamentos já anotados continuam no seu
                          extrato normalmente, só o cadastro da dívida some.
                        </p>
                        <div className="flex gap-2">
                          <Button variant="tertiary" className="flex-1" onClick={() => setRemovendoId(null)}>
                            Cancelar
                          </Button>
                          <Button
                            className="flex-1 bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
                            onClick={() => handleRemover(divida.id)}
                          >
                            Sim, apagar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => handleAlternarQuitada(divida)}>
                          <Trophy size={16} />
                          Marcar como quitada
                        </Button>
                        <Button
                          variant="tertiary"
                          className="text-rose-600 hover:bg-rose-50"
                          onClick={() => setRemovendoId(divida.id)}
                        >
                          <Trash2 size={16} />
                          Apagar
                        </Button>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 rounded-xl bg-muted/5 p-3">
                      <div className="flex items-center gap-1.5 text-small font-medium text-foreground">
                        <Calculator size={14} className="text-rose-500" />
                        Simular: pagando quanto por mês?
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-[120px] flex-1">
                          <Input
                            placeholder="Ex: 150,00"
                            inputMode="decimal"
                            value={simulacaoEmEdicao[divida.id] ?? ""}
                            onChange={(e) =>
                              setSimulacaoEmEdicao((prev) => ({ ...prev, [divida.id]: e.target.value }))
                            }
                          />
                        </div>
                        {mesesSimulados != null && (
                          <span className="text-small text-muted">
                            {mesesSimulados === 0
                              ? "Você já quitou essa dívida!"
                              : mesesSimulados === 1
                                ? `Quita em 1 mês (${mesAnoExtenso(adicionarMeses(hojeIso(), 1))})`
                                : `Quita em ${mesesSimulados} meses (${mesAnoExtenso(adicionarMeses(hojeIso(), mesesSimulados))})`}
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {dividasQuitadas.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-h3 text-foreground">Quitadas</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {dividasQuitadas.map((divida) => (
                  <Card key={divida.id} className="flex flex-wrap items-center justify-between gap-3 opacity-70">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                        <Trophy size={20} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-body font-medium text-foreground">{divida.nome}</p>
                        <p className="text-small text-muted">{formatarMoeda(divida.valor_total)} quitados</p>
                      </div>
                    </div>
                    <Button variant="tertiary" onClick={() => handleAlternarQuitada(divida)}>
                      <RotateCcw size={16} />
                      Reabrir
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Container>
  );
}
