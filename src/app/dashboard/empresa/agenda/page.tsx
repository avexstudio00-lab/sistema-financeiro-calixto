"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, MessageCircle, Pencil, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { SeletorParceiro } from "@/components/dashboard/SeletorParceiro";
import { MensagemWhatsAppDialog } from "@/components/dashboard/MensagemWhatsAppDialog";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useEmpresa } from "@/lib/empresa/EmpresaProvider";
import { listarClientes } from "@/lib/data/clientes";
import { listarServicos } from "@/lib/data/servicos";
import {
  ROTULO_STATUS_AGENDA,
  atualizarAgendamento,
  criarAgendamento,
  dataLocalIso,
  excluirAgendamento,
  horaLocal,
  listarAgendamentos,
  localParaIso,
  mensagemConfirmacaoAgenda,
  mudarStatusAgendamento,
} from "@/lib/data/agenda";
import { formatarMoeda } from "@/lib/format";
import { hojeIso, somarDias } from "@/lib/util/texto";
import { cn } from "@/lib/utils";
import type { Agendamento, Cliente, Servico, StatusAgendamento } from "@/lib/data/tipos";

/**
 * Agenda de serviços (13/nov/2026, pedido do usuário): marcar cliente,
 * serviço, dia e hora. Lembrete no celular de manhã, confirmação pronta no
 * WhatsApp e, no dia, "Virar venda" abre Vendas com tudo preenchido.
 */

const VARIANTE: Record<StatusAgendamento, "primary" | "accent" | "neutral" | "danger" | "warning"> = {
  marcado: "warning",
  confirmado: "accent",
  concluido: "primary",
  cancelado: "neutral",
  faltou: "danger",
};

const classeSelect =
  "h-11 w-full rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100";

function inicioDaSemana(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const dia = d.getDay(); // 0 = domingo
  return somarDias(iso, dia === 0 ? -6 : 1 - dia);
}

