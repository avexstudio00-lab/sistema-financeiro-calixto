"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Receipt, Trash2, AlertTriangle, Check, Pencil, Clock, Layers, Package, PlusCircle, X } from "lucide-react";
import { FormularioProduto } from "@/components/dashboard/catalogo/FormularioProduto";
import { listarProdutos } from "@/lib/data/produtos";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { Badge } from "@/components/ui/Badge";
import { FiltrosLista, AbasVistaParcelado, dentroDoPeriodo, type PeriodoMeses } from "@/components/dashboard/FiltrosLista";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarFornecedores } from "@/lib/data/fornecedores";
import { listarClientes } from "@/lib/data/clientes";
import { listarContas } from "@/lib/data/contas";
import {
  listarContasPagar,
  criarContaPagar,
  criarContaPagarParcelada,
  darEntradaEstoqueDaCompra,
  marcarContaPagarPaga,
  editarContaPagar,
  deletarContaPagar,
  listarContasReceber,
  criarContaReceberParcelada,
  marcarContaReceberRecebida,
  editarContaReceber,
  deletarContaReceber,
  estaAtrasada,
  venceEmBreve,
} from "@/lib/data/contasEmpresa";
import { formatarMoeda } from "@/lib/format";
import { diasEntre, hojeIso } from "@/lib/util/texto";
import type { Fornecedor, Cliente, ContaPagar, ContaReceber, Conta, Produto } from "@/lib/data/tipos";

type Titulo = ContaPagar | ContaReceber;

interface Grupo {
  chave: string;
  parcelado: boolean;
  titulos: Titulo[];
}

const classeSelect =
  "h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100";

function parsearValor(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : NaN;
}

