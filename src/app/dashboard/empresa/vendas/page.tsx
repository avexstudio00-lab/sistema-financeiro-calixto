"use client";

import * as React from "react";
import { Plus, ShoppingCart, Trash2, AlertTriangle, Trophy, PlusCircle, X } from "lucide-react";
import { FormularioProduto } from "@/components/dashboard/catalogo/FormularioProduto";
import { FormularioServico } from "@/components/dashboard/catalogo/FormularioServico";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarProdutos } from "@/lib/data/produtos";
import { listarServicos, rotuloPrecoServico } from "@/lib/data/servicos";
import { useEmpresa } from "@/lib/empresa/EmpresaProvider";
import { Badge } from "@/components/ui/Badge";

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
  rankingABC,
  type PontoVendasPeriodo,
  type PagamentoVenda,
} from "@/lib/data/vendas";
import { formatarMoeda } from "@/lib/format";
import type { Produto, Cliente, Conta, Venda, Servico } from "@/lib/data/tipos";

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
  const { negocio } = useAuth();
  const { ramo } = useEmpresa();
  const hoje = new Date();

  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [servicos, setServicos] = React.useState<Servico[]>([]);
  const [tipoItem, setTipoItem] = React.useState<"produto" | "servico">(ramo === "servicos" ? "servico" : "produto");
  const [servicoId, setServicoId] = React.useState("");
  const [fiado, setFiado] = React.useState(false);
  const [parcelasFiado, setParcelasFiado] = React.useState("1");
  const [vencimentoFiado, setVencimentoFiado] = React.useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
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
  // Itens 6.1/12.1: cadastrar produto/serviço sem sair da venda.
  const [cadastroInline, setCadastroInline] = React.useState<"produto" | "servico" | null>(null);
  // Checklist: várias formas de pagamento na mesma venda.
  const [dividirPagamento, setDividirPagamento] = React.useState(false);
  const [partes, setPartes] = React.useState<{ forma: (typeof FORMAS_PAGAMENTO)[number]["id"]; valor: string; contaId: string }[]>([]);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    // Recarregar depois de salvar NÃO mostra o spinner (só a 1ª carga):
    // trocar a lista pelo spinner jogava a tela pro topo e fechava o que
    // estava aberto (pedido do usuário em 05/out/2026).
    const { inicio, fim } = limitesDosUltimosMeses(6);
    const [listaProdutos, listaClientes, listaContas, listaVendas, listaServicos] = await Promise.all([
      listarProdutos(negocio.usuarioId),
      listarClientes(negocio.usuarioId),
      listarContas(negocio.usuarioId),
      listarVendas(negocio.usuarioId, { inicio, fim }),
      listarServicos(negocio.usuarioId),
    ]);
    setProdutos(listaProdutos);
    setServicos(listaServicos);
    setClientes(listaClientes);
    setContas(listaContas);
    setVendas(listaVendas);
    if (!contaId && listaContas[0]) setContaId(listaContas[0].id);
    setCarregando(false);
  }, [negocio, contaId]);

  React.useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocio]);

  const produtoSelecionado = tipoItem === "produto" ? produtos.find((p) => p.id === produtoId) ?? null : null;
  const servicoSelecionado = tipoItem === "servico" ? servicos.find((sv) => sv.id === servicoId) ?? null : null;
  const temItens = produtos.length > 0 || servicos.length > 0;

  function handleSelecionarServico(id: string) {
    setServicoId(id);
    const sv = servicos.find((x) => x.id === id);
    setValorUnitario(sv && sv.preco_fixo && sv.preco != null ? String(sv.preco).replace(".", ",") : "");
  }

  function handleSelecionarProduto(id: string) {
    setProdutoId(id);
    const produto = produtos.find((p) => p.id === id);
    if (produto) setValorUnitario(String(produto.preco_venda).replace(".", ","));
  }

  async function handleRegistrarVenda(e: React.FormEvent) {
    e.preventDefault();
    if (!negocio || (!produtoSelecionado && !servicoSelecionado)) return;
    if (fiado && !clienteId) {
      setErro("Venda fiada precisa de um cliente identificado.");
      return;
    }
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
    let pagamentos: PagamentoVenda[] | null = null;
    if (dividirPagamento && !fiado) {
      const lista = partes
        .map((p) => ({ forma: p.forma, valor: Number(p.valor.replace(/\./g, "").replace(",", ".")), contaId: p.contaId || null }))
        .filter((p) => p.valor > 0);
      if (lista.length < 2) {
        setErro("Para dividir, informe pelo menos duas formas de pagamento com valor.");
        return;
      }
      const soma = lista.reduce((a, p) => a + p.valor, 0);
      const total = Number((qtd * valorUnit).toFixed(2));
      if (Math.abs(soma - total) > 0.009) {
        setErro(`A soma das formas (${formatarMoeda(soma)}) precisa ser igual ao total da venda (${formatarMoeda(total)}).`);
        return;
      }
      pagamentos = lista;
    }
    setErro(null);
    setAviso(null);
    setSalvando(true);
    const resultado = await registrarVenda({
      pagamentos,
      usuarioId: negocio.usuarioId,
      produto: produtoSelecionado,
      servico: servicoSelecionado,
      fiado: fiado ? { parcelas: Math.max(1, Number(parcelasFiado) || 1), primeiroVencimento: vencimentoFiado } : null,
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
    if (resultado.estoqueInsuficiente && produtoSelecionado) {
      setAviso(
        `Atenção: você vendeu mais unidades de "${produtoSelecionado.nome}" do que tinha em estoque. O estoque desse produto ficou zerado.`
      );
    } else if (fiado) {
      setAviso("Venda fiada registrada: as parcelas estão em Contas → A receber (o valor entra no caixa quando você marcar como recebido).");
    }
    setProdutoId("");
    setServicoId("");
    setFiado(false);
    setDividirPagamento(false);
    setPartes([]);
    setParcelasFiado("1");
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
  // Ranking ABC de margem real (7.2) — últimos 6 meses carregados.
  const ranking = React.useMemo(() => rankingABC(vendas), [vendas]);

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
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Vendas</h1>
          <p className="text-body text-muted">Registre suas vendas e acompanhe como o negócio está indo.</p>
        </div>
        <Button onClick={() => setFormAberto((v) => !v)}>
          <Plus size={18} />
          Registrar venda
        </Button>
      </div>

      {!temItens && !carregando && (
        <Card className="flex items-center gap-3 border-amber-200 bg-amber-50/60">
          <AlertTriangle size={20} className="text-amber-600" />
          <p className="text-body text-foreground">
            Você ainda não tem produtos nem serviços. Pode cadastrar direto na hora de registrar a venda (botão &quot;Registrar venda&quot;).
          </p>
        </Card>
      )}

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-h3 text-foreground">Nova venda</h2>
          {cadastroInline === "produto" && negocio && (
            <FormularioProduto
              compacto
              contaMestreId={negocio.usuarioId}
              onCancelar={() => setCadastroInline(null)}
              onSalvo={(novo) => {
                setProdutos((lista) => [...lista, novo].sort((a, b) => a.nome.localeCompare(b.nome)));
                setTipoItem("produto");
                setProdutoId(novo.id);
                setValorUnitario(String(novo.preco_venda).replace(".", ","));
                setCadastroInline(null);
              }}
            />
          )}
          {cadastroInline === "servico" && negocio && (
            <FormularioServico
              compacto
              contaMestreId={negocio.usuarioId}
              onCancelar={() => setCadastroInline(null)}
              onSalvo={(novo) => {
                setServicos((lista) => [...lista, novo].sort((a, b) => a.nome.localeCompare(b.nome)));
                setTipoItem("servico");
                setServicoId(novo.id);
                setValorUnitario(novo.preco_fixo && novo.preco != null ? String(novo.preco).replace(".", ",") : "");
                setCadastroInline(null);
              }}
            />
          )}
          <form onSubmit={handleRegistrarVenda} className="flex flex-col gap-4">
            {produtos.length > 0 && servicos.length > 0 && (
              <div className="flex gap-1 self-start rounded-full bg-muted/10 p-1">
                {(["produto", "servico"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTipoItem(t);
                      setValorUnitario("");
                    }}
                    className={`rounded-full px-4 py-1.5 text-small font-medium ${
                      tipoItem === t ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {t === "produto" ? "Produto" : "Serviço"}
                  </button>
                ))}
              </div>
            )}
            {(tipoItem === "produto" && produtos.length > 0) || servicos.length === 0 ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Produto</span>
                <select
                  value={produtoId}
                  onChange={(e) => {
                    setTipoItem("produto");
                    handleSelecionarProduto(e.target.value);
                  }}
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
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Serviço</span>
                <select
                  value={servicoId}
                  onChange={(e) => {
                    setTipoItem("servico");
                    handleSelecionarServico(e.target.value);
                  }}
                  className="h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
                >
                  <option value="">Selecione um serviço</option>
                  {servicos.map((sv) => (
                    <option key={sv.id} value={sv.id}>
                      {sv.nome} · {rotuloPrecoServico(sv)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!produtoSelecionado && !servicoSelecionado && !cadastroInline && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCadastroInline("produto")}
                  className="flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-100 dark:text-primary-200"
                >
                  <PlusCircle size={14} /> Cadastrar novo produto
                </button>
                <button
                  type="button"
                  onClick={() => setCadastroInline("servico")}
                  className="flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-100 dark:text-primary-200"
                >
                  <PlusCircle size={14} /> Cadastrar novo serviço
                </button>
              </div>
            )}

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
              <DateMaskInput label="Data" value={data} onChange={(v) => setData(v)} />
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

            <label className="flex items-center gap-2 text-small text-foreground">
              <input type="checkbox" checked={fiado} onChange={(e) => setFiado(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
              Venda fiada (o cliente paga depois, em parcelas)
            </label>
            {fiado && (
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-border p-3">
                <Input
                  label="Parcelas"
                  inputMode="numeric"
                  value={parcelasFiado}
                  onChange={(e) => setParcelasFiado(e.target.value.replace(/\D/g, ""))}
                />
                <DateMaskInput label="1º vencimento" value={vencimentoFiado} onChange={setVencimentoFiado} />
                <p className="col-span-2 text-xs text-muted">
                  Vira conta a receber no nome do cliente, com alerta quando estiver perto de vencer ou vencida.
                </p>
              </div>
            )}

            {!fiado && (
              <label className="flex items-center gap-2 text-small text-foreground">
                <input
                  type="checkbox"
                  checked={dividirPagamento}
                  onChange={(e) => {
                    setDividirPagamento(e.target.checked);
                    if (e.target.checked && partes.length === 0) {
                      const primeira = contas.find((c) => c.tipo !== "cartao_credito")?.id ?? "";
                      setPartes([
                        { forma: formaPagamento, valor: "", contaId: contaId || primeira },
                        { forma: "dinheiro", valor: "", contaId: contaId || primeira },
                      ]);
                    }
                  }}
                  className="h-4 w-4 accent-emerald-600"
                />
                Dividir em mais de uma forma de pagamento
              </label>
            )}
            {!fiado && !dividirPagamento && contas.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Entrou em qual carteira?</span>
                <select
                  value={contaId}
                  onChange={(e) => setContaId(e.target.value)}
                  className="h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
                >
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
            )}
            {!fiado && dividirPagamento && (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                {partes.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                      Forma
                      <select
                        value={p.forma}
                        onChange={(e) => setPartes((l) => l.map((x, j) => (j === i ? { ...x, forma: e.target.value as typeof p.forma } : x)))}
                        className="h-10 rounded-xl border border-border bg-card px-2 text-small text-foreground"
                      >
                        {FORMAS_PAGAMENTO.map((f) => (
                          <option key={f.id} value={f.id}>{f.label}</option>
                        ))}
                      </select>
                    </label>
                    <Input label="Valor" inputMode="decimal" value={p.valor} onChange={(e) => setPartes((l) => l.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} placeholder="0,00" />
                    <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-foreground sm:col-span-1">
                      Carteira
                      <select
                        value={p.contaId}
                        onChange={(e) => setPartes((l) => l.map((x, j) => (j === i ? { ...x, contaId: e.target.value } : x)))}
                        className="h-10 rounded-xl border border-border bg-card px-2 text-small text-foreground"
                      >
                        {contas.map((c) => (
                          <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      aria-label="Remover forma"
                      disabled={partes.length <= 2}
                      onClick={() => setPartes((l) => l.filter((_, j) => j !== i))}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPartes((l) => [...l, { forma: "pix", valor: "", contaId: contaId }])}
                  className="flex items-center gap-1.5 self-start text-xs font-semibold text-primary-700 hover:underline"
                >
                  <PlusCircle size={14} /> Adicionar forma
                </button>
                {(() => {
                  const soma = partes.reduce((a, x) => a + (Number(x.valor.replace(/\./g, "").replace(",", ".")) || 0), 0);
                  const total = Number(quantidade.replace(",", ".") || 0) * Number(valorUnitario.replace(",", ".") || 0);
                  const falta = Number((total - soma).toFixed(2));
                  return (
                    <p className={`text-xs ${Math.abs(falta) < 0.01 ? "text-primary-700" : "text-amber-800"}`}>
                      Soma: {formatarMoeda(soma)} de {formatarMoeda(total)}
                      {Math.abs(falta) >= 0.01 ? ` — ${falta > 0 ? "falta" : "sobra"} ${formatarMoeda(Math.abs(falta))}` : " — confere"}
                    </p>
                  );
                })()}
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
              <Button type="submit" disabled={salvando || (!produtoSelecionado && !servicoSelecionado)} className="flex-1">
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

          {ranking.length > 0 && (
            <Card padding="lg" className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Trophy size={20} className="text-accent-700" />
                <h2 className="text-h3 text-foreground">Ranking de lucratividade (curva ABC)</h2>
              </div>
              <p className="text-small text-muted">
                Últimos 6 meses. Classe A = itens que somam 80% do lucro; C = muito movimento e pouco retorno.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-small">
                  <thead>
                    <tr className="border-b border-border text-left text-muted">
                      <th className="py-2 pr-2 font-medium">Item</th>
                      <th className="py-2 pr-2 text-right font-medium">Qtd</th>
                      <th className="py-2 pr-2 text-right font-medium">Faturado</th>
                      <th className="py-2 pr-2 text-right font-medium">Lucro</th>
                      <th className="py-2 pr-2 text-right font-medium">Margem</th>
                      <th className="py-2 text-right font-medium">Classe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.slice(0, 15).map((item) => (
                      <tr key={item.nome} className="border-b border-border/60 text-foreground">
                        <td className="py-2 pr-2">{item.nome}</td>
                        <td className="py-2 pr-2 text-right">{item.quantidade}</td>
                        <td className="py-2 pr-2 text-right">{formatarMoeda(item.faturamento)}</td>
                        <td className="py-2 pr-2 text-right font-semibold">{formatarMoeda(item.lucro)}</td>
                        <td className="py-2 pr-2 text-right">{item.margem.toFixed(0)}%</td>
                        <td className="py-2 text-right">
                          <Badge variant={item.classe === "A" ? "primary" : item.classe === "B" ? "warning" : "neutral"} size="sm">
                            {item.classe}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

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
                  <Card key={v.id} padding="sm" className="flex flex-wrap items-center justify-between gap-4">
                    {/* `min-w-0` aqui (mesma causa raiz da seção 23 do
                        contexto do projeto) deixa o nome do produto/cliente
                        quebrar linha dentro do próprio espaço, em vez de
                        forçar a linha mais larga que a tela. */}
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
                        <ShoppingCart size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-body font-medium text-foreground">
                          {v.produto_nome} · {v.quantidade}x
                        </p>
                        <p className="text-small text-muted">
                          {new Date(v.data + "T00:00:00").toLocaleDateString("pt-BR")}
                          {v.clientes?.nome ? ` · ${v.clientes.nome}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
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