function lerValor(texto: string): number | null {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function AgendaPage() {
  const { negocio } = useAuth();
  const { empresaAtiva, empresas } = useEmpresa();
  const nomeEmpresa = empresaAtiva?.nome_fantasia ?? empresas[0]?.nome_fantasia ?? negocio?.nome ?? "";
  const hoje = hojeIso();

  const [diaSelecionado, setDiaSelecionado] = React.useState(hoje);
  const [semana, setSemana] = React.useState(() => inicioDaSemana(hoje));
  const [agendamentos, setAgendamentos] = React.useState<Agendamento[]>([]);
  const [erroTabela, setErroTabela] = React.useState<string | null>(null);
  const [clientes, setClientes] = React.useState<Cliente[]>([]);
  const [servicos, setServicos] = React.useState<Servico[]>([]);
  const [carregando, setCarregando] = React.useState(true);

  const [formAberto, setFormAberto] = React.useState(false);
  const [editandoId, setEditandoId] = React.useState<string | null>(null);
  const [clienteId, setClienteId] = React.useState("");
  const [servicoId, setServicoId] = React.useState("");
  const [descricao, setDescricao] = React.useState("");
  const [dataForm, setDataForm] = React.useState(hoje);
  const [hora, setHora] = React.useState("09:00");
  const [duracao, setDuracao] = React.useState("60");
  const [valor, setValor] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [confirmando, setConfirmando] = React.useState<Agendamento | null>(null);
  const [apagandoId, setApagandoId] = React.useState<string | null>(null);

  const dias = React.useMemo(() => Array.from({ length: 7 }, (_, i) => somarDias(semana, i)), [semana]);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    const inicio = new Date(semana + "T00:00:00").toISOString();
    const fim = new Date(somarDias(semana, 7) + "T00:00:00").toISOString();
    const [r, c, s] = await Promise.all([
      listarAgendamentos(negocio.usuarioId, inicio, fim),
      listarClientes(negocio.usuarioId),
      listarServicos(negocio.usuarioId),
    ]);
    setAgendamentos(r.lista);
    setErroTabela(r.erro);
    setClientes(c);
    setServicos(s);
    setCarregando(false);
  }, [negocio, semana]);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  const doDia = agendamentos.filter((a) => dataLocalIso(a.inicio) === diaSelecionado);
  const ativosPorDia = (d: string) => agendamentos.filter((a) => dataLocalIso(a.inicio) === d && a.status !== "cancelado").length;
  const previstoDia = doDia.filter((a) => a.status !== "cancelado" && a.status !== "faltou").reduce((acc, a) => acc + Number(a.valor ?? 0), 0);

  function abrirNovo(dia = diaSelecionado) {
    setEditandoId(null);
    setClienteId("");
    setServicoId("");
    setDescricao("");
    setDataForm(dia);
    setHora("09:00");
    setDuracao("60");
    setValor("");
    setObservacoes("");
    setErro(null);
    setFormAberto(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function abrirEdicao(a: Agendamento) {
    setEditandoId(a.id);
    setClienteId(a.cliente_id ?? "");
    setServicoId(a.servico_id ?? "");
    setDescricao(a.descricao);
    setDataForm(dataLocalIso(a.inicio));
    setHora(horaLocal(a.inicio));
    setDuracao(String(a.duracao_min));
    setValor(a.valor != null ? String(a.valor).replace(".", ",") : "");
    setObservacoes(a.observacoes ?? "");
    setErro(null);
    setFormAberto(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function escolherServico(id: string) {
    setServicoId(id);
    const sv = servicos.find((s) => s.id === id);
    if (sv) {
      setDescricao(sv.nome);
      if (sv.preco_fixo && sv.preco != null) setValor(String(sv.preco).replace(".", ","));
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!negocio) return;
    const sv = servicos.find((s) => s.id === servicoId);
    const desc = descricao.trim() || sv?.nome || "";
    if (!desc) return setErro("Escolha o serviço ou escreva o que vai ser feito.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataForm)) return setErro("Escolha o dia.");
    if (!/^\d{2}:\d{2}$/.test(hora)) return setErro("Escolha a hora.");
    const dados = {
      cliente_id: clienteId || null,
      servico_id: servicoId || null,
      descricao: desc,
      inicio: localParaIso(dataForm, hora),
      duracao_min: Math.min(Math.max(Number(duracao) || 60, 5), 1440),
      valor: lerValor(valor),
      observacoes: observacoes.trim() || null,
    };
    setSalvando(true);
    setErro(null);
    const r = editandoId ? await atualizarAgendamento(editandoId, dados) : await criarAgendamento(negocio.usuarioId, dados);
    setSalvando(false);
    if (r.error) {
      console.error("Erro ao salvar agendamento:", r.error);
      return setErro("Não consegui salvar. Tente de novo.");
    }
    setFormAberto(false);
    setDiaSelecionado(dataForm);
    setSemana(inicioDaSemana(dataForm));
    // Horário novo com cliente: já oferece mandar a confirmação.
    if (!editandoId && "data" in r && r.data) {
      const novo = r.data as Agendamento;
      if (novo.cliente_id) setConfirmando(novo);
    }
    void carregar();
  }

  async function mudarStatus(a: Agendamento, status: StatusAgendamento) {
    await mudarStatusAgendamento(a.id, status);
    void carregar();
  }

  async function apagar(id: string) {
    await excluirAgendamento(id);
    setApagandoId(null);
    void carregar();
  }

  const tituloDia = new Date(diaSelecionado + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <Container full className="flex flex-col gap-6 py-8">
      {confirmando && (
        <MensagemWhatsAppDialog
          titulo={`Confirmar com ${confirmando.clientes?.nome?.split(" ")[0] ?? "o cliente"}`}
          subtitulo="Mensagem pronta com dia, hora e serviço. Mude o que quiser antes de mandar."
          textoInicial={mensagemConfirmacaoAgenda(confirmando, nomeEmpresa)}
          telefone={confirmando.clientes?.telefone}
          onFechar={() => setConfirmando(null)}
          onEnviado={() => {
            if (confirmando.status === "marcado") void mudarStatus(confirmando, "confirmado");
          }}
        />
      )}

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Agenda</h1>
          <p className="text-body text-muted">Horários marcados, lembrete no celular e venda com 1 toque.</p>
        </div>
        <Button onClick={() => abrirNovo()}>
          <Plus size={18} />
          Marcar horário
        </Button>
      </div>

      {erroTabela && (
        <Card className="border-amber-200 bg-amber-50/60 text-small text-foreground">
          A agenda ainda está sendo ativada no sistema. Se aparecer este aviso por muito tempo, fale com o suporte.
        </Card>
      )}

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-h3 text-foreground">{editandoId ? "Editar horário" : "Marcar horário"}</h2>
            <button type="button" onClick={() => setFormAberto(false)} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={salvar} className="flex flex-col gap-4">
            {negocio && (
              <SeletorParceiro
                contaMestreId={negocio.usuarioId}
                lista={clientes}
                value={clienteId}
                onChange={setClienteId}
                rotulo="Cliente"
                onCriado={(novo) => setClientes((l) => [...l, novo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")))}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-small font-medium text-foreground">Serviço</span>
                <select value={servicoId} onChange={(e) => escolherServico(e.target.value)} className={classeSelect}>
                  <option value="">{servicos.length ? "Escolha o serviço" : "Nenhum serviço cadastrado"}</option>
                  {servicos.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
                {servicos.length === 0 && (
                  <Link href="/dashboard/empresa/servicos" className="text-xs font-semibold text-accent-700 hover:underline dark:text-accent-300">
                    Cadastrar serviços (pra virar venda com 1 toque)
                  </Link>
                )}
              </div>
              <Input label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Podologia completa" />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-1">
                <Input label="Dia" type="date" value={dataForm} onChange={(e) => setDataForm(e.target.value)} />
              </div>
              <Input label="Hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              <Input label="Duração (min)" inputMode="numeric" value={duracao} onChange={(e) => setDuracao(e.target.value.replace(/\D/g, ""))} />
              <Input label="Valor (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            </div>
            <Input label="Observações (opcional)" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex: trazer exame, prefere manhã" />
            {erro && <p className="text-small text-rose-600">{erro}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : editandoId ? "Salvar" : "Marcar"}
              </Button>
              <Button type="button" variant="tertiary" onClick={() => setFormAberto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setSemana(somarDias(semana, -7))} aria-label="Semana anterior" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => {
              setSemana(inicioDaSemana(hoje));
              setDiaSelecionado(hoje);
            }}
            className="text-small font-semibold text-accent-700 hover:underline dark:text-accent-300"
          >
            Hoje
          </button>
          <button type="button" onClick={() => setSemana(somarDias(semana, 7))} aria-label="Próxima semana" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dias.map((d) => {
            const dt = new Date(d + "T00:00:00");
            const qtd = ativosPorDia(d);
            const ativo = d === diaSelecionado;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDiaSelecionado(d)}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-center transition-colors",
                  ativo ? "bg-accent-600 text-white" : d === hoje ? "bg-accent-50 text-accent-800 dark:bg-accent-900/20 dark:text-accent-200" : "text-foreground hover:bg-muted/10"
                )}
              >
                <span className="text-[11px] uppercase opacity-80">{dt.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
                <span className="text-body font-semibold">{dt.getDate()}</span>
                <span className={cn("h-1.5 w-1.5 rounded-full", qtd ? (ativo ? "bg-white" : "bg-accent-500") : "bg-transparent")} />
              </button>
            );
          })}
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-h3 text-foreground first-letter:uppercase">{tituloDia}</h2>
          {previstoDia > 0 && <p className="text-small text-muted">Previsto: {formatarMoeda(previstoDia)}</p>}
        </div>

        {carregando ? (
          <p className="py-8 text-center text-body text-muted">Carregando...</p>
        ) : doDia.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-10 text-center">
            <CalendarClock size={28} className="text-accent-700" />
            <p className="text-body text-muted">Nenhum horário marcado neste dia.</p>
            <Button variant="secondary" onClick={() => abrirNovo(diaSelecionado)}>
              <Plus size={16} />
              Marcar horário
            </Button>
          </Card>
        ) : (
          doDia.map((a) => {
            const aberto = a.status === "marcado" || a.status === "confirmado";
            return (
              <Card key={a.id} className={cn("flex flex-col gap-3", !aberto && "opacity-80")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="shrink-0 rounded-xl bg-accent-50 px-3 py-2 text-center dark:bg-accent-900/20">
                      <p className="text-body font-bold text-accent-800 dark:text-accent-200">{horaLocal(a.inicio)}</p>
                      <p className="text-[11px] text-muted">{a.duracao_min} min</p>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-body font-semibold text-foreground">{a.clientes?.nome ?? "Sem cliente"}</p>
                        <Badge size="sm" variant={VARIANTE[a.status]}>
                          {ROTULO_STATUS_AGENDA[a.status]}
                        </Badge>
                      </div>
                      <p className="text-small text-muted">{a.servicos?.nome ?? a.descricao}</p>
                      {a.observacoes && <p className="text-xs text-muted">{a.observacoes}</p>}
                    </div>
                  </div>
                  {a.valor != null && <p className="shrink-0 text-body font-semibold text-foreground">{formatarMoeda(Number(a.valor))}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {aberto && (
                    <Link href={`/dashboard/empresa/vendas?agendamento=${a.id}`}>
                      <Button size="sm">
                        <ShoppingCart size={14} />
                        Virar venda
                      </Button>
                    </Link>
                  )}
                  {aberto && a.cliente_id && (
                    <Button size="sm" variant="secondary" onClick={() => setConfirmando(a)}>
                      <MessageCircle size={14} />
                      Confirmar no WhatsApp
                    </Button>
                  )}
                  <select
                    aria-label="Situação"
                    value={a.status}
                    onChange={(e) => void mudarStatus(a, e.target.value as StatusAgendamento)}
                    className="h-9 rounded-lg border border-border bg-card px-2 text-small text-foreground"
                  >
                    {(Object.keys(ROTULO_STATUS_AGENDA) as StatusAgendamento[]).map((st) => (
                      <option key={st} value={st}>
                        {ROTULO_STATUS_AGENDA[st]}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="tertiary" onClick={() => abrirEdicao(a)}>
                    <Pencil size={14} />
                    Editar
                  </Button>
                  {apagandoId === a.id ? (
                    <>
                      <Button size="sm" variant="tertiary" onClick={() => setApagandoId(null)}>
                        Não
                      </Button>
                      <Button size="sm" onClick={() => void apagar(a.id)} className="bg-red-500 shadow-none hover:bg-red-600">
                        Apagar
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="tertiary" aria-label="Apagar" onClick={() => setApagandoId(a.id)}>
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </Container>
  );
}