export default function ContasEmpresaPage() {
  const { papel, negocio } = useAuth();
  const router = useRouter();
  const [aba, setAba] = React.useState<"pagar" | "receber">("pagar");
  const [modo, setModo] = React.useState<"vista" | "parcelado">("vista");
  const [periodo, setPeriodo] = React.useState<PeriodoMeses>(null);
  const [verQuitadas, setVerQuitadas] = React.useState(false);

  // Contas a pagar/receber ficam escondidas de funcionário (só dono/sócio
  // veem financeiro do negócio) — o RLS já bloqueia no banco.
  React.useEffect(() => {
    if (papel === "funcionario") router.replace("/dashboard/empresa");
  }, [papel, router]);

  const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
  const [clientes, setClientes] = React.useState<Cliente[]>([]);
  const [carteiras, setCarteiras] = React.useState<Conta[]>([]);
  // Item 6.3/12.3: compra de mercadoria ligada ao estoque.
  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [compraEstoque, setCompraEstoque] = React.useState(false);
  const [itensCompra, setItensCompra] = React.useState<{ produtoId: string; quantidade: string; custo: string }[]>([]);
  const [cadastrandoProduto, setCadastrandoProduto] = React.useState<number | null>(null);
  const [contasPagar, setContasPagar] = React.useState<ContaPagar[]>([]);
  const [contasReceber, setContasReceber] = React.useState<ContaReceber[]>([]);
  const [carregando, setCarregando] = React.useState(true);

  const [formAberto, setFormAberto] = React.useState(false);
  const [descricao, setDescricao] = React.useState("");
  const [valor, setValor] = React.useState("");
  const [vencimento, setVencimento] = React.useState(() => hojeIso());
  const [vinculoId, setVinculoId] = React.useState("");
  const [parcelar, setParcelar] = React.useState(false);
  const [numeroParcelas, setNumeroParcelas] = React.useState("2");
  const [fiado, setFiado] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = React.useState<string | null>(null);

  // Edição isolada de um título/parcela (item 5.1).
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [edicao, setEdicao] = React.useState({ valor: "", vencimento: "", status: "pendente" as "pendente" | "pago" });

  // Recebimento de título fiado/orçamento: escolhe a carteira de entrada.
  const [recebendo, setRecebendo] = React.useState<ContaReceber | null>(null);
  const [carteiraEntrada, setCarteiraEntrada] = React.useState("");

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    // Recarregar depois de salvar NÃO mostra o spinner (só a 1ª carga):
    // trocar a lista pelo spinner jogava a tela pro topo e fechava o que
    // estava aberto (pedido do usuário em 05/out/2026).
    const [f, c, pagar, receber, cts, prods] = await Promise.all([
      listarFornecedores(negocio.usuarioId),
      listarClientes(negocio.usuarioId),
      listarContasPagar(negocio.usuarioId),
      listarContasReceber(negocio.usuarioId),
      listarContas(negocio.usuarioId),
      listarProdutos(negocio.usuarioId),
    ]);
    setProdutos(prods);
    setFornecedores(f);
    setClientes(c);
    setContasPagar(pagar.filter((cp) => cp.categoria !== "das"));
    setContasReceber(receber);
    setCarteiras(cts);
    setCarregando(false);
  }, [negocio]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setDescricao("");
    setValor("");
    setVencimento(hojeIso());
    setVinculoId("");
    setParcelar(modo === "parcelado");
    setNumeroParcelas("2");
    setFiado(false);
    setCompraEstoque(false);
    setItensCompra([]);
    setCadastrandoProduto(null);
    setErro(null);
    setFormAberto(true);
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!negocio) return;
    const valorNumero = parsearValor(valor);
    const n = parcelar ? Number(numeroParcelas) : 1;
    if (descricao.trim().length < 2) return setErro("Digite uma descrição.");
    if (!valorNumero || valorNumero <= 0) return setErro("Digite um valor válido.");
    if (parcelar && (!Number.isInteger(n) || n < 2 || n > 60)) return setErro("Parcelas: um número entre 2 e 60.");
    if (aba === "receber" && fiado && !vinculoId) return setErro("Venda fiada precisa de um cliente.");
    const itensValidos = aba === "pagar" && compraEstoque
      ? itensCompra
          .map((i) => {
            const prod = produtos.find((p) => p.id === i.produtoId);
            return { produto_id: i.produtoId, nome: prod?.nome ?? "", quantidade: Number(i.quantidade.replace(",", ".")) || 0, custo_unitario: parsearValor(i.custo) || 0 };
          })
          .filter((i) => i.produto_id && i.quantidade > 0)
      : [];
    if (aba === "pagar" && compraEstoque && itensValidos.length === 0) return setErro("Informe pelo menos um produto e a quantidade comprada.");
    setErro(null);
    setSalvando(true);

    let erroSalvar: unknown = null;
    if (aba === "pagar") {
      const base = {
        usuario_id: negocio.usuarioId,
        fornecedor_id: vinculoId || null,
        categoria: "fornecedor" as const,
        descricao: descricao.trim(),
        valor: valorNumero,
        vencimento,
      };
      const r = parcelar ? await criarContaPagarParcelada(base, n) : await criarContaPagar(base);
      erroSalvar = r.error;
      // Item 6.3: a compra já alimenta o estoque (itens gravados na 1ª parcela).
      if (!r.error && itensValidos.length > 0) {
        const linhas = (Array.isArray(r.data) ? r.data : r.data ? [r.data] : []) as { id: string; parcela_numero?: number | null }[];
        const primeira = linhas.find((l) => !l.parcela_numero || l.parcela_numero === 1) ?? linhas[0];
        if (primeira) await darEntradaEstoqueDaCompra(primeira.id, itensValidos);
      }
    } else {
      const r = await criarContaReceberParcelada(
        {
          usuario_id: negocio.usuarioId,
          cliente_id: vinculoId || null,
          descricao: descricao.trim(),
          valor: valorNumero,
          vencimento,
          origem: fiado ? "fiado" : "manual",
        },
        n
      );
      erroSalvar = r.error;
    }
    setSalvando(false);
    if (erroSalvar) return setErro("Não foi possível salvar. Tente novamente.");
    setFormAberto(false);
    setModo(parcelar ? "parcelado" : "vista");
    carregar();
  }

  async function handleMarcar(t: Titulo, marcado: boolean) {
    if (aba === "receber") {
      const conta = t as ContaReceber;
      const geraEntrada = conta.origem === "fiado" || conta.origem === "orcamento";
      if (marcado && geraEntrada) {
        setRecebendo(conta);
        setCarteiraEntrada(carteiras[0]?.id ?? "");
        return;
      }
      setSalvando(true);
      await marcarContaReceberRecebida(conta, marcado);
    } else {
      setSalvando(true);
      await marcarContaPagarPaga(t.id, marcado);
    }
    setSalvando(false);
    carregar();
  }

  async function confirmarRecebimento() {
    if (!recebendo) return;
    setSalvando(true);
    await marcarContaReceberRecebida(recebendo, true, carteiraEntrada || null);
    setSalvando(false);
    setRecebendo(null);
    carregar();
  }

  async function handleExcluir(t: Titulo) {
    setSalvando(true);
    if (aba === "pagar") await deletarContaPagar(t.id);
    else await deletarContaReceber(t as ContaReceber);
    setSalvando(false);
    setConfirmandoExclusaoId(null);
    carregar();
  }

  function abrirEdicao(t: Titulo) {
    setEditandoId(t.id);
    setEdicao({
      valor: String(Number(t.valor).toFixed(2)).replace(".", ","),
      vencimento: t.vencimento,
      status: t.status === "pendente" ? "pendente" : "pago",
    });
  }

  async function salvarEdicao(t: Titulo) {
    const v = parsearValor(edicao.valor);
    if (!v || v <= 0 || !edicao.vencimento) return;
    setSalvando(true);
    if (aba === "pagar") {
      await editarContaPagar(t.id, { valor: v, vencimento: edicao.vencimento, status: edicao.status === "pago" ? "pago" : "pendente" });
    } else {
      await editarContaReceber(t.id, { valor: v, vencimento: edicao.vencimento });
      const estavaRecebido = t.status !== "pendente";
      const ficaRecebido = edicao.status === "pago";
      if (estavaRecebido !== ficaRecebido) await marcarContaReceberRecebida({ ...(t as ContaReceber), valor: v }, ficaRecebido);
    }
    setSalvando(false);
    setEditandoId(null);
    carregar();
  }

  const lista: Titulo[] = aba === "pagar" ? contasPagar : contasReceber;

  // Agrupa parcelas da mesma operação; títulos avulsos viram grupo de 1.
  const grupos = React.useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Grupo>();
    for (const t of lista) {
      const chave = t.grupo_parcela_id ?? t.id;
      const g = mapa.get(chave) ?? { chave, parcelado: !!t.grupo_parcela_id, titulos: [] };
      g.titulos.push(t);
      mapa.set(chave, g);
    }
    for (const g of mapa.values()) g.titulos.sort((a, b) => (a.parcela_numero ?? 0) - (b.parcela_numero ?? 0));
    return Array.from(mapa.values());
  }, [lista]);

  const quitado = (g: Grupo) => g.titulos.every((t) => t.status !== "pendente");
  const gruposDoModo = grupos.filter((g) => (modo === "parcelado" ? g.parcelado : !g.parcelado));
  const gruposVisiveis = gruposDoModo
    .filter((g) => (verQuitadas ? quitado(g) : !quitado(g)))
    .filter((g) => g.titulos.some((t) => dentroDoPeriodo(t.vencimento, periodo)));
  const totalQuitadas = gruposDoModo.filter(quitado).length;

  const totalPendente = lista.filter((c) => c.status === "pendente").reduce((acc, c) => acc + Number(c.valor), 0);
  const totalAtrasado = lista.filter((c) => estaAtrasada(c)).reduce((acc, c) => acc + Number(c.valor), 0);
  const totalVencendo = lista.filter((c) => venceEmBreve(c, 3)).reduce((acc, c) => acc + Number(c.valor), 0);
  const vinculos = aba === "pagar" ? fornecedores : clientes;

  function linhaTitulo(t: Titulo, dentroDeGrupo: boolean) {
    const atrasada = estaAtrasada(t);
    const emBreve = venceEmBreve(t, 3);
    const pago = t.status !== "pendente";
    const nomeVinculo = aba === "pagar" ? (t as ContaPagar).fornecedores?.nome : (t as ContaReceber).clientes?.nome;
    const origem = aba === "receber" ? (t as ContaReceber).origem : undefined;
    const dias = diasEntre(hojeIso(), t.vencimento);

    if (editandoId === t.id) {
      return (
        <div key={t.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
          <p className="text-small font-semibold text-foreground">Editar {dentroDeGrupo ? `parcela ${t.parcela_numero}` : "título"}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Valor" inputMode="decimal" value={edicao.valor} onChange={(e) => setEdicao((x) => ({ ...x, valor: e.target.value }))} />
            <DateMaskInput label="Vencimento" value={edicao.vencimento} onChange={(v) => setEdicao((x) => ({ ...x, vencimento: v }))} />
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-foreground">Status</span>
              <select
                value={edicao.status}
                onChange={(e) => setEdicao((x) => ({ ...x, status: e.target.value as "pendente" | "pago" }))}
                className={classeSelect}
              >
                <option value="pendente">{atrasada ? "Vencido (pendente)" : "Pendente"}</option>
                <option value="pago">{aba === "pagar" ? "Pago" : "Recebido"}</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted">Só esta {dentroDeGrupo ? "parcela" : "conta"} muda — as outras ficam como estão.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={salvando} onClick={() => salvarEdicao(t)}>Salvar</Button>
            <Button size="sm" variant="tertiary" onClick={() => setEditandoId(null)}>Cancelar</Button>
          </div>
        </div>
      );
    }

    return (
      <div key={t.id} className={`flex flex-wrap items-center justify-between gap-3 ${dentroDeGrupo ? "rounded-xl bg-muted/5 px-3 py-2" : ""}`}>
        <div className="flex min-w-0 items-center gap-3">
          {!dentroDeGrupo && (
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                pago ? "bg-primary-50 text-primary-700" : atrasada ? "bg-rose-50 text-rose-700" : "bg-muted/10 text-foreground"
              }`}
            >
              {pago ? <Check size={18} /> : atrasada ? <AlertTriangle size={18} /> : <Receipt size={18} />}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-body font-medium text-foreground">
              {dentroDeGrupo ? `Parcela ${t.parcela_numero}/${t.parcela_total}` : t.descricao}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-small text-muted">Vence {new Date(t.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}</p>
              {!dentroDeGrupo && nomeVinculo && <Badge variant="neutral" size="sm">{nomeVinculo}</Badge>}
              {!dentroDeGrupo && origem === "fiado" && <Badge variant="accent" size="sm">Fiado</Badge>}
              {!dentroDeGrupo && origem === "orcamento" && <Badge variant="accent" size="sm">Orçamento</Badge>}
              {pago && <Badge variant="primary" size="sm">{aba === "pagar" ? "Pago" : "Recebido"}</Badge>}
              {!pago && atrasada && <Badge variant="danger" size="sm">Vencida</Badge>}
              {!pago && emBreve && (
                <Badge variant="warning" size="sm">
                  <Clock size={12} />
                  {dias === 0 ? "Vence hoje" : `Vence em ${dias} dia${dias === 1 ? "" : "s"}`}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-body font-semibold text-foreground">{formatarMoeda(Number(t.valor))}</p>
          <Button size="sm" variant={pago ? "tertiary" : "secondary"} disabled={salvando} onClick={() => handleMarcar(t, !pago)}>
            {pago ? "Desfazer" : aba === "pagar" ? "Pagar" : "Receber"}
          </Button>
          <button
            type="button"
            aria-label="Editar"
            onClick={() => abrirEdicao(t)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10 hover:text-foreground"
          >
            <Pencil size={15} />
          </button>
          {confirmandoExclusaoId === t.id ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="tertiary" onClick={() => setConfirmandoExclusaoId(null)}>Não</Button>
              <Button size="sm" disabled={salvando} onClick={() => handleExcluir(t)} className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700">
                Apagar
              </Button>
            </div>
          ) : (
            <button
              type="button"
              aria-label="Apagar"
              onClick={() => setConfirmandoExclusaoId(t.id)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-700"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Contas a pagar e a receber</h1>
          <p className="text-body text-muted">Quem te deve e para quem você deve — à vista, parcelado ou fiado.</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={18} />
          {aba === "pagar" ? "Nova conta a pagar" : "Nova conta a receber"}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-1 self-start rounded-full bg-muted/10 p-1">
          {(["pagar", "receber"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAba(a);
                setConfirmandoExclusaoId(null);
                setEditandoId(null);
                setFormAberto(false);
              }}
              className={`rounded-full px-4 py-2 text-small font-medium transition-colors ${
                aba === a ? "bg-card text-accent-700 shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {a === "pagar" ? "A pagar" : "A receber"}
            </button>
          ))}
        </div>
        <AbasVistaParcelado
          valor={modo}
          onChange={setModo}
          totalVista={grupos.filter((g) => !g.parcelado && !quitado(g)).length}
          totalParcelado={grupos.filter((g) => g.parcelado && !quitado(g)).length}
        />
        <FiltrosLista periodo={periodo} onPeriodo={setPeriodo} quitadas={verQuitadas} onQuitadas={setVerQuitadas} totalQuitadas={totalQuitadas} />
      </div>

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-h3 text-foreground">{aba === "pagar" ? "Nova conta a pagar" : "Nova conta a receber"}</h2>
          {cadastrandoProduto != null && negocio && (
            <FormularioProduto
              compacto
              contaMestreId={negocio.usuarioId}
              fornecedores={fornecedores}
              onCancelar={() => setCadastrandoProduto(null)}
              onSalvo={(novo) => {
                setProdutos((l) => [...l, novo]);
                const linha = cadastrandoProduto;
                setItensCompra((l) => l.map((x, j) => (j === linha ? { ...x, produtoId: novo.id, custo: String(novo.custo).replace(".", ",") } : x)));
                setCadastrandoProduto(null);
              }}
            />
          )}
          <form onSubmit={handleSalvar} className="flex flex-col gap-4">
            <Input
              label="Descrição"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={aba === "pagar" ? "Ex: Aluguel do ponto" : "Ex: Pedido de 20 unidades"}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={parcelar ? "Valor total" : "Valor"}
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
              />
              <DateMaskInput label={parcelar ? "1º vencimento" : "Vencimento"} value={vencimento} onChange={(v) => setVencimento(v)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setParcelar((v) => !v)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-small font-semibold ${
                  parcelar ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border text-foreground"
                }`}
              >
                <Layers size={14} />
                Parcelar
              </button>
              {aba === "receber" && (
                <button
                  type="button"
                  onClick={() => setFiado((v) => !v)}
                  className={`rounded-full border px-3 py-1.5 text-small font-semibold ${
                    fiado ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border text-foreground"
                  }`}
                >
                  Venda fiada (a prazo)
                </button>
              )}
            </div>
            {parcelar && (
              <Input
                label="Número de parcelas (mensais)"
                inputMode="numeric"
                value={numeroParcelas}
                onChange={(e) => setNumeroParcelas(e.target.value.replace(/\D/g, ""))}
                helperText={
                  parsearValor(valor) > 0 && Number(numeroParcelas) >= 2
                    ? `${numeroParcelas}x de cerca de ${formatarMoeda(parsearValor(valor) / Number(numeroParcelas))}. Depois dá pra ajustar cada parcela.`
                    : "Depois dá pra ajustar o valor e a data de cada parcela."
                }
              />
            )}
            {aba === "receber" && fiado && (
              <p className="text-small text-foreground">
                Fiado: o dinheiro só entra no caixa quando cada parcela for marcada como recebida.
              </p>
            )}
            {vinculos.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">
                  {aba === "pagar" ? "Fornecedor (opcional)" : fiado ? "Cliente" : "Cliente (opcional)"}
                </span>
                <select value={vinculoId} onChange={(e) => setVinculoId(e.target.value)} className={classeSelect}>
                  <option value="">Nenhum</option>
                  {vinculos.map((v) => (
                    <option key={v.id} value={v.id}>{v.nome}</option>
                  ))}
                </select>
              </div>
            )}
            {aba === "pagar" && (
              <label className="flex items-center gap-2 text-small text-foreground">
                <input
                  type="checkbox"
                  checked={compraEstoque}
                  onChange={(e) => {
                    setCompraEstoque(e.target.checked);
                    if (e.target.checked && itensCompra.length === 0) setItensCompra([{ produtoId: "", quantidade: "1", custo: "" }]);
                  }}
                  className="h-4 w-4 accent-emerald-600"
                />
                <Package size={14} /> É compra de mercadoria para o estoque (dar entrada automática)
              </label>
            )}
            {aba === "pagar" && compraEstoque && (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                {itensCompra.map((item, i) => (
                  <div key={i} className="grid grid-cols-[1fr_70px_100px_auto] items-end gap-2">
                    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
                      Produto
                      <select
                        value={item.produtoId}
                        onChange={(e) => {
                          const prod = produtos.find((p) => p.id === e.target.value);
                          setItensCompra((l) => l.map((x, j) => (j === i ? { ...x, produtoId: e.target.value, custo: x.custo || (prod ? String(prod.custo).replace(".", ",") : "") } : x)));
                        }}
                        className="h-10 rounded-xl border border-border bg-card px-2 text-small text-foreground"
                      >
                        <option value="">Escolha...</option>
                        {produtos.map((p) => (
                          <option key={p.id} value={p.id}>{p.nome} ({p.quantidade_estoque} em estoque)</option>
                        ))}
                      </select>
                    </label>
                    <Input label="Qtd." inputMode="decimal" value={item.quantidade} onChange={(e) => setItensCompra((l) => l.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))} />
                    <Input label="Custo un." inputMode="decimal" value={item.custo} onChange={(e) => setItensCompra((l) => l.map((x, j) => (j === i ? { ...x, custo: e.target.value } : x)))} placeholder="0,00" />
                    <button
                      type="button"
                      aria-label="Remover produto"
                      onClick={() => setItensCompra((l) => l.filter((_, j) => j !== i))}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-700"
                    >
                      <X size={16} />
                    </button>
                    {!item.produtoId && (
                      <button
                        type="button"
                        onClick={() => setCadastrandoProduto(i)}
                        className="col-span-4 flex items-center gap-1 self-start text-xs font-semibold text-primary-700 hover:underline"
                      >
                        <PlusCircle size={13} /> Produto novo? Cadastrar
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setItensCompra((l) => [...l, { produtoId: "", quantidade: "1", custo: "" }])}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:underline"
                  >
                    <PlusCircle size={14} /> Adicionar produto
                  </button>
                  {(() => {
                    const soma = itensCompra.reduce((a, x) => a + (Number(x.quantidade.replace(",", ".")) || 0) * (parsearValor(x.custo) || 0), 0);
                    return soma > 0 ? (
                      <button type="button" onClick={() => setValor(soma.toFixed(2).replace(".", ","))} className="text-xs text-muted hover:underline">
                        Total dos itens: {formatarMoeda(soma)} (usar como valor)
                      </button>
                    ) : null;
                  })()}
                </div>
                <p className="text-xs text-muted">Ao salvar, as unidades entram no estoque na hora e o custo do produto vira o custo médio.</p>
              </div>
            )}
            {erro && <p className="text-small text-rose-700">{erro}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={salvando} className="flex-1">{salvando ? "Salvando..." : "Salvar"}</Button>
              <Button type="button" variant="tertiary" onClick={() => setFormAberto(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {recebendo && (
        <Card padding="lg" className="flex flex-col gap-3 border-primary-200">
          <p className="text-body font-semibold text-foreground">Receber {formatarMoeda(Number(recebendo.valor))}</p>
          <p className="text-small text-foreground">Em qual carteira esse dinheiro entrou? Vai aparecer como entrada no fluxo de caixa.</p>
          <select value={carteiraEntrada} onChange={(e) => setCarteiraEntrada(e.target.value)} className={classeSelect}>
            <option value="">Sem carteira específica</option>
            {carteiras.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button size="sm" disabled={salvando} onClick={confirmarRecebimento}>Confirmar recebimento</Button>
            <Button size="sm" variant="tertiary" onClick={() => setRecebendo(null)}>Cancelar</Button>
          </div>
        </Card>
      )}

      {!carregando && lista.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="flex flex-col gap-2">
            <p className="text-small text-muted">Pendente</p>
            <p className="text-h3 text-foreground">{formatarMoeda(totalPendente)}</p>
          </Card>
          <Card className="flex flex-col gap-2 border-amber-200 bg-amber-50/60">
            <p className="text-small text-amber-900">Vence nos próximos 3 dias</p>
            <p className="text-h3 text-amber-900">{formatarMoeda(totalVencendo)}</p>
          </Card>
          <Card className="flex flex-col gap-2 border-rose-200 bg-rose-50/60">
            <p className="text-small text-rose-800">Vencido</p>
            <p className="text-h3 text-rose-800">{formatarMoeda(totalAtrasado)}</p>
          </Card>
        </div>
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : gruposVisiveis.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Receipt size={28} className="text-accent-700" />
          <p className="text-body text-muted">
            {verQuitadas
              ? "Nenhuma conta quitada neste filtro."
              : modo === "parcelado"
                ? "Nenhuma conta parcelada em aberto."
                : aba === "pagar"
                  ? "Nenhuma conta a pagar em aberto."
                  : "Nenhuma conta a receber em aberto."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {gruposVisiveis.map((g) => {
            if (!g.parcelado) {
              return (
                <Card key={g.chave} padding="sm">
                  {linhaTitulo(g.titulos[0], false)}
                </Card>
              );
            }
            const primeiro = g.titulos[0];
            const pagas = g.titulos.filter((t) => t.status !== "pendente");
            const total = g.titulos.reduce((acc, t) => acc + Number(t.valor), 0);
            const recebido = pagas.reduce((acc, t) => acc + Number(t.valor), 0);
            const nomeBase = primeiro.descricao.replace(/\s*\(\d+\/\d+\)$/, "");
            const nomeVinculo = aba === "pagar" ? (primeiro as ContaPagar).fornecedores?.nome : (primeiro as ContaReceber).clientes?.nome;
            const origem = aba === "receber" ? (primeiro as ContaReceber).origem : undefined;
            const atrasadas = g.titulos.filter((t) => estaAtrasada(t)).length;
            return (
              <Card key={g.chave} padding="sm" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-foreground">{nomeBase}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-small text-muted">
                        {pagas.length}/{g.titulos.length} parcelas {aba === "pagar" ? "pagas" : "recebidas"} · {formatarMoeda(recebido)} de {formatarMoeda(total)}
                      </p>
                      {nomeVinculo && <Badge variant="neutral" size="sm">{nomeVinculo}</Badge>}
                      {origem === "fiado" && <Badge variant="accent" size="sm">Fiado</Badge>}
                      {origem === "orcamento" && <Badge variant="accent" size="sm">Orçamento</Badge>}
                      {atrasadas > 0 && <Badge variant="danger" size="sm">{atrasadas} vencida{atrasadas > 1 ? "s" : ""}</Badge>}
                    </div>
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/10">
                  <div className="h-full rounded-full bg-primary-500" style={{ width: `${total > 0 ? Math.min(100, (recebido / total) * 100) : 0}%` }} />
                </div>
                <div className="flex flex-col gap-1.5">{g.titulos.map((t) => linhaTitulo(t, true))}</div>
              </Card>
            );
          })}
        </div>
      )}
    </Container>
  );
}
