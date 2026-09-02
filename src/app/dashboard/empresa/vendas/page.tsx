"use client";

import * as React from "react";
import { Plus, ShoppingCart, Trash2, AlertTriangle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarProdutos } from "@/lib/data/produtos";
import { listarClientes } from "@/lib/data/clientes";
import { listarContas } from "@/lib/data/contas";
import {
  listarVendas,
  registrarVenda,
  deletarVenda,
  resumirVendas,
  agruparVendasPorDia,
  agruparVendasPorSemana,
  agruparVendasPorMes,
  type PontoVendasPeriodo,
} from "@/lib/data/vendas";
import { formatarMoeda } from "@/lib/format";
import type { Produto, Cliente, Conta, Venda } from "@/lib/data/tipos";

const FORMAS_PAGAMENTO = [
  { id: "pix", label: "Pix" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "boleto", label: "Boleto" },
] as const;

function limitesDosUltimosMeses(meses: number) {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - (meses - 1), 1).toISOString().slice(0, 10);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { inicio, fim };
}

export default function VendasPage() {
  const { user } = useAuth();
  const hoje = new Date();

  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [clientes, setClientes] = React.useState<Cliente[]>([]);
  const [contas, setContas] = React.useState<Conta[]>([]);
  const [vendas, setVendas] = React.useState<Venda[]>([]);
  const [carregando, setCarregando] = React.useState(true);

  const [formAberto, setFormAberto] = React.useState(false);
  const [produtoId, setProdutoId] = React.useState("");
  const [quantidade, setQuantidade] = React.useState("1");
  const [valorUnitario, setValorUnitario] = React.useState("");
  const [formaPagamento, setFormaPagamento] = React.useState<(typeof FORMAS_PAGAMENTO)[number]["id"]>("pix");
  const [clienteId, setClienteId] = React.useState("");
  const [data, setData] = React.useState(() => hoje.toISOString().slice(0, 10));
  const [contaId, setContaId] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = React.useState<string | null>(null);

  const [periodo, setPeriodo] = React.useState<"dia" | "semana" | "mes">("dia");

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    const { inicio, fim } = limitesDosUltimosMeses(6);
    const [listaProdutos, listaClientes, listaContas, listaVendas] = await Promise.all([
      listarProdutos(user.id),
      listarClientes(user.id),
      listarContas(user.id),
      listarVendas(user.id, { inicio, fim }),
    ]);
    setProdutos(listaProdutos);
    setClientes(listaClientes);
    setContas(listaContas);
    setVendas(listaVendas);
    if (!contaId && listaContas[0]) setContaId(listaContas[0].id);
    setCarregando(false);
  }, [user, contaId]);

  React.useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const produtoSelecionado = produtos.find((p) => p.id === produtoId) ?? null;

  function handleSelecionarProduto(id: string) {
    setProdutoId(id);
    const produto = produtos.find((p) => p.id === id);
    if (produto) setValorUnitario(String(produto.preco_venda).replace(".", ","));
  }

  async function handleRegistrarVenda(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !produtoSelecionado) return;
    const qtd = Number(quantidade.replace(",", "."));
    const valorUnit = Number(valorUnitario.replace(",", "."));
    if (!qtd || qtd <= 0) {
      setErro("Digite uma quantidade válida.");
      return;
    }
    if (!valorUnit || valorUnit < 0) {
      setErro("Digite um valor de venda válido.");
      return;
    }
    setErro(null);
    setAviso(null);
    setSalvando(true);
    const resultado = await registrarVenda({
      usuarioId: user.id,
      produto: produtoSelecionado,
      quantidade: qtd,
      valorUnitario: valorUnit,
      formaPagamento,
      data,
      clienteId: clienteId || null,
      contaId: contaId || null,
    });
    setSalvando(false);

    if (resultado.error) {
      setErro("Não foi possível registrar a venda. Tente novamente.");
      return;
    }
    if (resultado.estoqueInsuficiente) {
      setAviso(
        `Atenção: você vendeu mais unidades de "${produtoSelecionado.nome}" do que tinha em estoque. O estoque desse produto ficou zerado.`
      );
    }
    setProdutoId("");
    setQuantidade("1");
    setValorUnitario("");
    setClienteId("");
    setFormAberto(false);
    carregar();
  }

  async function handleExcluir(venda: Venda) {
    setSalvando(true);
    setErro(null);
    const { error } = await deletarVenda(venda);
    setSalvando(false);
    setConfirmandoExclusaoId(null);
    if (error) {
      setErro("Não foi possível apagar essa venda. Tente novamente.");
      return;
    }
    carregar();
  }

  const vendasDoMes = React.useMemo(
    () =>
      vendas.filter((v) => {
        const dt = new Date(v.data + "T00:00:00");
        return dt.getFullYear() === hoje.getFullYear() && dt.getMonth() + 1 === hoje.getMonth() + 1;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendas]
  );

  const resumo = React.useMemo(() => resumirVendas(vendasDoMes), [vendasDoMes]);

  const pontosGrafico: PontoVendasPeriodo[] = React.useMemo(() => {
    if (periodo === "mes") return agruparVendasPorMes(vendas, 6);
    if (periodo === "semana") return agruparVendasPorSemana(vendas, hoje.getFullYear(), hoje.getMonth() + 1);
    return agruparVendasPorDia(vendas, hoje.getFullYear(), hoje.getMonth() + 1)
      .filter((p) => p.valor > 0)
      .map((p) => ({ rotulo: `Dia ${p.dia}`, valor: p.valor }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, vendas]);

  const maiorValorGrafico = Math.max(1, ...pontosGrafico.map((p) => p.valor));

  return (
    <Container className="flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 text-foreground">Vendas</h1>
          <p className="text-body text-muted">Registre suas vendas e acompanhe como o negócio está indo.</p>
        </div>
        <Button onClick={() => setFormAberto((v) => !v)} disabled={produtos.length === 0}>
          <Plus size={18} />
          Registrar venda
        </Button>
      </div>

      {produtos.length === 0 && !carregando && (
        <Card className="flex items-center gap-3 border-amber-200 bg-amber-50/60">
          <AlertTriangle size={20} className="text-amber-600" />
          <p className="text-body text-foreground">
            Cadastre um produto no Estoque antes de registrar sua primeira venda.
          </p>
        </Card>
      )}

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-h3 text-foreground">Nova venda</h2>
          <form onSubmit={handleRegistrarVenda} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-foreground">Produto</span>
              <select
                value={produtoId}
                onChange={(e) => handleSelecionarProduto(e.target.value)}
                className="h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
              >
                <option value="">Selecione um produto</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} · {formatarMoeda(Number(p.preco_venda))} · {p.quantidade_estoque} em estoque
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Quantidade"
                inputMode="decimal"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
              <Input
                label="Valor de venda (unidade)"
                inputMode="decimal"
                value={valorUnitario}
                onChange={(e) => setValorUnitario(e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
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

            {clientes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Cliente (opcional)</span>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
                >
                  <option value="">Sem cliente identificado</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {quantidade && valorUnitario && (
              <p className="text-small text-muted">
                Total da venda:{" "}
                <strong className="text-foreground">
                  {formatarMoeda(
                    Number(quantidade.replace(",", ".") || 0) * Number(valorUnitario.replace(",", ".") || 0)
                  )}
                </strong>
              </p>
            )}

            {erro && <p className="text-small text-rose-600">{erro}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={salvando || !produtoId} className="flex-1">
                {salvando ? "Salvando..." : "Registrar venda"}
              </Button>
              <Button type="button" variant="tertiary" onClick={() => setFormAberto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {aviso && (
        <Card className="flex items-center gap-3 border-amber-200 bg-amber-50/60">
          <AlertTriangle size={18} className="shrink-0 text-amber-600" />
          <p className="text-small text-foreground">{aviso}</p>
        </Card>
      )}

      {erro && !formAberto && (
        <Card className="flex items-center gap-3 border-rose-200 bg-rose-50/60">
          <AlertTriangle size={18} className="shrink-0 text-red-500" />
          <p className="text-small text-foreground">{erro}</p>
        </Card>
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Vendido no mês</p>
              <p className="text-h2 text-accent-600">{formatarMoeda(resumo.totalVendido)}</p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Ticket médio</p>
              <p className="text-h2 text-foreground">{formatarMoeda(resumo.ticketMedio)}</p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Lucro real</p>
              <p className={`text-h2 ${resumo.lucroReal >= 0 ? "text-primary-500" : "text-red-500"}`}>
                {formatarMoeda(resumo.lucroReal)}
              </p>
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Vendas no mês</p>
              <p className="text-h2 text-secondary">{resumo.quantidadeVendas}</p>
            </Card>
          </div>

          <Card padding="lg" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-h3 text-foreground">Vendas por período</h2>
              <div className="flex gap-1 rounded-full bg-muted/10 p-1">
                {(["dia", "semana", "mes"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriodo(p)}
                    className={`rounded-full px-3 py-1.5 text-small font-medium transition-colors ${
                      periodo === p ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {p === "dia" ? "Por dia" : p === "semana" ? "Por semana" : "Por mês"}
                  </button>
                ))}
              </div>
            </div>
            {pontosGrafico.length === 0 ? (
              <p className="py-4 text-center text-small text-muted">Sem vendas nesse período ainda.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {pontosGrafico.map((p) => (
                  <div key={p.rotulo} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-small">
                      <span className="text-foreground">{p.rotulo}</span>
                      <span className="font-medium text-muted">{formatarMoeda(p.valor)}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted/15">
                      <div
                        className="h-2 rounded-full bg-accent-500"
                        style={{ width: `${(p.valor / maiorValorGrafico) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="flex flex-col gap-4">
            <h2 className="text-h3 text-foreground">Últimas vendas</h2>
            {vendas.length === 0 ? (
              <Card className="flex flex-col items-center gap-3 py-12 text-center">
                <ShoppingCart size={28} className="text-accent-400" />
                <p className="text-body text-muted">Nenhuma venda registrada ainda.</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {vendas.slice(0, 15).map((v) => (
                  <Card key={v.id} padding="sm" className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
                        <ShoppingCart size={18} />
                      </span>
                      <div>
                        <p className="text-body font-medium text-foreground">
                          {v.produto_nome} · {v.quantidade}x
                        </p>
                        <p className="text-small text-muted">
                          {new Date(v.data + "T00:00:00").toLocaleDateString("pt-BR")}
                          {v.clientes?.nome ? ` · ${v.clientes.nome}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-body font-semibold text-accent-600">{formatarMoeda(Number(v.valor_total))}</p>
                      {confirmandoExclusaoId === v.id ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="tertiary" onClick={() => setConfirmandoExclusaoId(null)}>
                            Não
                          </Button>
                          <Button
                            size="sm"
                            disabled={salvando}
                            onClick={() => handleExcluir(v)}
                            className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
                          >
                            Apagar
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label="Apagar venda"
                          onClick={() => setConfirmandoExclusaoId(v.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Container>
  );
}
