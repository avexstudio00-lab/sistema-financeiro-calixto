"use client";

import * as React from "react";
import { Plus, ShoppingCart, Trash2, AlertTriangle, Trophy, PlusCircle, X, Receipt, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { ComprovanteVenda } from "@/components/dashboard/vendas/ComprovanteVenda";
import Link from "next/link";
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
import { SeletorParceiro } from "@/components/dashboard/SeletorParceiro";
import { buscarAgendamento, dataLocalIso, marcarAgendamentoVendido } from "@/lib/data/agenda";
import { listarContas, carteirasDoAmbiente } from "@/lib/data/contas";
import {
  listarVendas,
  registrarVenda,
  deletarVenda,
  resumirVendas,
  totalDosItens,
  agruparLinhasDeVenda,
  type VendaAgrupada,
  type ItemVenda,
  type CondicoesFiadoVenda,
  agruparVendasPorDia,
  agruparVendasPorSemana,
  agruparVendasPorMes,
  rankingABC,
  type PontoVendasPeriodo,
  type PagamentoVenda,
} from "@/lib/data/vendas";
import { formatarMoeda } from "@/lib/format";
import { lerPadraoFiado, somarDias, somarMeses, validarCondicoesFiado } from "@/lib/util/fiado";
import { CondicoesFiado, lerValorDigitado, type EstadoFiado } from "@/components/dashboard/vendas/CondicoesFiado";
import type { Produto, Cliente, Conta, Venda, Servico } from "@/lib/data/tipos";
import { buscarTaxasMaquininha, calcularTaxa, type TaxasMaquininha } from "@/lib/data/maquininha";

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

type ItemCarrinho = {
  chave: string;
  tipo: "produto" | "servico";
  refId: string;
  nome: string;
  quantidade: string;
  valorUnitario: string;
};

function hojeMaisUmMes(base: string) {
  return somarMeses(base, 1);
}

export default function VendasPage() {
  const { negocio, papel, perfil } = useAuth();
  const { ramo, empresaAtiva, empresas } = useEmpresa();
  // Comprovante da venda (10/nov/2026).
  const [comprovante, setComprovante] = React.useState<VendaAgrupada | null>(null);
  const [ultimaVenda, setUltimaVenda] = React.useState<VendaAgrupada | null>(null);
  const hoje = new Date();

  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [servicos, setServicos] = React.useState<Servico[]>([]);
  const [tipoItem, setTipoItem] = React.useState<"produto" | "servico">(ramo === "servicos" ? "servico" : "produto");
  const [servicoId, setServicoId] = React.useState("");
  const [clientes, setClientes] = React.useState<Cliente[]>([]);
  const [contas, setContas] = React.useState<Conta[]>([]);
  const [vendas, setVendas] = React.useState<Venda[]>([]);
  const [carregando, setCarregando] = React.useState(true);

  const [formAberto, setFormAberto] = React.useState(false);
  // Venda que veio da Agenda: ao registrar, o horário vira "Atendido".
  const [agendamentoOrigem, setAgendamentoOrigem] = React.useState<string | null>(null);
  const nomeLogado = perfil?.nome?.trim() ?? "";
  // "+" → "Registrar uma venda" (10/nov/2026): chega com ?nova=1 e já abre o formulário.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    // Agenda → "Virar venda" (13/nov/2026): ?agendamento=<id>.
    const agendamentoDaUrl = params.get("agendamento");
    if (agendamentoDaUrl) {
      setAgendamentoOrigem(agendamentoDaUrl);
      void buscarAgendamento(agendamentoDaUrl).then((ag) => {
        if (!ag) return;
        if (ag.cliente_id) setClienteId(ag.cliente_id);
        setData(dataLocalIso(ag.inicio) > new Date().toISOString().slice(0, 10) ? new Date().toISOString().slice(0, 10) : dataLocalIso(ag.inicio));
        if (ag.servico_id) {
          setCarrinho([
            {
              chave: `ag-${ag.id}`,
              tipo: "servico",
              refId: ag.servico_id,
              nome: ag.servicos?.nome ?? ag.descricao,
              quantidade: "1",
              valorUnitario: ag.valor != null ? String(ag.valor).replace(".", ",") : "",
            },
          ]);
        }
      });
    }
    // Ficha do cliente → "Nova venda" (13/nov/2026): chega com ?cliente=<id>.
    const clienteDaUrl = params.get("cliente");
    if (params.get("nova") === "1" || clienteDaUrl || agendamentoDaUrl) {
      if (clienteDaUrl) setClienteId(clienteDaUrl);
      setFormAberto(true);
      window.history.replaceState(null, "", window.location.pathname);
      window.scrollTo({ top: 0 });
    }
    const abrir = () => {
      setFormAberto(true);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("meucontrole:nova-venda", abrir);
    return () => window.removeEventListener("meucontrole:nova-venda", abrir);
  }, []);
  const [produtoId, setProdutoId] = React.useState("");
  const [quantidade, setQuantidade] = React.useState("1");
  const [valorUnitario, setValorUnitario] = React.useState("");
  // Seção 15.1 (15/out/2026): carrinho — vários produtos e serviços na
  // mesma venda, cada um com quantidade e valor unitário próprios.
  const [carrinho, setCarrinho] = React.useState<ItemCarrinho[]>([]);
  const [formaPagamento, setFormaPagamento] = React.useState<(typeof FORMAS_PAGAMENTO)[number]["id"]>("pix");
  const [clienteId, setClienteId] = React.useState("");
  // Quem vendeu (13/nov/2026): começa com o nome de quem está logado.
  const [vendedor, setVendedor] = React.useState("");
  const [filtroVendedor, setFiltroVendedor] = React.useState<string | null>(null);
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
  // Taxa da maquininha (10/nov/2026): débito/crédito descontam a taxa.
  const [taxasMaquininha, setTaxasMaquininha] = React.useState<TaxasMaquininha | null>(null);
  const [parcelasCartao, setParcelasCartao] = React.useState(1);
  React.useEffect(() => {
    if (negocio && papel !== "funcionario") buscarTaxasMaquininha(negocio.usuarioId).then(setTaxasMaquininha);
  }, [negocio, papel]);
  const [partes, setPartes] = React.useState<{ forma: (typeof FORMAS_PAGAMENTO)[number]["id"]; valor: string; contaId: string }[]>([]);
  // Seção 15.2: fiado com termos em aberto, definidos a cada venda.
  const [fiado, setFiado] = React.useState(false);
  const [estadoFiado, setEstadoFiado] = React.useState<EstadoFiado>(() => estadoFiadoInicial(hoje.toISOString().slice(0, 10), ""));

  function estadoFiadoInicial(dataVenda: string, carteira: string): EstadoFiado {
    return {
      temEntrada: false,
      entradaValor: "",
      entradaForma: "pix",
      entradaContaId: carteira,
      numeroParcelas: "1",
      periodicidade: "mensal",
      primeiroVencimento: hojeMaisUmMes(dataVenda),
      parcelas: [],
      parcelasEditadas: false,
      salvarComoPadrao: true,
    };
  }

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
    setContas(carteirasDoAmbiente(listaContas, "empresa"));
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
  const clienteSelecionado = clientes.find((c) => c.id === clienteId) ?? null;
  const padraoCliente = React.useMemo(() => lerPadraoFiado(clienteSelecionado?.padrao_fiado), [clienteSelecionado]);

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

  /** Item escolhido no seletor (ainda fora do carrinho), se estiver válido. */
  function itemDoSeletor(): ItemCarrinho | null {
    const escolhido = produtoSelecionado ?? servicoSelecionado;
    if (!escolhido) return null;
    return {
      chave: `${produtoSelecionado ? "p" : "s"}:${escolhido.id}:${Date.now()}`,
      tipo: produtoSelecionado ? "produto" : "servico",
      refId: escolhido.id,
      nome: escolhido.nome,
      quantidade: quantidade || "1",
      valorUnitario,
    };
  }

  function limparSeletor() {
    setProdutoId("");
    setServicoId("");
    setQuantidade("1");
    setValorUnitario("");
  }

  function validarItem(item: ItemCarrinho): string | null {
    const qtd = Number(item.quantidade);
    const valor = lerValorDigitado(item.valorUnitario);
    if (!Number.isInteger(qtd) || qtd <= 0) return `"${item.nome}": a quantidade precisa ser um número inteiro maior que zero.`;
    if (!item.valorUnitario.trim() || !Number.isFinite(valor) || valor < 0) return `"${item.nome}": digite um valor de venda válido.`;
    return null;
  }

  function handleAdicionarAoCarrinho() {
    const item = itemDoSeletor();
    if (!item) return;
    const problema = validarItem(item);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    setCarrinho((lista) => [...lista, item]);
    limparSeletor();
  }

  // Venda rápida (10/nov/2026): os 6 itens mais vendidos nos últimos 6
  // meses viram botões — 1 toque coloca no carrinho com o preço de sempre.
  const maisVendidos = React.useMemo(() => {
    const contagem = new Map<string, { tipo: "produto" | "servico"; id: string; vezes: number }>();
    for (const v of vendas) {
      const id = v.produto_id ?? v.servico_id;
      if (!id) continue;
      const tipo = v.produto_id ? "produto" : "servico";
      const atual = contagem.get(`${tipo}:${id}`) ?? { tipo, id, vezes: 0 };
      atual.vezes += Number(v.quantidade) || 1;
      contagem.set(`${tipo}:${id}`, atual);
    }
    return Array.from(contagem.values())
      .sort((a, b) => b.vezes - a.vezes)
      .map((c): { tipo: "produto" | "servico"; id: string; nome: string; preco: number | null } | null => {
        if (c.tipo === "produto") {
          const p = produtos.find((x) => x.id === c.id);
          return p ? { tipo: "produto" as const, id: p.id, nome: p.nome, preco: Number(p.preco_venda) } : null;
        }
        const sv = servicos.find((x) => x.id === c.id);
        return sv ? { tipo: "servico" as const, id: sv.id, nome: sv.nome, preco: sv.preco_fixo && sv.preco != null ? Number(sv.preco) : null } : null;
      })
      .filter((x): x is { tipo: "produto" | "servico"; id: string; nome: string; preco: number | null } => !!x)
      .slice(0, 6);
  }, [vendas, produtos, servicos]);

  function adicionarRapido(item: { tipo: "produto" | "servico"; id: string; nome: string; preco: number | null }) {
    setErro(null);
    setCarrinho((lista) => {
      const existente = lista.find((i) => i.tipo === item.tipo && i.refId === item.id);
      if (existente) return lista.map((i) => (i === existente ? { ...i, quantidade: String((Number(i.quantidade) || 0) + 1) } : i));
      return [
        ...lista,
        {
          chave: `${item.tipo === "produto" ? "p" : "s"}:${item.id}:${Date.now()}`,
          tipo: item.tipo,
          refId: item.id,
          nome: item.nome,
          quantidade: "1",
          valorUnitario: item.preco != null ? String(item.preco).replace(".", ",") : "",
        },
      ];
    });
  }

  // O item que está no seletor e ainda não foi adicionado também entra na
  // venda (evita "esqueci de tocar em Adicionar").
  const itemPendente = itemDoSeletor();
  const itensDaVenda = itemPendente ? [...carrinho, itemPendente] : carrinho;
  const totalVenda = React.useMemo(
    () =>
      totalDosItens(
        itensDaVenda.map((i) => ({ quantidade: Number(i.quantidade) || 0, valorUnitario: lerValorDigitado(i.valorUnitario) || 0 }))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(itensDaVenda.map((i) => [i.quantidade, i.valorUnitario]))]
  );

  /** Liga/atualiza o fiado: usa o padrão do cliente (se houver) como ponto
   * de partida — tudo continua editável. */
  function aplicarPadraoFiado(ligar: boolean, padrao = padraoCliente) {
    const carteiraPadrao = contaId || contas.find((c) => c.tipo !== "cartao_credito")?.id || "";
    const base = estadoFiadoInicial(data, carteiraPadrao);
    if (padrao) {
      base.numeroParcelas = String(padrao.parcelas);
      base.periodicidade = padrao.periodicidade;
      base.primeiroVencimento = somarDias(data, padrao.dias_primeiro_vencimento);
      if (padrao.entrada_percentual > 0 && totalVenda > 0) {
        base.temEntrada = true;
        base.entradaValor = ((totalVenda * padrao.entrada_percentual) / 100).toFixed(2).replace(".", ",");
      }
      base.salvarComoPadrao = false;
    }
    setEstadoFiado(base);
    setFiado(ligar);
  }

  function montarFiado(): { condicoes: CondicoesFiadoVenda } | { erro: string } {
    const entradaValor = estadoFiado.temEntrada ? lerValorDigitado(estadoFiado.entradaValor) : 0;
    if (estadoFiado.temEntrada && !(entradaValor > 0)) return { erro: "Digite o valor da entrada (ou desmarque a entrada)." };
    const parcelas = estadoFiado.parcelas.map((p) => ({ vencimento: p.vencimento, valor: lerValorDigitado(p.valor) }));
    const problema = validarCondicoesFiado(totalVenda, entradaValor, parcelas, data);
    if (problema) return { erro: problema };
    return {
      condicoes: {
        entrada: entradaValor > 0 ? { valor: entradaValor, forma: estadoFiado.entradaForma, contaId: estadoFiado.entradaContaId || null } : null,
        parcelas,
        periodicidade: estadoFiado.periodicidade,
        salvarComoPadrao: estadoFiado.salvarComoPadrao,
      },
    };
  }

  async function handleRegistrarVenda(e: React.FormEvent) {
    e.preventDefault();
    if (!negocio) return;
    if (itensDaVenda.length === 0) {
      setErro("Adicione pelo menos um produto ou serviço.");
      return;
    }
    for (const item of itensDaVenda) {
      const problema = validarItem(item);
      if (problema) {
        setErro(problema);
        return;
      }
    }
    if (fiado && !clienteId) {
      setErro("Venda fiada precisa de um cliente identificado.");
      return;
    }
    let condicoesFiado: CondicoesFiadoVenda | null = null;
    if (fiado) {
      const r = montarFiado();
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      condicoesFiado = r.condicoes;
    }
    let pagamentos: PagamentoVenda[] | null = null;
    if (dividirPagamento && !fiado) {
      const lista = partes
        .map((p) => ({ forma: p.forma, valor: lerValorDigitado(p.valor), contaId: p.contaId || null }))
        .filter((p) => p.valor > 0);
      if (lista.length < 2) {
        setErro("Para dividir, informe pelo menos duas formas de pagamento com valor.");
        return;
      }
      const soma = lista.reduce((a, p) => a + p.valor, 0);
      if (Math.abs(soma - totalVenda) > 0.009) {
        setErro(`A soma das formas (${formatarMoeda(soma)}) precisa ser igual ao total da venda (${formatarMoeda(totalVenda)}).`);
        return;
      }
      pagamentos = lista;
    }

    const itens: ItemVenda[] = itensDaVenda.map((i) => ({
      produto: i.tipo === "produto" ? produtos.find((p) => p.id === i.refId) ?? null : null,
      servico: i.tipo === "servico" ? servicos.find((s) => s.id === i.refId) ?? null : null,
      quantidade: Number(i.quantidade),
      valorUnitario: lerValorDigitado(i.valorUnitario),
    }));
    if (itens.some((i) => !i.produto && !i.servico)) {
      setErro("Um dos itens não está mais no catálogo. Remova-o e adicione de novo.");
      return;
    }

    setErro(null);
    setAviso(null);
    setSalvando(true);
    const resultado = await registrarVenda({
      pagamentos,
      usuarioId: negocio.usuarioId,
      itens,
      fiado: condicoesFiado,
      formaPagamento,
      data,
      clienteId: clienteId || null,
      vendedorNome: (vendedor.trim() || nomeLogado) || null,
      contaId: contaId || null,
      maquininha:
        !fiado && !pagamentos && (formaPagamento === "debito" || formaPagamento === "credito") && taxasMaquininha
          ? (() => {
              const parcelas = formaPagamento === "credito" ? parcelasCartao : 1;
              const t = calcularTaxa(taxasMaquininha, formaPagamento, parcelas, totalVenda);
              return t.taxa > 0 ? { taxa: t.taxa, percentual: t.percentual, parcelas } : null;
            })()
          : null,
    });
    setSalvando(false);

    if (resultado.error) {
      setErro(resultado.error.message && !/fetch|network|JWT/i.test(resultado.error.message)
        ? resultado.error.message
        : "Não foi possível registrar a venda. Tente novamente.");
      return;
    }
    const avisos: string[] = [];
    if (resultado.estoqueInsuficiente && resultado.estoqueInsuficiente.length > 0) {
      avisos.push(
        `Atenção: você vendeu mais unidades do que tinha em estoque de ${resultado.estoqueInsuficiente.map((n) => `"${n}"`).join(", ")}. O estoque ficou zerado.`
      );
    }
    if (fiado) {
      avisos.push("Venda fiada registrada: as parcelas estão em Contas → A receber (cada uma entra no caixa quando você marcar como recebida).");
    }
    setAviso(avisos.length ? avisos.join(" ") : null);
    if (resultado.data && resultado.data.length) {
      const clienteVenda = clientes.find((c) => c.id === clienteId) ?? null;
      const linhas = resultado.data as Venda[];
      setUltimaVenda({
        chave: linhas[0].grupo_venda_id ?? linhas[0].id,
        linhas: linhas.map((l, k) => (k === 0 && formaPagamento === "credito" ? { ...l, parcelas_cartao: parcelasCartao } : l)),
        total: linhas.reduce((acc, l) => acc + Number(l.valor_total), 0),
        data: linhas[0].data,
        criado_em: linhas[0].criado_em,
        cliente: clienteVenda,
      });
    }
    if (agendamentoOrigem) {
      const linhas = (resultado.data ?? []) as Venda[];
      void marcarAgendamentoVendido(agendamentoOrigem, linhas[0]?.grupo_venda_id ?? null);
      setAgendamentoOrigem(null);
    }
    limparSeletor();
    setCarrinho([]);
    setFiado(false);
    setDividirPagamento(false);
    setPartes([]);
    setParcelasCartao(1);
    setClienteId("");
    setVendedor("");
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
      setErro(error.message?.startsWith("Esta venda") ? error.message : "Não foi possível apagar essa venda. Tente novamente.");
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
  // Seção 15.1: as linhas da mesma venda (carrinho) aparecem juntas.
  const vendasAgrupadasTodas = React.useMemo(() => agruparLinhasDeVenda(vendas), [vendas]);
  const vendasAgrupadas = React.useMemo(
    () => (filtroVendedor ? vendasAgrupadasTodas.filter((g) => (g.vendedor ?? "") === filtroVendedor) : vendasAgrupadasTodas),
    [vendasAgrupadasTodas, filtroVendedor]
  );
  // Nomes já usados (pra sugerir no campo) e total do mês por vendedor.
  const nomesVendedores = React.useMemo(() => {
    const set = new Set<string>();
    if (nomeLogado) set.add(nomeLogado);
    for (const v of vendas) if (v.vendedor_nome) set.add(v.vendedor_nome);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [vendas, nomeLogado]);
  const porVendedorMes = React.useMemo(() => {
    const mapa = new Map<string, { total: number; vendas: Set<string> }>();
    for (const v of vendasDoMes) {
      if (!v.vendedor_nome) continue;
      const g = mapa.get(v.vendedor_nome) ?? { total: 0, vendas: new Set<string>() };
      g.total += Number(v.valor_total);
      g.vendas.add(v.grupo_venda_id ?? v.id);
      mapa.set(v.vendedor_nome, g);
    }
    return Array.from(mapa.entries())
      .map(([nome, g]) => ({ nome, total: g.total, qtd: g.vendas.size }))
      .sort((a, b) => b.total - a.total);
  }, [vendasDoMes]);
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
          {maisVendidos.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-small font-medium text-foreground">Venda rápida — seus mais vendidos</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {maisVendidos.map((item) => {
                  const noCarrinho = carrinho.find((i) => i.tipo === item.tipo && i.refId === item.id);
                  return (
                    <button
                      key={`${item.tipo}:${item.id}`}
                      type="button"
                      onClick={() => adicionarRapido(item)}
                      className={`flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition-colors ${
                        noCarrinho ? "border-accent-500 bg-accent-50 dark:bg-accent-900/20" : "border-border hover:bg-muted/5"
                      }`}
                    >
                      <span className="line-clamp-1 text-small font-semibold text-foreground">{item.nome}</span>
                      <span className="text-xs text-muted">
                        {item.preco != null ? formatarMoeda(item.preco) : "valor na hora"}
                        {noCarrinho ? ` · ${noCarrinho.quantidade}x no carrinho` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
            {/* Seção 15.1: carrinho de itens da venda. */}
            {carrinho.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <p className="text-small font-semibold text-foreground">
                  Itens da venda ({carrinho.length})
                </p>
                {carrinho.map((item, i) => {
                  const subtotal = (Number(item.quantidade) || 0) * (lerValorDigitado(item.valorUnitario) || 0);
                  return (
                    <div key={item.chave} className="flex flex-col gap-2 border-b border-border/60 pb-2 last:border-b-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 break-words text-small font-medium text-foreground">
                          {item.nome}
                          <span className="ml-1 text-xs font-normal text-muted">{item.tipo === "produto" ? "· produto" : "· serviço"}</span>
                        </p>
                        <button
                          type="button"
                          aria-label={`Remover ${item.nome}`}
                          onClick={() => setCarrinho((l) => l.filter((_, j) => j !== i))}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-700"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-[1fr_1.4fr] items-end gap-2 min-[420px]:grid-cols-[1fr_1.4fr_auto]">
                        <Input
                          aria-label={`Quantidade de ${item.nome}`}
                          label="Qtd"
                          inputMode="numeric"
                          value={item.quantidade}
                          onChange={(e) =>
                            setCarrinho((l) => l.map((x, j) => (j === i ? { ...x, quantidade: e.target.value.replace(/\D/g, "") } : x)))
                          }
                        />
                        <Input
                          aria-label={`Valor unitário de ${item.nome}`}
                          label="Valor unitário"
                          inputMode="decimal"
                          value={item.valorUnitario}
                          onChange={(e) => setCarrinho((l) => l.map((x, j) => (j === i ? { ...x, valorUnitario: e.target.value } : x)))}
                          placeholder="0,00"
                        />
                        <p className="col-span-2 pb-1 text-right text-small font-semibold text-foreground min-[420px]:col-span-1 min-[420px]:pb-3">
                          {formatarMoeda(subtotal)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-small font-medium text-foreground">
              {carrinho.length > 0 ? "Adicionar outro item" : "Item da venda"}
            </p>
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

            {(produtoSelecionado || servicoSelecionado) && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Quantidade"
                    inputMode="numeric"
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ""))}
                  />
                  <Input
                    label="Valor de venda (unidade)"
                    inputMode="decimal"
                    value={valorUnitario}
                    onChange={(e) => setValorUnitario(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <Button type="button" variant="tertiary" size="sm" onClick={handleAdicionarAoCarrinho} className="self-start">
                  <PlusCircle size={16} />
                  Adicionar à venda e escolher outro item
                </Button>
              </>
            )}

            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
              <DateMaskInput label="Data" value={data} onChange={(v) => setData(v)} />
              {!fiado && (
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
              )}
            </div>

            {!fiado && !dividirPagamento && (formaPagamento === "debito" || formaPagamento === "credito") && (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                {formaPagamento === "credito" && (
                  <label className="flex flex-col gap-1.5 text-small font-medium text-foreground">
                    Em quantas vezes?
                    <select
                      value={parcelasCartao}
                      onChange={(e) => setParcelasCartao(Number(e.target.value))}
                      className="h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n === 1 ? "À vista (1x)" : `${n}x`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {taxasMaquininha ? (
                  (() => {
                    const t = calcularTaxa(taxasMaquininha, formaPagamento, formaPagamento === "credito" ? parcelasCartao : 1, totalVenda);
                    return t.taxa > 0 ? (
                      <p className="text-small text-foreground">
                        Taxa da maquininha: <strong className="text-rose-700 dark:text-rose-300">{formatarMoeda(t.taxa)}</strong> ({String(t.percentual).replace(".", ",")}%) · você
                        recebe <strong>{formatarMoeda(t.liquido)}</strong>
                      </p>
                    ) : (
                      <p className="text-xs text-muted">Sem taxa cadastrada para essa forma.</p>
                    );
                  })()
                ) : papel !== "funcionario" ? (
                  <p className="text-xs text-muted">
                    Cadastre as taxas da sua maquininha em{" "}
                    <Link href="/dashboard/empresa/configuracoes#maquininha" className="font-semibold text-accent-700 hover:underline dark:text-accent-300">
                      Perfil da empresa
                    </Link>{" "}
                    e o app desconta a taxa de cada venda sozinho.
                  </p>
                ) : null}
              </div>
            )}

            {negocio && (
              <SeletorParceiro
                contaMestreId={negocio.usuarioId}
                lista={clientes}
                value={clienteId}
                obrigatorio={fiado}
                rotulo={fiado ? "Cliente" : "Cliente (opcional)"}
                onChange={(id) => {
                  setClienteId(id);
                  const novo = clientes.find((c) => c.id === id);
                  if (fiado) aplicarPadraoFiado(true, lerPadraoFiado(novo?.padrao_fiado));
                }}
                onCriado={(novo) => setClientes((lista) => [...lista, novo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")))}
              />
            )}

            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="vendedor-venda" className="text-small font-medium text-foreground">
                Quem vendeu
              </label>
              <input
                id="vendedor-venda"
                list="lista-vendedores"
                value={vendedor}
                onChange={(e) => setVendedor(e.target.value)}
                placeholder={nomeLogado || "Nome de quem vendeu"}
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-body text-foreground placeholder:text-muted focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
              />
              <datalist id="lista-vendedores">
                {nomesVendedores.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <p className="text-xs text-muted">Em branco fica com o seu nome. Serve pra ver as vendas e a comissão de cada um.</p>
            </div>

            <label className="flex items-center gap-2 text-small text-foreground">
              <input
                type="checkbox"
                checked={fiado}
                onChange={(e) => {
                  if (e.target.checked) {
                    setDividirPagamento(false);
                    aplicarPadraoFiado(true);
                  } else setFiado(false);
                }}
                className="h-4 w-4 accent-emerald-600"
              />
              Venda fiada (o cliente paga depois, nas condições que vocês combinarem)
            </label>
            {fiado && padraoCliente && (
              <p className="text-xs text-muted">Condições preenchidas com o padrão de {clienteSelecionado?.nome}. Pode mudar à vontade.</p>
            )}
            {fiado && (
              <CondicoesFiado
                total={totalVenda}
                estado={estadoFiado}
                onChange={setEstadoFiado}
                contas={contas}
                temPadraoCliente={!!padraoCliente}
              />
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
                  const soma = partes.reduce((a, x) => a + (lerValorDigitado(x.valor) || 0), 0);
                  const total = totalVenda;
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

            {itensDaVenda.length > 0 && (
              <p className="text-small text-muted">
                Total da venda ({itensDaVenda.length} {itensDaVenda.length === 1 ? "item" : "itens"}):{" "}
                <strong className="text-foreground">{formatarMoeda(totalVenda)}</strong>
                {itemPendente && carrinho.length > 0 ? " · inclui o item selecionado acima" : ""}
              </p>
            )}

            {erro && <p className="text-small text-rose-600">{erro}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={salvando || itensDaVenda.length === 0} className="flex-1">
                {salvando ? "Salvando..." : "Registrar venda"}
              </Button>
              <Button type="button" variant="tertiary" onClick={() => setFormAberto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {ultimaVenda && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-accent-200 bg-accent-50/60">
          <p className="text-small text-foreground">
            Venda de <strong>{formatarMoeda(ultimaVenda.total)}</strong> registrada.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setComprovante(ultimaVenda)}>
              <Receipt size={14} /> Mandar comprovante
            </Button>
            <Button size="sm" variant="tertiary" onClick={() => setUltimaVenda(null)}>
              Fechar
            </Button>
          </div>
        </Card>
      )}

      {comprovante && (
        <ComprovanteVenda
          grupo={comprovante}
          nomeEmpresa={empresaAtiva?.nome_fantasia ?? empresas[0]?.nome_fantasia ?? negocio?.nome ?? ""}
          onFechar={() => setComprovante(null)}
        />
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

          {porVendedorMes.length > 0 && (
            <Card className="flex flex-col gap-3">
              <div>
                <h2 className="text-h3 text-foreground">Vendas por vendedor (este mês)</h2>
                <p className="text-small text-muted">Toque num nome pra ver só as vendas dele.</p>
              </div>
              <div className="flex flex-col gap-2">
                {porVendedorMes.map((pv) => (
                  <button
                    key={pv.nome}
                    type="button"
                    onClick={() => setFiltroVendedor((f) => (f === pv.nome ? null : pv.nome))}
                    className={cn(
                      "flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                      filtroVendedor === pv.nome ? "border-accent-400 bg-accent-50 dark:bg-accent-900/20" : "border-border hover:bg-muted/10"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <UserRound size={16} className="shrink-0 text-accent-700" />
                      <span className="truncate text-small font-semibold text-foreground">{pv.nome}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {pv.qtd} {pv.qtd === 1 ? "venda" : "vendas"}
                      </span>
                    </span>
                    <span className="shrink-0 text-small font-semibold text-foreground">{formatarMoeda(pv.total)}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-h3 text-foreground">Últimas vendas</h2>
              {filtroVendedor && (
                <button
                  type="button"
                  onClick={() => setFiltroVendedor(null)}
                  className="flex items-center gap-1 rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-800 dark:bg-accent-900/20 dark:text-accent-200"
                >
                  Só {filtroVendedor} <X size={12} />
                </button>
              )}
            </div>
            {vendas.length === 0 ? (
              <Card className="flex flex-col items-center gap-3 py-12 text-center">
                <ShoppingCart size={28} className="text-accent-400" />
                <p className="text-body text-muted">Nenhuma venda registrada ainda.</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {vendasAgrupadas.slice(0, 15).map((g) => {
                  const v = g.linhas[0];
                  const titulo =
                    g.linhas.length === 1
                      ? `${v.produto_nome} · ${v.quantidade}x`
                      : g.linhas.map((l) => `${l.quantidade}x ${l.produto_nome}`).join(" · ");
                  return (
                  <Card key={g.chave} padding="sm" className="flex flex-wrap items-center justify-between gap-4">
                    {/* `min-w-0` aqui (mesma causa raiz da seção 23 do
                        contexto do projeto) deixa o nome do produto/cliente
                        quebrar linha dentro do próprio espaço, em vez de
                        forçar a linha mais larga que a tela. */}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
                        <ShoppingCart size={18} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words text-body font-medium text-foreground">{titulo}</p>
                          {g.vendedor && (
                            <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-xs font-semibold text-accent-800 dark:bg-accent-900/20 dark:text-accent-200">
                              <UserRound size={11} className="shrink-0" />
                              <span className="truncate">{g.vendedor}</span>
                            </span>
                          )}
                        </div>
                        <p className="text-small text-muted">
                          {new Date(g.data + "T00:00:00").toLocaleDateString("pt-BR")}
                          {g.cliente?.nome ? ` · ${g.cliente.nome}` : ""}
                          {g.linhas.length > 1 ? ` · ${g.linhas.length} itens` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="text-body font-semibold text-accent-600">{formatarMoeda(g.total)}</p>
                      <button
                        type="button"
                        onClick={() => setComprovante(g)}
                        aria-label="Comprovante desta venda"
                        title="Comprovante desta venda"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-muted/10 hover:text-foreground"
                      >
                        <Receipt size={16} />
                      </button>
                      {confirmandoExclusaoId === g.chave ? (
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
                            {g.linhas.length > 1 ? "Apagar venda inteira" : "Apagar"}
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label="Apagar venda"
                          onClick={() => setConfirmandoExclusaoId(g.chave)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-red-500"
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
          </div>
        </>
      )}
    </Container>
  );
}
