"use client";

import * as React from "react";
import { Plus, Package, Trash2, Pencil, AlertTriangle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { FormularioProduto } from "@/components/dashboard/catalogo/FormularioProduto";
import {
  listarProdutos,
  deletarProduto,
  calcularMargem,
  estoqueBaixo,
} from "@/lib/data/produtos";
import { listarFornecedores } from "@/lib/data/fornecedores";
import { formatarMoeda } from "@/lib/format";
import type { Fornecedor, Produto } from "@/lib/data/tipos";

export default function ProdutosPage() {
  const { negocio } = useAuth();
  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [formAberto, setFormAberto] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    // Recarregar depois de salvar NÃO mostra o spinner (só a 1ª carga):
    // trocar a lista pelo spinner jogava a tela pro topo e fechava o que
    // estava aberto (pedido do usuário em 05/out/2026).
    const [lista, forn] = await Promise.all([listarProdutos(negocio.usuarioId), listarFornecedores(negocio.usuarioId)]);
    setProdutos(lista);
    setFornecedores(forn);
    setCarregando(false);
  }, [negocio]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditandoId(null);
    setFormAberto(true);
  }

  function abrirEdicao(produto: Produto) {
    setEditandoId(produto.id);
    setFormAberto(true);
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
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Catálogo de produtos</h1>
          <p className="text-body text-muted">
            O que você vende, com custo, preço e margem. Entradas, saídas e reposição ficam em Gestão de estoque.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={18} />
          Novo produto
        </Button>
      </div>

      {formAberto && negocio && (
        <FormularioProduto
          key={editandoId ?? "novo"}
          contaMestreId={negocio.usuarioId}
          produto={editandoId ? produtos.find((x) => x.id === editandoId) ?? null : null}
          fornecedores={fornecedores}
          onSalvo={() => {
            setFormAberto(false);
            setEditandoId(null);
            carregar();
          }}
          onCancelar={() => setFormAberto(false)}
        />
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
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600">
                      <Package size={18} />
                    </span>
                    <p className="min-w-0 text-body font-semibold text-foreground">{p.nome}</p>
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
                    <p className="text-xs text-muted">Margem / lucro por unidade</p>
                    <p className={`font-semibold ${margem >= 0 ? "text-accent-600" : "text-red-500"}`}>
                      {margem.toFixed(0)}% · {formatarMoeda(Number(p.preco_venda) - Number(p.custo))}
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
