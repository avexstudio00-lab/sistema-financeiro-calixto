"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, ClipboardList, Trash2, Pencil, MessageCircle, BellRing, CheckCircle2, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateMaskInput } from "@/components/ui/DateMaskInput";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useEmpresa } from "@/lib/empresa/EmpresaProvider";
import { listarClientes } from "@/lib/data/clientes";
import { listarServicos, rotuloPrecoServico } from "@/lib/data/servicos";
import { listarProdutos } from "@/lib/data/produtos";
import {
  listarOrcamentos,
  criarOrcamento,
  atualizarOrcamento,
  mudarStatusOrcamento,
  registrarContatoOrcamento,
  excluirOrcamento,
  precisaFollowUp,
  totalDosItens,
  gerarContaReceberDoOrcamento,
  registrarVendasDoOrcamento,
  mensagemFollowUp,
  ROTULO_STATUS_ORCAMENTO,
  DIAS_FOLLOW_UP,
} from "@/lib/data/orcamentos";
import { formatarMoeda } from "@/lib/format";
import { linkWhatsApp, hojeIso, somarDias } from "@/lib/util/texto";
import { cn } from "@/lib/utils";
import type { Cliente, ItemOrcamento, Orcamento, Produto, Servico, StatusOrcamento } from "@/lib/data/tipos";

const classeSelect =
  "h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100";

const STATUS: StatusOrcamento[] = ["orcado", "negociacao", "fechado", "perdido"];

const VARIANTE_STATUS: Record<StatusOrcamento, "neutral" | "warning" | "primary" | "danger"> = {
  orcado: "neutral",
  negociacao: "warning",
  fechado: "primary",
  perdido: "danger",
};

