"use client";

import * as React from "react";
import { Plus, Package, Trash2, Pencil, AlertTriangle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  listarProdutos,
  criarProduto,
  atualizarProduto,
  deletarProduto,
  calcularMargem,
  estoqueBaixo,
} from "@/lib/data/produtos";
import { formatarMoeda } from "@/lib/format";
import type { Produto } from "@/lib/data/tipos";

interface FormularioProduto {
  nome: string;
  custo: string;
  precoVenda: string;
  quantidade: string;
  estoqueMinimo: string;
}

const FORM_VAZIO: FormularioProduto = { nome: "", custo: "", precoVenda: "", quantidade: "", estoqueMinimo: "" };

export default function ProdutosPage() {
  const { user } = useAuth();
  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [formAberto, setFormAberto] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormularioProduto>(FORM_VAZIO);
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    setProdutos(await listarProdutos(user.id));
    setCarregando(false);
  }, [user]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setErro(null);
    setFormAberto(true);
  }

  function abrirEdicao(produto: Produto) {
    setEditandoId(produto.id);
    setForm({
      nome: produto.nome,
      custo: String(produto.custo).replace(".", ","),
      precoVenda: String(produto.preco_venda).replace(".", ","),
      quantidade: String(produto.quantidade_estoque),
      estoqueMinimo: String(produto.estoque_minimo),
    });
    setErro(null);
    setFormAberto(true);
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const custo = Number(form.custo.replace(",", ".")) || 0;
    const precoVenda = Number(form.precoVenda.replace(",", ".")) || 0;
    const quantidade = Number(form.quantidade) || 0;
    const estoqueMinimo = Number(form.estoqueMinimo) || 0;

    if (form.nome.trim().length < 2) {
      setErro("Digite o nome do produto.");
      return;
    }
    if (precoVenda <= 0) {
      setErro("Digite um preço de venda válido.");
      return;
    }

    setErro(null);
    setSalvando(true);
    const dados = {
      nome: form.nome.trim(),
      custo,
      preco_venda: precoVenda,
      quantidade_estoque: quantidade,
      estoque_minimo: estoqueMinimo,
    };
    const { error } = editandoId
      ? await atualizarProduto(editandoId, dados)
      : await criarProduto({ usuario_id: user.id, ...dados });
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
    await deletarProduto(id);
    setSalvando(false);
    setConfirmandoExclusaoId(null);
    carregar();
  }

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h2 text-foreground">Estoque e produtos</h1>
          <p className="text-body text-muted">Cadastre o que você vende, com custo, preço e quantidade.</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={18} />
          Novo produto
        </Button>
      </div>

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-h3 text-foreground">{editandoId ? "Editar produto" : "Novo produto"}</h2>
          <form onSubmit={handleSalvar} className="flex flex-col gap-4">
            <Input
              label="Nome do produto"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: Bolo de cenoura"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Custo (unidade)"
                inputMode="decimal"
                value={form.custo}
                onChange={(e) => setForm((f) => ({ ...f, custo: e.target.value }))}
                placeholder="0,00"
              />
              <Input
                label="Preço de venda (unidade)"
                inputMode="decimal"
                value={form.precoVenda}
                onChange={(e) => setForm((f) => ({ ...f, precoVenda: e.target.value }))}
                placeholder="0,00"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Quantidade em estoque"
                inputMode="numeric"
                value={form.quantidade}
                onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))}
                placeholder="0"
              />
              <Input
                label="Avisar quando o estoque chegar em"
                inputMode="numeric"
                value={form.estoqueMinimo}
                onChange={(e) => setForm((f) => ({ ...f, estoqueMinimo: e.target.value }))}
                placeholder="0"
              />
            </div>
            {erro && <p className="text-small text-rose-600">{erro}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={salvando} className="flex-1">
                {salvando ? "Salvando..." : "Salvar produto"}
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
      ) : produtos.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Package size={28} className="text-accent-400" />
          <p className="text-body text-muted">Você ainda não tem produtos cadastrados.</p>
          <Button onClick={abrirNovo}>
            <Plus size={18} />
            Cadastrar meu primeiro produto
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {produtos.map((p) => {
            const margem = calcularMargem(p);
            const baixo = estoqueBaixo(p);
            return (
              <Card key={p.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
                      <Package size={18} />
                    </span>
                    <p className="text-body font-semibold text-foreground">{p.nome}</p>
                  </div>
                  {baixo && (
                    <Badge variant="warning" size="sm">
                      <AlertTriangle size={12} />
                      Estoque baixo
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-small">
                  <div>
                    <p className="text-xs text-muted">Custo</p>
                    <p className="font-semibold text-foreground">{formatarMoeda(Number(p.custo))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Venda</p>
                    <p className="font-semibold text-foreground">{formatarMoeda(Number(p.preco_venda))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Margem</p>
                    <p className={`font-semibold ${margem >= 0 ? "text-accent-600" : "text-red-500"}`}>
                      {margem.toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Em estoque</p>
                    <p className={`font-semibold ${baixo ? "text-amber-600" : "text-foreground"}`}>
                      {p.quantidade_estoque}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(p)}
                    className="flex items-center gap-1.5 rounded-full bg-muted/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20"
                  >
                    <Pencil size={12} />
                    Editar
                  </button>
                  {confirmandoExclusaoId === p.id ? (
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-xs text-muted">Apagar?</span>
                      <Button size="sm" variant="tertiary" onClick={() => setConfirmandoExclusaoId(null)}>
                        Não
                      </Button>
                      <Button
                        size="sm"
                        disabled={salvando}
                        onClick={() => handleExcluir(p.id)}
                        className="bg-red-500 shadow-none hover:bg-red-600 active:bg-red-700"
                      >
                        Sim, apagar
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label="Apagar produto"
                      onClick={() => setConfirmandoExclusaoId(p.id)}
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
