"use client";

import * as React from "react";
import Link from "next/link";
import { Boxes, Minus, Plus, ShoppingBag, AlertTriangle, Truck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarProdutos, ajustarEstoque, atualizarProduto, estoqueBaixo } from "@/lib/data/produtos";
import { listarVendas } from "@/lib/data/vendas";
import { listarFornecedores } from "@/lib/data/fornecedores";
import { calcularSugestoesReposicao, valorDoEstoque } from "@/lib/data/estoque";
import { formatarMoeda } from "@/lib/format";
import type { Fornecedor, Produto, Venda } from "@/lib/data/tipos";

/**
 * Gestão de estoque (item 5.6 — separada do catálogo de produtos) + sugestão
 * de reposição (item 7.3). Aqui ficam as quantidades: entradas, saídas
 * manuais, estoque mínimo e a recomendação de compra.
 */
export default function EstoquePage() {
  const { negocio } = useAuth();
  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [vendas, setVendas] = React.useState<Venda[]>([]);
  const [fornecedores, setFornecedores] = React.useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [movendoId, setMovendoId] = React.useState<string | null>(null);
  const [movimento, setMovimento] = React.useState<{ tipo: "entrada" | "saida"; quantidade: string; minimo: string }>({
    tipo: "entrada",
    quantidade: "",
    minimo: "",
  });
  const [salvando, setSalvando] = React.useState(false);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    setCarregando(true);
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 60);
    const [p, v, f] = await Promise.all([
      listarProdutos(negocio.usuarioId),
      listarVendas(negocio.usuarioId, { inicio: inicio.toISOString().slice(0, 10) }),
      listarFornecedores(negocio.usuarioId),
    ]);
    setProdutos(p);
    setVendas(v);
    setFornecedores(f);
    setCarregando(false);
  }, [negocio]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  const sugestoes = React.useMemo(() => calcularSugestoesReposicao(produtos, vendas, fornecedores), [produtos, vendas, fornecedores]);
  const capitalTotal = sugestoes.reduce((acc, s) => acc + s.capitalNecessario, 0);

  function abrirMovimento(p: Produto, tipo: "entrada" | "saida") {
    setMovendoId(p.id);
    setMovimento({ tipo, quantidade: "", minimo: String(p.estoque_minimo) });
  }

  async function salvarMovimento(p: Produto) {
    const qtd = Number(movimento.quantidade);
    const minimo = Number(movimento.minimo);
    setSalvando(true);
    if (qtd > 0) await ajustarEstoque(p.id, Number(p.quantidade_estoque), movimento.tipo === "entrada" ? qtd : -qtd);
    if (Number.isFinite(minimo) && minimo >= 0 && minimo !== Number(p.estoque_minimo)) {
      await atualizarProduto(p.id, {
        nome: p.nome,
        custo: Number(p.custo),
        preco_venda: Number(p.preco_venda),
        quantidade_estoque: qtd > 0 ? Math.max(0, Number(p.quantidade_estoque) + (movimento.tipo === "entrada" ? qtd : -qtd)) : Number(p.quantidade_estoque),
        estoque_minimo: minimo,
        fornecedor_id: p.fornecedor_id ?? null,
      });
    }
    setSalvando(false);
    setMovendoId(null);
    carregar();
  }

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Gestão de estoque</h1>
          <p className="text-body text-muted">Quantidades, entradas e saídas — e quando é hora de repor.</p>
        </div>
        <Link href="/dashboard/empresa/produtos">
          <Button variant="secondary">Catálogo de produtos</Button>
        </Link>
      </div>

      {!carregando && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="flex flex-col gap-2">
            <p className="text-small text-muted">Valor do estoque (pelo custo)</p>
            <p className="text-h3 text-foreground">{formatarMoeda(valorDoEstoque(produtos))}</p>
          </Card>
          <Card className="flex flex-col gap-2">
            <p className="text-small text-muted">Itens abaixo do mínimo</p>
            <p className="text-h3 text-foreground">{produtos.filter((p) => estoqueBaixo(p)).length}</p>
          </Card>
          <Card className="flex flex-col gap-2">
            <p className="text-small text-muted">Capital pra repor o sugerido</p>
            <p className="text-h3 text-foreground">{formatarMoeda(capitalTotal)}</p>
          </Card>
        </div>
      )}

      {sugestoes.length > 0 && (
        <Card padding="lg" className="flex flex-col gap-4 border-amber-200 bg-amber-50/60">
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-amber-700" />
            <h2 className="text-h3 text-foreground">Recomendação de compras</h2>
          </div>
          <p className="text-small text-foreground">
            Baseado no giro dos últimos 60 dias e no prazo de entrega de cada fornecedor (padrão: 7 dias). A quantidade cobre o prazo de entrega + 30 dias.
          </p>
          <div className="flex flex-col gap-2">
            {sugestoes.map((s) => (
              <div key={s.produto.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-body font-semibold text-foreground">{s.produto.nome}</p>
                    {s.urgente && <Badge variant="danger" size="sm">Urgente</Badge>}
                  </div>
                  <p className="text-small text-muted">
                    Tem {s.produto.quantidade_estoque} · vende ~{s.vendaSemanal.toFixed(1)}/semana
                    {s.diasDeEstoque != null ? ` · dura ~${s.diasDeEstoque} dias` : ""} · ponto de reposição {s.pontoReposicao}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <Truck size={12} />
                    {s.fornecedor ? `${s.fornecedor.nome}: ` : "Sem fornecedor definido: "}
                    entrega em {s.prazoEntrega} dias
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-body font-semibold text-foreground">Comprar {s.quantidadeSugerida} un.</p>
                  <p className="text-small text-muted">{formatarMoeda(s.capitalNecessario)} de capital de giro</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : produtos.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <Boxes size={28} className="text-accent-700" />
          <p className="text-body text-muted">Cadastre produtos no Catálogo pra controlar o estoque aqui.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {produtos.map((p) => {
            const baixo = estoqueBaixo(p);
            return (
              <Card key={p.id} padding="sm" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body font-medium text-foreground">{p.nome}</p>
                      {baixo && (
                        <Badge variant="warning" size="sm">
                          <AlertTriangle size={12} />
                          Abaixo do mínimo
                        </Badge>
                      )}
                    </div>
                    <p className="text-small text-muted">
                      Mínimo {p.estoque_minimo} · custo {formatarMoeda(Number(p.custo))} · total {formatarMoeda(Number(p.custo) * Number(p.quantidade_estoque))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="min-w-[56px] text-right text-h3 text-foreground">{p.quantidade_estoque}</p>
                    <Button size="sm" variant="tertiary" onClick={() => abrirMovimento(p, "saida")} aria-label="Registrar saída">
                      <Minus size={16} />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => abrirMovimento(p, "entrada")} aria-label="Registrar entrada">
                      <Plus size={16} />
                    </Button>
                  </div>
                </div>
                {movendoId === p.id && (
                  <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        label={movimento.tipo === "entrada" ? "Quantidade que entrou" : "Quantidade que saiu (perda, uso, ajuste)"}
                        inputMode="numeric"
                        value={movimento.quantidade}
                        onChange={(e) => setMovimento((m) => ({ ...m, quantidade: e.target.value.replace(/\D/g, "") }))}
                        autoFocus
                      />
                      <Input
                        label="Estoque mínimo"
                        inputMode="numeric"
                        value={movimento.minimo}
                        onChange={(e) => setMovimento((m) => ({ ...m, minimo: e.target.value.replace(/\D/g, "") }))}
                      />
                    </div>
                    <p className="text-xs text-muted">Vendas já dão baixa sozinhas — use isto pra compras, perdas ou ajustes de contagem.</p>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={salvando} onClick={() => salvarMovimento(p)}>Salvar</Button>
                      <Button size="sm" variant="tertiary" onClick={() => setMovendoId(null)}>Cancelar</Button>
                    </div>
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