function parsear(texto: string): number {
  const n = Number(texto.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

interface LinhaForm {
  tipo: ItemOrcamento["tipo"];
  ref_id: string;
  descricao: string;
  quantidade: string;
  valor: string;
}

const LINHA_VAZIA: LinhaForm = { tipo: "livre", ref_id: "", descricao: "", quantidade: "1", valor: "" };

/**
 * Orçamentos comerciais (itens 5.8 e 5.9 da especificação de 03/out/2026):
 * proposta por cliente com itens do catálogo, validade e status. Fechar gera
 * o título no Contas a Receber; propostas paradas há 3+ dias ganham alerta de
 * follow-up com atalho pro WhatsApp do cliente.
 */
export default function OrcamentosPage() {
  const { negocio, papel } = useAuth();
  const { empresaAtiva } = useEmpresa();
  const router = useRouter();
  const [orcamentos, setOrcamentos] = React.useState<Orcamento[]>([]);
  const [clientes, setClientes] = React.useState<Cliente[]>([]);
  const [servicos, setServicos] = React.useState<Servico[]>([]);
  const [produtos, setProdutos] = React.useState<Produto[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [filtro, setFiltro] = React.useState<"abertos" | StatusOrcamento>("abertos");

  const [formAberto, setFormAberto] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [titulo, setTitulo] = React.useState("");
  const [clienteId, setClienteId] = React.useState("");
  const [validade, setValidade] = React.useState(() => somarDias(hojeIso(), 15));
  const [observacoes, setObservacoes] = React.useState("");
  const [linhas, setLinhas] = React.useState<LinhaForm[]>([{ ...LINHA_VAZIA }]);
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  // Fechamento: gera o título no Contas a Receber.
  const [fechando, setFechando] = React.useState<Orcamento | null>(null);
  const [parcelasFechamento, setParcelasFechamento] = React.useState("1");
  const [vencimentoFechamento, setVencimentoFechamento] = React.useState(() => hojeIso());
  const [gerarTitulo, setGerarTitulo] = React.useState(true);
  const [confirmandoExclusao, setConfirmandoExclusao] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (papel === "funcionario") router.replace("/dashboard/empresa");
  }, [papel, router]);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    setCarregando(true);
    const [o, c, s, p] = await Promise.all([
      listarOrcamentos(negocio.usuarioId),
      listarClientes(negocio.usuarioId),
      listarServicos(negocio.usuarioId),
      listarProdutos(negocio.usuarioId),
    ]);
    setOrcamentos(o);
    setClientes(c);
    setServicos(s);
    setProdutos(p);
    setCarregando(false);
  }, [negocio]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditandoId(null);
    setTitulo("");
    setClienteId("");
    setValidade(somarDias(hojeIso(), 15));
    setObservacoes("");
    setLinhas([{ ...LINHA_VAZIA }]);
    setErro(null);
    setFormAberto(true);
  }

  function abrirEdicao(o: Orcamento) {
    setEditandoId(o.id);
    setTitulo(o.titulo);
    setClienteId(o.cliente_id ?? "");
    setValidade(o.validade ?? "");
    setObservacoes(o.observacoes ?? "");
    setLinhas(
      o.itens.length
        ? o.itens.map((i) => ({
            tipo: i.tipo,
            ref_id: i.ref_id ?? "",
            descricao: i.descricao,
            quantidade: String(i.quantidade),
            valor: String(i.valor_unitario).replace(".", ","),
          }))
        : [{ ...LINHA_VAZIA }]
    );
    setErro(null);
    setFormAberto(true);
  }

  function escolherItem(indice: number, chave: string) {
    setLinhas((atual) =>
      atual.map((l, i) => {
        if (i !== indice) return l;
        if (!chave) return { ...l, tipo: "livre", ref_id: "" };
        const [tipo, id] = chave.split(":") as ["servico" | "produto", string];
        if (tipo === "servico") {
          const sv = servicos.find((x) => x.id === id);
          return {
            ...l,
            tipo,
            ref_id: id,
            descricao: sv?.nome ?? l.descricao,
            valor: sv?.preco_fixo && sv.preco != null ? String(sv.preco).replace(".", ",") : l.valor,
          };
        }
        const p = produtos.find((x) => x.id === id);
        return { ...l, tipo, ref_id: id, descricao: p?.nome ?? l.descricao, valor: p ? String(p.preco_venda).replace(".", ",") : l.valor };
      })
    );
  }

  const itensValidos: ItemOrcamento[] = linhas
    .filter((l) => l.descricao.trim() && parsear(l.quantidade) > 0 && parsear(l.valor) >= 0)
    .map((l) => ({
      tipo: l.tipo,
      ref_id: l.ref_id || null,
      descricao: l.descricao.trim(),
      quantidade: parsear(l.quantidade),
      valor_unitario: parsear(l.valor),
    }));
  const total = totalDosItens(itensValidos);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!negocio) return;
    if (titulo.trim().length < 2) return setErro("Dê um título ao orçamento.");
    if (itensValidos.length === 0) return setErro("Inclua pelo menos um item com descrição, quantidade e valor.");
    setSalvando(true);
    const dados = {
      cliente_id: clienteId || null,
      titulo,
      itens: itensValidos,
      validade: validade || null,
      observacoes: observacoes.trim() || null,
    };
    const { error } = editandoId
      ? await atualizarOrcamento(editandoId, dados)
      : await criarOrcamento({ ...dados, usuario_id: negocio.usuarioId });
    setSalvando(false);
    if (error) return setErro("Não foi possível salvar. Tente de novo.");
    setFormAberto(false);
    carregar();
  }

  async function mudarStatus(o: Orcamento, status: StatusOrcamento) {
    if (status === "fechado") {
      setFechando(o);
      setParcelasFechamento("1");
      setVencimentoFechamento(hojeIso());
      setGerarTitulo(true);
      return;
    }
    await mudarStatusOrcamento(o.id, status);
    carregar();
  }

  async function confirmarFechamento() {
    if (!fechando) return;
    setSalvando(true);
    await mudarStatusOrcamento(fechando.id, "fechado");
    if (gerarTitulo) {
      await gerarContaReceberDoOrcamento(fechando, Number(parcelasFechamento) || 1, vencimentoFechamento);
      await registrarVendasDoOrcamento(fechando);
    }
    setSalvando(false);
    setFechando(null);
    carregar();
  }

  async function excluir(id: string) {
    await excluirOrcamento(id);
    setConfirmandoExclusao(null);
    carregar();
  }

  const parados = orcamentos.filter((o) => precisaFollowUp(o));
  const visiveis = orcamentos.filter((o) =>
    filtro === "abertos" ? o.status === "orcado" || o.status === "negociacao" : o.status === filtro
  );
  const totalEmAberto = orcamentos
    .filter((o) => o.status === "orcado" || o.status === "negociacao")
    .reduce((acc, o) => acc + Number(o.valor_total), 0);
  const fechados = orcamentos.filter((o) => o.status === "fechado").length;
  const decididos = orcamentos.filter((o) => o.status === "fechado" || o.status === "perdido").length;
  const nomeEmpresa = empresaAtiva?.nome_fantasia ?? negocio?.nome ?? "nossa empresa";

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Orçamentos</h1>
          <p className="text-body text-muted">Propostas para seus clientes — do orçado ao fechado.</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus size={18} />
          Novo orçamento
        </Button>
      </div>

      {!carregando && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="flex flex-col gap-2">
            <p className="text-small text-muted">Em aberto</p>
            <p className="text-h3 text-foreground">{formatarMoeda(totalEmAberto)}</p>
          </Card>
          <Card className="flex flex-col gap-2">
            <p className="text-small text-muted">Taxa de fechamento</p>
            <p className="text-h3 text-foreground">{decididos ? `${Math.round((fechados / decididos) * 100)}%` : "—"}</p>
          </Card>
          <Card className={cn("flex flex-col gap-2", parados.length > 0 && "border-amber-200 bg-amber-50/60")}>
            <p className="text-small text-muted">Sem resposta há {DIAS_FOLLOW_UP}+ dias</p>
            <p className="text-h3 text-foreground">{parados.length}</p>
          </Card>
        </div>
      )}

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-h3 text-foreground">{editandoId ? "Editar orçamento" : "Novo orçamento"}</h2>
            <button type="button" aria-label="Fechar" onClick={() => setFormAberto(false)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={salvar} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Site institucional" autoFocus />
              <div className="flex flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Cliente</span>
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={classeSelect}>
                  <option value="">Sem cliente cadastrado</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-small font-medium text-foreground">Itens</span>
              {linhas.map((l, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                  {(servicos.length > 0 || produtos.length > 0) && (
                    <select
                      value={l.ref_id ? `${l.tipo}:${l.ref_id}` : ""}
                      onChange={(e) => escolherItem(i, e.target.value)}
                      className={classeSelect}
                    >
                      <option value="">Item livre (digitar)</option>
                      {servicos.length > 0 && (
                        <optgroup label="Serviços">
                          {servicos.map((sv) => (
                            <option key={sv.id} value={`servico:${sv.id}`}>{sv.nome} · {rotuloPrecoServico(sv)}</option>
                          ))}
                        </optgroup>
                      )}
                      {produtos.length > 0 && (
                        <optgroup label="Produtos">
                          {produtos.map((p) => (
                            <option key={p.id} value={`produto:${p.id}`}>{p.nome} · {formatarMoeda(Number(p.preco_venda))}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  )}
                  <div className="grid gap-2 sm:grid-cols-[1fr_90px_140px_auto]">
                    <Input
                      aria-label="Descrição do item"
                      placeholder="Descrição"
                      value={l.descricao}
                      onChange={(e) => setLinhas((a) => a.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))}
                    />
                    <Input
                      aria-label="Quantidade"
                      inputMode="decimal"
                      value={l.quantidade}
                      onChange={(e) => setLinhas((a) => a.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))}
                    />
                    <Input
                      aria-label="Valor unitário"
                      inputMode="decimal"
                      placeholder="Valor"
                      value={l.valor}
                      onChange={(e) => setLinhas((a) => a.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                    />
                    <button
                      type="button"
                      aria-label="Remover item"
                      disabled={linhas.length === 1}
                      onClick={() => setLinhas((a) => a.filter((_, j) => j !== i))}
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-muted/10 disabled:opacity-40"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              <Button type="button" size="sm" variant="tertiary" className="self-start" onClick={() => setLinhas((a) => [...a, { ...LINHA_VAZIA }])}>
                <Plus size={16} />
                Adicionar item
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DateMaskInput label="Válido até" value={validade} onChange={setValidade} />
              <div className="flex flex-col justify-end">
                <p className="text-small text-muted">Valor global cotado</p>
                <p className="text-h3 text-foreground">{formatarMoeda(total)}</p>
              </div>
            </div>
            <Input label="Observações (opcional)" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Prazo de entrega, condições de pagamento..." />
            {erro && <p className="text-small text-rose-700">{erro}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={salvando} className="flex-1">{salvando ? "Salvando..." : "Salvar orçamento"}</Button>
              <Button type="button" variant="tertiary" onClick={() => setFormAberto(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {fechando && (
        <Card padding="lg" className="flex flex-col gap-4 border-primary-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-primary-700" />
            <h2 className="text-h3 text-foreground">Fechar &quot;{fechando.titulo}&quot; — {formatarMoeda(Number(fechando.valor_total))}</h2>
          </div>
          <label className="flex items-center gap-2 text-small text-foreground">
            <input type="checkbox" checked={gerarTitulo} onChange={(e) => setGerarTitulo(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
            Gerar o título no Contas a Receber e registrar os itens nas vendas
          </label>
          {gerarTitulo && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Parcelas" inputMode="numeric" value={parcelasFechamento} onChange={(e) => setParcelasFechamento(e.target.value.replace(/\D/g, ""))} />
              <DateMaskInput label="1º vencimento" value={vencimentoFechamento} onChange={setVencimentoFechamento} />
            </div>
          )}
          <div className="flex gap-2">
            <Button disabled={salvando} onClick={confirmarFechamento}>{salvando ? "Fechando..." : "Confirmar fechamento"}</Button>
            <Button variant="tertiary" onClick={() => setFechando(null)}>Cancelar</Button>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-1 self-start rounded-full bg-muted/10 p-1">
        {(["abertos", ...STATUS] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={cn(
              "rounded-full px-3 py-1.5 text-small font-medium",
              filtro === f ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground"
            )}
          >
            {f === "abertos" ? "Em aberto" : ROTULO_STATUS_ORCAMENTO[f]}
          </button>
        ))}
      </div>

      {carregando ? (
        <p className="py-8 text-center text-body text-muted">Carregando...</p>
      ) : visiveis.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <ClipboardList size={28} className="text-accent-700" />
          <p className="text-body text-muted">Nenhum orçamento aqui.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {visiveis.map((o) => {
            const parado = precisaFollowUp(o);
            const link = linkWhatsApp(o.clientes?.telefone, mensagemFollowUp(o, nomeEmpresa));
            const vencido = o.validade && o.validade < hojeIso() && (o.status === "orcado" || o.status === "negociacao");
            return (
              <Card key={o.id} className={cn("flex flex-col gap-3", parado && "border-amber-200 bg-amber-50/60")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-body font-semibold text-foreground">{o.titulo}</p>
                      <Badge variant={VARIANTE_STATUS[o.status]} size="sm">{ROTULO_STATUS_ORCAMENTO[o.status]}</Badge>
                      {vencido && <Badge variant="danger" size="sm">Validade vencida</Badge>}
                    </div>
                    <p className="text-small text-muted">
                      {o.clientes?.nome ?? "Sem cliente"} · {o.itens.length} {o.itens.length === 1 ? "item" : "itens"}
                      {o.validade ? ` · válido até ${new Date(o.validade + "T00:00:00").toLocaleDateString("pt-BR")}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-h3 text-foreground">{formatarMoeda(Number(o.valor_total))}</p>
                </div>

                {parado && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-3">
                    <BellRing size={16} className="text-amber-700" />
                    <p className="text-small text-amber-900">Sem atualização há {DIAS_FOLLOW_UP}+ dias. Que tal falar com o cliente?</p>
                    {link ? (
                      <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => void registrarContatoOrcamento(o.id).then(carregar)}>
                        <Button size="sm">
                          <MessageCircle size={14} />
                          Entrar em contato
                        </Button>
                      </a>
                    ) : (
                      <span className="text-xs text-muted">(cadastre o telefone do cliente pra usar o WhatsApp)</span>
                    )}
                    <Button size="sm" variant="tertiary" onClick={() => void registrarContatoOrcamento(o.id).then(carregar)}>
                      Já falei
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Status do orçamento"
                    value={o.status}
                    onChange={(e) => mudarStatus(o, e.target.value as StatusOrcamento)}
                    className="h-9 rounded-lg border border-border bg-card px-2 text-small text-foreground"
                  >
                    {STATUS.map((st) => (
                      <option key={st} value={st}>{ROTULO_STATUS_ORCAMENTO[st]}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="tertiary" onClick={() => abrirEdicao(o)}>
                    <Pencil size={14} />
                    Editar
                  </Button>
                  {confirmandoExclusao === o.id ? (
                    <>
                      <Button size="sm" variant="tertiary" onClick={() => setConfirmandoExclusao(null)}>Não</Button>
                      <Button size="sm" onClick={() => excluir(o.id)} className="bg-red-500 shadow-none hover:bg-red-600">Apagar</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="tertiary" onClick={() => setConfirmandoExclusao(o.id)}>
                      <Trash2 size={14} />
                    </Button>
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
