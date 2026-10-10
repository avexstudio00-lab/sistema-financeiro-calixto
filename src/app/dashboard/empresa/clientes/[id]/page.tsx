"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Phone, Mail, ShoppingCart, ClipboardList, Receipt, MessageCircle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ROTULO_STATUS_ORCAMENTO, resumirOrcamentosCliente } from "@/lib/data/orcamentos";
import { estaAtrasada } from "@/lib/data/contasEmpresa";
import { carregarDossieCliente } from "@/lib/data/clientes";
import { formatarMoeda } from "@/lib/format";
import { linkWhatsApp } from "@/lib/util/texto";
import type { Cliente, ContaReceber, Orcamento, Venda } from "@/lib/data/tipos";

/**
 * Dossiê do cliente — visão 360° (item 7.1 da especificação de 03/out/2026):
 * total já faturado (LTV), compras, orçamentos e títulos em aberto, com o
 * histórico de pontualidade dos pagamentos.
 */
export default function DossieClientePage() {
  const params = useParams<{ id: string }>();
  const clienteId = params?.id;
  const { negocio, papel } = useAuth();
  const [cliente, setCliente] = React.useState<Cliente | null>(null);
  const [vendas, setVendas] = React.useState<Venda[]>([]);
  const [orcamentos, setOrcamentos] = React.useState<Orcamento[]>([]);
  const [titulos, setTitulos] = React.useState<ContaReceber[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const veFinanceiro = papel !== "funcionario";

  React.useEffect(() => {
    if (!negocio || !clienteId) return;
    (async () => {
      setCarregando(true);
      // Busca pela chave do cliente, sem o filtro de empresa ativa (item
      // 4.16: corrige totais zerados de cliente recém-cadastrado).
      const d = await carregarDossieCliente(clienteId, veFinanceiro);
      setCliente(d.cliente);
      setVendas(d.vendas);
      setOrcamentos(d.orcamentos);
      setTitulos(d.titulos);
      setCarregando(false);
    })();
  }, [negocio, clienteId, veFinanceiro]);

  if (carregando) {
    return (
      <Container full className="py-8">
        <p className="py-8 text-center text-body text-muted">Carregando dossiê...</p>
      </Container>
    );
  }
  if (!cliente) {
    return (
      <Container full className="flex flex-col gap-4 py-8">
        <p className="text-body text-foreground">Cliente não encontrado.</p>
        <Link href="/dashboard/empresa/clientes-fornecedores" className="text-small font-semibold text-accent-700">Voltar</Link>
      </Container>
    );
  }

  const ltv = vendas.reduce((acc, v) => acc + Number(v.valor_total), 0);
  const recebidos = titulos.filter((t) => t.status === "recebido");
  const emDia = recebidos.filter((t) => t.data_recebimento && t.data_recebimento <= t.vencimento).length;
  const pontualidade = recebidos.length ? Math.round((emDia / recebidos.length) * 100) : null;
  const abertos = titulos.filter((t) => t.status === "pendente");
  const vencidos = abertos.filter((t) => estaAtrasada(t));
  const totalAberto = abertos.reduce((acc, t) => acc + Number(t.valor), 0);
  const whats = linkWhatsApp(cliente.telefone, `Olá, ${cliente.nome.split(" ")[0]}!`);
  const pipeline = resumirOrcamentosCliente(orcamentos);

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/empresa/clientes-fornecedores" className="flex items-center gap-1 self-start text-small font-semibold text-accent-700">
          <ArrowLeft size={16} />
          Clientes
        </Link>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-h2 text-foreground">{cliente.nome}</h1>
            <div className="flex flex-wrap gap-3 text-small text-muted">
              {cliente.telefone && <span className="flex items-center gap-1"><Phone size={13} />{cliente.telefone}</span>}
              {cliente.email && <span className="flex items-center gap-1"><Mail size={13} />{cliente.email}</span>}
              <span>Cliente desde {new Date(cliente.criado_em).toLocaleDateString("pt-BR")}</span>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col gap-2">
          <p className="text-small text-muted">Total já faturado (LTV)</p>
          <p className="text-h3 text-foreground">{formatarMoeda(ltv)}</p>
          <p className="text-xs text-muted">{vendas.length} compra{vendas.length === 1 ? "" : "s"}</p>
        </Card>
        <Card className="flex flex-col gap-2">
          <p className="text-small text-muted">Ticket médio</p>
          <p className="text-h3 text-foreground">{formatarMoeda(vendas.length ? ltv / vendas.length : 0)}</p>
        </Card>
        {veFinanceiro && (
          <>
            <Card className={vencidos.length ? "flex flex-col gap-2 border-rose-200 bg-rose-50/60" : "flex flex-col gap-2"}>
              <p className="text-small text-muted">Em aberto</p>
              <p className="text-h3 text-foreground">{formatarMoeda(totalAberto)}</p>
              {vencidos.length > 0 && <p className="text-xs text-rose-800">{vencidos.length} parcela(s) vencida(s)</p>}
            </Card>
            <Card className="flex flex-col gap-2">
              <p className="text-small text-muted">Pontualidade</p>
              <p className="text-h3 text-foreground">{pontualidade == null ? "—" : `${pontualidade}%`}</p>
              <p className="text-xs text-muted">{recebidos.length ? `${emDia} de ${recebidos.length} pagas em dia` : "Sem histórico de pagamento"}</p>
            </Card>
          </>
        )}
      </div>

      {veFinanceiro && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-small text-muted">Total orçado (pipeline)</p>
            <p className="text-h3 text-foreground">{formatarMoeda(pipeline.totalOrcado)}</p>
          </div>
          <div className="grid gap-2 text-small sm:grid-cols-3">
            <p className="text-muted">Em análise ({pipeline.emAnalise.quantidade}): <strong className="text-foreground">{formatarMoeda(pipeline.emAnalise.valor)}</strong></p>
            <p className="text-muted">Aprovados ({pipeline.aprovados.quantidade}): <strong className="text-primary-700">{formatarMoeda(pipeline.aprovados.valor)}</strong></p>
            <p className="text-muted">Perdidos ({pipeline.perdidos.quantidade}): <strong className="text-rose-700">{formatarMoeda(pipeline.perdidos.valor)}</strong></p>
          </div>
          {pipeline.totalOrcado > 0 && (
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/15">
              <div className="bg-amber-500" style={{ width: `${(pipeline.emAnalise.valor / pipeline.totalOrcado) * 100}%` }} />
              <div className="bg-primary-700" style={{ width: `${(pipeline.aprovados.valor / pipeline.totalOrcado) * 100}%` }} />
              <div className="bg-rose-600" style={{ width: `${(pipeline.perdidos.valor / pipeline.totalOrcado) * 100}%` }} />
            </div>
          )}
        </Card>
      )}

      {veFinanceiro && abertos.length > 0 && (
        <Card padding="lg" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-accent-700" />
            <h2 className="text-h3 text-foreground">Títulos em aberto</h2>
          </div>
          {abertos.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/5 px-3 py-2">
              <div className="min-w-0">
                <p className="text-small font-medium text-foreground">{t.descricao}</p>
                <p className="text-xs text-muted">Vence {new Date(t.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}</p>
              </div>
              <div className="flex items-center gap-2">
                {estaAtrasada(t) && <Badge variant="danger" size="sm">Vencida</Badge>}
                <span className="text-small font-semibold text-foreground">{formatarMoeda(Number(t.valor))}</span>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card padding="lg" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart size={18} className="text-accent-700" />
          <h2 className="text-h3 text-foreground">Compras</h2>
        </div>
        {vendas.length === 0 ? (
          <p className="text-small text-muted">Nenhuma compra registrada.</p>
        ) : (
          vendas.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0">
              <p className="text-small text-foreground">
                {v.produto_nome} · {v.quantidade}x
                <span className="text-muted"> · {new Date(v.data + "T00:00:00").toLocaleDateString("pt-BR")}</span>
              </p>
              <span className="text-small font-semibold text-foreground">{formatarMoeda(Number(v.valor_total))}</span>
            </div>
          ))
        )}
      </Card>

      {veFinanceiro && (
        <Card padding="lg" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-accent-700" />
            <h2 className="text-h3 text-foreground">Orçamentos</h2>
          </div>
          {orcamentos.length === 0 ? (
            <p className="text-small text-muted">Nenhum orçamento emitido.</p>
          ) : (
            orcamentos.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-small text-foreground">{o.titulo}</p>
                  <p className="text-xs text-muted">{new Date(o.criado_em).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={o.status === "fechado" ? "primary" : o.status === "perdido" ? "danger" : "neutral"} size="sm">
                    {ROTULO_STATUS_ORCAMENTO[o.status]}
                  </Badge>
                  <span className="text-small font-semibold text-foreground">{formatarMoeda(Number(o.valor_total))}</span>
                </div>
              </div>
            ))
          )}
        </Card>
      )}
    </Container>
  );
}
