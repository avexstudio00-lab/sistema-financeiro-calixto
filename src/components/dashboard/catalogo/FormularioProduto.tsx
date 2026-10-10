"use client";

import * as React from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { criarProduto, atualizarProduto } from "@/lib/data/produtos";
import { cn } from "@/lib/utils";
import type { Fornecedor, Produto } from "@/lib/data/tipos";

interface FormularioProdutoCampos {
  nome: string;
  custo: string;
  precoVenda: string;
  quantidade: string;
  estoqueMinimo: string;
  fornecedorId: string;
}

const FORM_VAZIO: FormularioProdutoCampos = { nome: "", custo: "", precoVenda: "", quantidade: "", estoqueMinimo: "", fornecedorId: "" };

/**
 * Formulário de cadastro/edição de produto — o MESMO usado no Catálogo de
 * produtos, na Venda, no Orçamento e na compra de fornecedor (itens
 * 6.1/12.1/6.3 da especificação de 09/out/2026).
 */
export function FormularioProduto({
  contaMestreId,
  produto,
  fornecedores = [],
  onSalvo,
  onCancelar,
  compacto = false,
  nomeInicial = "",
}: {
  contaMestreId: string;
  produto?: Produto | null;
  fornecedores?: Fornecedor[];
  onSalvo: (p: Produto) => void;
  onCancelar: () => void;
  compacto?: boolean;
  nomeInicial?: string;
}) {
  const [form, setForm] = React.useState<FormularioProdutoCampos>(() =>
    produto
      ? {
          nome: produto.nome,
          custo: String(produto.custo).replace(".", ","),
          precoVenda: String(produto.preco_venda).replace(".", ","),
          quantidade: String(produto.quantidade_estoque),
          estoqueMinimo: String(produto.estoque_minimo),
          fornecedorId: produto.fornecedor_id ?? "",
        }
      : { ...FORM_VAZIO, nome: nomeInicial }
  );
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
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
      fornecedor_id: form.fornecedorId || null,
    };
    if (produto) {
      const { error } = await atualizarProduto(produto.id, dados);
      setSalvando(false);
      if (error) return setErro("Não foi possível salvar. Tente novamente.");
      onSalvo({ ...produto, ...dados });
      return;
    }
    const { data, error } = await criarProduto({ usuario_id: contaMestreId, ...dados });
    setSalvando(false);
    if (error || !data) {
      setErro("Não foi possível salvar. Tente novamente.");
      return;
    }
    onSalvo(data as Produto);
  }

  return (
    <Card padding={compacto ? "md" : "lg"} className={cn("flex flex-col gap-4", compacto && "border border-primary-200")}>
      <h2 className={compacto ? "text-body font-semibold text-foreground" : "text-h3 text-foreground"}>{produto ? "Editar produto" : "Novo produto"}</h2>
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
        {fornecedores.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-foreground">Fornecedor principal (opcional)</span>
            <select
              value={form.fornecedorId}
              onChange={(e) => setForm((f) => ({ ...f, fornecedorId: e.target.value }))}
              className="h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
            >
              <option value="">Nenhum</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">Usado na sugestão de reposição (prazo de entrega do fornecedor).</span>
          </div>
        )}
        {erro && <p className="text-small text-rose-600">{erro}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={salvando} className="flex-1">
            {salvando ? "Salvando..." : "Salvar produto"}
          </Button>
          <Button type="button" variant="tertiary" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
