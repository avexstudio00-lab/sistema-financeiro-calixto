"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Phone, Mail, Package, Receipt, Truck, MessageCircle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { formatarMoeda } from "@/lib/format";
import { linkWhatsApp } from "@/lib/util/texto";
import type { ContaPagar, Fornecedor, Produto } from "@/lib/data/tipos";

interface ItemCompra {
  produto_id: string;
  nome?: string;
  quantidade: number;
  custo_unitario: number;
}

/**
 * Dossiê financeiro do fornecedor (item 4.17 da especificação de
 * 09/out/2026): total já pago, o que falta pagar em faturas futuras e a
 * lista do que foi comprado dele (mercadorias ligadas ao estoque pelas
 * contas a pagar, e produtos cadastrados com ele como fornecedor).
 */
export default function DossieFornecedorPage() {
  const params = useParams<{ id: string }>();
  const fornecedorId = params?.id;
  const { negocio, papel } = useAuth();
  const [fornecedor, setFornecedor] = React.useState<Fornecedor | null>(null);
  const [contas, setContas] = React.useState<ContaPagar[]>([]);
  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [carregando, setCarregando] = React.useState(true);

  React.useEffect(() => {
    if (!negocio || !fornecedorId || papel === "funcionario") return;
    (async () => {
      setCarregando(true);
      const [{ data: f }, { data: c }, { data: p }] = await Promise.all([
        supabase.from("fornecedores").select("*").eq("id", fornecedorId).maybeSingle(),
        supabase.from("contas_pagar").select("*").eq("fornecedor_id", fornecedorId).order("vencimento", { ascending: false }),
        supabase.from("produtos").select("*").eq("fornecedor_id", fornecedorId).order("nome"),
      ]);
      setFornecedor((f as Fornecedor | null) ?? null);
      setContas((c as ContaPagar[]) ?? []);
      setProdutos((p as Produto[]) ?? []);
      setCarregando(false);
    })();
  }, [negocio, fornecedorId, papel]);

  if (papel === "funcionario") {
    return (
      <Container full className="py-8">
        <p className="text-body text-muted">Só o dono ou sócio vê o financeiro de fornecedores.</p>
      </Container>
    );
  }
  if (carregando) {
    return (
      <Container full className="py-8">
        <p className="py-8 text-center text-body text-muted">Carregando dossiê...</p>
      </Container>
    );
  }
  if (!fornecedor) {
    return (
      <Container full className="flex flex-col gap-4 py-8">
        <p className="text-body text-foreground">Fornecedor não encontrado.</p>
        <Link href="/dashboard/empresa/clientes-fornecedores" className="text-small font-semibold text-accent-700">Voltar</Link>
      </Container>
    );
  }

  const pagas = contas.filter((c) => c.status === "pago");
  const pendentes = contas.filter((c) => c.status === "pendente");
  const totalPago = pagas.reduce((a, c) => a + Number(c.valor), 0);
  const totalPendente = pendentes.reduce((a, c) => a + Number(c.valor), 0);
  const hoje = new Date().toISOString().slice(0, 10);
  const nomeProduto = new Map(produtos.map((p) => [p.id, p.nome]));

  // Itens comprados (de contas a pagar ligadas ao estoque — item 6.3).
  const itensComprados = new Map<string, { nome: string; quantidade: number; total: number }>();
  for (const c of contas) {
    const itens = (Array.isArray((c as ContaPagar & { itens_estoque?: unknown }).itens_estoque)
      ? (c as ContaPagar & { itens_estoque: ItemCompra[] }).itens_estoque
      : []) as ItemCompra[];
    for (const i of itens) {
      const atual = itensComprados.get(i.produto_id) ?? { nome: i.nome ?? nomeProduto.get(i.produto_id) ?? "Produto", quantidade: 0, total: 0 };
      atual.quantidade += Number(i.quantidade);
      atual.total += Number(i.quantidade) * Number(i.custo_unitario);
      itensComprados.set(i.produto_id, atual);
    }
  }
  const whats = linkWhatsApp(fornecedor.telefone, `Olá! Aqui é da ${negocio?.nome ?? "empresa"}.`);

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/empresa/clientes-fornecedores" className="flex items-center gap-1 self-start text-small font-semibold text-accent-700">
          <ArrowLeft size={16} />
          Fornecedores
        </Link>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-h2 text-foreground">
              <Truck size={22} className="shrink-0 text-accent-700" />
              <span className="truncate">{fornecedor.nome}</span>
            </h1>
            <div className="flex flex-wrap gap-3 text-small text-muted">
              {fornecedor.telefone && <span className="flex items-center gap-1"><Phone size={13} />{fornecedor.telefone}</span>}
              {fornecedor.email && <span className="flex items-center gap-1"><Mail size={13} />{fornecedor.email}</span>}
              {fornecedor.prazo_entrega_dias != null && <span>Entrega em ~{fornecedor.prazo_entrega_dias} dias</span>}
            </div>
          </div>
          {whats && (
            <a href={whats} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">
                <MessageCircle size={16} />
                WhatsApp
              </Button>
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <p className="text-small text-muted">Total já pago</p>
          <p className="text-h3 text-foreground">{formatarMoeda(totalPago)}</p>
          <p className="text-xs text-muted">{pagas.length} pagamento(s)</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <p className="text-small text-muted">Falta pagar</p>
          <p className="text-h3 text-foreground">{formatarMoeda(totalPendente)}</p>
          <p className="text-xs text-muted">{pendentes.length} fatura(s) futura(s)</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <p className="text-small text-muted">Total negociado</p>
          <p className="text-h3 text-foreground">{formatarMoeda(totalPago + totalPendente)}</p>
        </Card>
      </div>

      <Card padding="lg" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-accent-700" />
          <h2 className="text-h3 text-foreground">Mercadorias e insumos comprados</h2>
        </div>
        {itensComprados.size === 0 && produtos.length === 0 ? (
          <p className="text-small text-muted">
            Nenhuma compra com itens de estoque ainda. Ao lançar uma conta a pagar deste fornecedor, ligue os produtos comprados para
            dar entrada no estoque automaticamente.
          </p>
        ) : (
          <>
            {Array.from(itensComprados.entries()).map(([id, i]) => (
              <div key={id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0">
                <p className="text-small text-foreground">
                  {i.nome} · {i.quantidade} un.
                </p>
                <span className="text-small font-semibold text-foreground">{formatarMoeda(i.total)}</span>
              </div>
            ))}
            {produtos.filter((p) => !itensComprados.has(p.id)).length > 0 && (
              <p className="text-xs text-muted">
                Também fornece: {produtos.filter((p) => !itensComprados.has(p.id)).map((p) => p.nome).join(", ")}
              </p>
            )}
          </>
        )}
      </Card>

      <Card padding="lg" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Receipt size={18} className="text-accent-700" />
          <h2 className="text-h3 text-foreground">Contas a pagar</h2>
        </div>
        {contas.length === 0 ? (
          <p className="text-small text-muted">Nenhuma conta lançada para este fornecedor.</p>
        ) : (
          contas.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0">
              <div className="min-w-0">
                <p className="text-small text-foreground">{c.descricao}</p>
                <p className="text-xs text-muted">
                  {c.status === "pago" && c.data_pagamento
                    ? `Paga em ${new Date(c.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR")}`
                    : `Vence ${new Date(c.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {c.status === "pago" ? (
                  <Badge variant="primary" size="sm">Paga</Badge>
                ) : c.vencimento < hoje ? (
                  <Badge variant="danger" size="sm">Vencida</Badge>
                ) : (
                  <Badge variant="neutral" size="sm">Pendente</Badge>
                )}
                <span className="text-small font-semibold text-foreground">{formatarMoeda(Number(c.valor))}</span>
              </div>
            </div>
          ))
        )}
      </Card>
    </Container>
  );
}
