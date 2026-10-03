"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Plus, Send, Ban, Trash2, Info } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarClientes } from "@/lib/data/clientes";
import {
  listarNotasFiscais,
  criarNotaFiscal,
  cancelarNotaFiscal,
  excluirNotaFiscal,
  solicitarEmissao,
  ROTULO_STATUS_NOTA,
} from "@/lib/data/notasFiscais";
import { FiltrosLista, dentroDoPeriodo, type PeriodoMeses } from "@/components/dashboard/FiltrosLista";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Cliente, NotaFiscal, StatusNotaFiscal } from "@/lib/data/tipos";

const classeSelect =
  "h-11 rounded-xl border border-border bg-card px-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100";

const VARIANTE: Record<StatusNotaFiscal, "neutral" | "primary" | "danger" | "warning"> = {
  pendente: "warning",
  autorizada: "primary",
  rejeitada: "danger",
  cancelada: "neutral",
};

function parsear(texto: string): number {
  const n = Number(texto.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Gestão de notas fiscais (item 5.17 da especificação de 03/out/2026). Todo o
 * texto usa as cores de alto contraste do item 4.1 (text-foreground em
 * fundos de card, nunca cinza claro sobre cinza).
 */
export default function NotasFiscaisPage() {
  const { negocio, papel } = useAuth();
  const router = useRouter();
  const [notas, setNotas] = React.useState<NotaFiscal[]>([]);
  const [clientes, setClientes] = React.useState<Cliente[]>([]);
  const [carregando, setCarregando] = React.useState(true);
  const [periodo, setPeriodo] = React.useState<PeriodoMeses>(3);
  const [verCanceladas, setVerCanceladas] = React.useState(false);
  const [filtroStatus, setFiltroStatus] = React.useState<StatusNotaFiscal | "todas">("todas");
  const [filtroTomador, setFiltroTomador] = React.useState("");

  const [formAberto, setFormAberto] = React.useState(false);
  const [form, setForm] = React.useState({
    clienteId: "",
    tipo: "servico" as "servico" | "produto",
    tomador: "",
    documento: "",
    discriminacao: "",
    codigo: "",
    aliquota: "",
    retido: false,
    valor: "",
  });
  const [erro, setErro] = React.useState<string | null>(null);
  const [mensagem, setMensagem] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  React.useEffect(() => {
    if (papel === "funcionario") router.replace("/dashboard/empresa");
  }, [papel, router]);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    setCarregando(true);
    const [n, c] = await Promise.all([listarNotasFiscais(negocio.usuarioId), listarClientes(negocio.usuarioId)]);
    setNotas(n);
    setClientes(c);
    setCarregando(false);
  }, [negocio]);

  React.useEffect(() => {
    carregar();
  }, [carregar]);

  function escolherCliente(id: string) {
    const c = clientes.find((x) => x.id === id);
    setForm((f) => ({ ...f, clienteId: id, tomador: c?.nome ?? f.tomador }));
  }

  async function salvar(e: React.FormEvent, emitir: boolean) {
    e.preventDefault();
    if (!negocio) return;
    const valor = parsear(form.valor);
    const aliquota = form.aliquota.trim() ? parsear(form.aliquota) : null;
    if (form.tomador.trim().length < 2) return setErro("Informe o tomador/destinatário.");
    if (form.discriminacao.trim().length < 3) return setErro("Descreva os serviços ou itens.");
    if (!valor || valor <= 0) return setErro("Informe o valor da nota.");
    if (aliquota !== null && (Number.isNaN(aliquota) || aliquota < 0 || aliquota > 100)) return setErro("Alíquota entre 0 e 100.");
    setErro(null);
    setSalvando(true);
    const { data, error } = await criarNotaFiscal({
      usuario_id: negocio.usuarioId,
      cliente_id: form.clienteId || null,
      tipo: form.tipo,
      tomador_nome: form.tomador,
      tomador_documento: form.documento,
      discriminacao: form.discriminacao,
      codigo_atividade: form.codigo,
      aliquota,
      imposto_retido: form.retido,
      valor,
    });
    if (error || !data) {
      setSalvando(false);
      return setErro("Não foi possível salvar a nota.");
    }
    if (emitir) {
      const r = await solicitarEmissao((data as NotaFiscal).id);
      setMensagem(r.mensagem);
    }
    setSalvando(false);
    setFormAberto(false);
    carregar();
  }

  async function emitir(n: NotaFiscal) {
    const r = await solicitarEmissao(n.id);
    setMensagem(r.mensagem);
    carregar();
  }

  const visiveis = notas
    .filter((n) => (verCanceladas ? n.status === "cancelada" : n.status !== "cancelada"))
    .filter((n) => filtroStatus === "todas" || n.status === filtroStatus)
    .filter((n) => !filtroTomador.trim() || n.tomador_nome.toLowerCase().includes(filtroTomador.trim().toLowerCase()))
    .filter((n) => dentroDoPeriodo(n.data_emissao, periodo));
  const totalAutorizado = visiveis.filter((n) => n.status === "autorizada").reduce((acc, n) => acc + Number(n.valor), 0);

  return (
    <Container full className="flex flex-col gap-8 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Notas fiscais</h1>
          <p className="text-body text-foreground">Emissões recentes e emissão de novas notas de serviço ou produto.</p>
        </div>
        <Button onClick={() => { setFormAberto(true); setErro(null); }}>
          <Plus size={18} />
          Nova nota
        </Button>
      </div>

      {mensagem && (
        <Card className="flex items-start gap-3 border-primary-200 bg-primary-50/60">
          <Info size={18} className="mt-0.5 shrink-0 text-primary-700" />
          <p className="text-small text-foreground">{mensagem}</p>
        </Card>
      )}

      {formAberto && (
        <Card padding="lg" className="flex flex-col gap-4">
          <h2 className="text-h3 text-foreground">Nova nota fiscal</h2>
          <form onSubmit={(e) => salvar(e, true)} className="flex flex-col gap-4">
            <div className="flex gap-1 self-start rounded-full bg-muted/10 p-1">
              {(["servico", "produto"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tipo: t }))}
                  className={cn("rounded-full px-4 py-1.5 text-small font-semibold", form.tipo === t ? "bg-card text-foreground shadow-sm" : "text-foreground/80")}
                >
                  {t === "servico" ? "Serviço (NFS-e)" : "Produto (NF-e)"}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {clientes.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-small font-medium text-foreground">Cliente cadastrado</span>
                  <select value={form.clienteId} onChange={(e) => escolherCliente(e.target.value)} className={classeSelect}>
                    <option value="">Digitar manualmente</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
              )}
              <Input label={form.tipo === "servico" ? "Tomador do serviço" : "Destinatário"} value={form.tomador} onChange={(e) => setForm((f) => ({ ...f, tomador: e.target.value }))} />
              <Input label="CPF/CNPJ do tomador (opcional)" inputMode="numeric" value={form.documento} onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value }))} />
              <Input label="Valor" inputMode="decimal" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="discriminacao" className="text-small font-medium text-foreground">
                Discriminação dos {form.tipo === "servico" ? "serviços" : "itens"}
              </label>
              <textarea
                id="discriminacao"
                rows={4}
                value={form.discriminacao}
                onChange={(e) => setForm((f) => ({ ...f, discriminacao: e.target.value }))}
                className="rounded-xl border border-border bg-card p-3 text-body text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label={form.tipo === "servico" ? "Código CNAE/NBS (opcional)" : "NCM/CFOP (opcional)"}
                value={form.codigo}
                onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
              />
              <Input label="Alíquota % (opcional)" inputMode="decimal" value={form.aliquota} onChange={(e) => setForm((f) => ({ ...f, aliquota: e.target.value }))} />
              <label className="flex items-center gap-2 self-end pb-3 text-small text-foreground">
                <input type="checkbox" checked={form.retido} onChange={(e) => setForm((f) => ({ ...f, retido: e.target.checked }))} className="h-4 w-4 accent-emerald-600" />
                Imposto retido na fonte
              </label>
            </div>
            {erro && <p className="text-small text-rose-700">{erro}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={salvando}>
                <Send size={16} />
                {salvando ? "Enviando..." : "Salvar e emitir"}
              </Button>
              <Button type="button" variant="secondary" disabled={salvando} onClick={(e) => salvar(e as unknown as React.FormEvent, false)}>
                Salvar como pendente
              </Button>
              <Button type="button" variant="tertiary" onClick={() => setFormAberto(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <FiltrosLista periodo={periodo} onPeriodo={setPeriodo} quitadas={verCanceladas} onQuitadas={setVerCanceladas} rotuloQuitadas="Canceladas" />
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-foreground">Situação</span>
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as StatusNotaFiscal | "todas")} className={classeSelect}>
              <option value="todas">Todas</option>
              {(["pendente", "autorizada", "rejeitada"] as const).map((st) => (
                <option key={st} value={st}>{ROTULO_STATUS_NOTA[st]}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <Input label="Tomador/destinatário" value={filtroTomador} onChange={(e) => setFiltroTomador(e.target.value)} placeholder="Filtrar por nome" />
          </div>
        </div>
      </div>

      {!carregando && visiveis.length > 0 && (
        <p className="text-small text-foreground">
          {visiveis.length} nota{visiveis.length > 1 ? "s" : ""} · autorizado no filtro: <strong>{formatarMoeda(totalAutorizado)}</strong>
        </p>
      )}

      {carregando ? (
        <p className="py-8 text-center text-body text-foreground">Carregando...</p>
      ) : visiveis.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <FileSpreadsheet size={28} className="text-accent-700" />
          <p className="text-body text-foreground">Nenhuma nota neste filtro.</p>
        </Card>
      ) : (
        <Card padding="sm" className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-small text-foreground">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-2 py-2 font-semibold">Emissão</th>
                <th className="px-2 py-2 font-semibold">Tomador</th>
                <th className="px-2 py-2 font-semibold">Tipo</th>
                <th className="px-2 py-2 text-right font-semibold">Valor</th>
                <th className="px-2 py-2 font-semibold">Situação</th>
                <th className="px-2 py-2 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((n) => (
                <tr key={n.id} className="border-b border-border/60 align-top">
                  <td className="px-2 py-2">{new Date(n.data_emissao + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                  <td className="px-2 py-2">
                    <p className="font-medium">{n.tomador_nome}</p>
                    <p className="line-clamp-2 text-xs text-foreground/80">{n.discriminacao}</p>
                    {n.mensagem_status && n.status === "pendente" && <p className="mt-1 text-xs text-amber-900">{n.mensagem_status}</p>}
                  </td>
                  <td className="px-2 py-2">{n.tipo === "servico" ? "NFS-e" : "NF-e"}</td>
                  <td className="px-2 py-2 text-right font-semibold">{formatarMoeda(Number(n.valor))}</td>
                  <td className="px-2 py-2">
                    <Badge variant={VARIANTE[n.status]} size="sm">{ROTULO_STATUS_NOTA[n.status]}</Badge>
                    {n.numero && <p className="mt-1 text-xs">Nº {n.numero}</p>}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      {n.status === "pendente" && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => emitir(n)}>
                            <Send size={14} />
                            Emitir
                          </Button>
                          <button type="button" aria-label="Excluir" onClick={() => void excluirNotaFiscal(n.id).then(carregar)} className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground hover:bg-rose-50 hover:text-rose-700">
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                      {n.status === "autorizada" && (
                        <Button size="sm" variant="tertiary" onClick={() => void cancelarNotaFiscal(n.id).then(carregar)}>
                          <Ban size={14} />
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </Container>
  );
}
