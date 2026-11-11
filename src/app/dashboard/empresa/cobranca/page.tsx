"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HandCoins, MessageCircle, Phone, Save, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useEmpresa } from "@/lib/empresa/EmpresaProvider";
import { listarContasReceber } from "@/lib/data/contasEmpresa";
import {
  MODELOS_COBRANCA,
  lerMensagemCobranca,
  montarMensagemCliente,
  registrarCobrancaFeitaVarios,
  salvarMensagemCobranca,
} from "@/lib/data/cobranca";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { diasEntre, hojeIso, linkWhatsApp } from "@/lib/util/texto";
import type { ContaReceber } from "@/lib/data/tipos";

interface GrupoCliente {
  chave: string;
  nome: string;
  telefone: string | null;
  clienteId: string | null;
  titulos: ContaReceber[];
  total: number;
  maiorAtraso: number;
  ultimaCobranca: string | null;
}

/**
 * Cobrança (10/nov/2026): quem te deve, agrupado por cliente, com 1 toque
 * pra cobrar no WhatsApp. A mensagem é respeitosa, tem modelos prontos,
 * fica salva pra próxima e dá pra editar antes de cada envio.
 */
export default function CobrancaPage() {
  const { negocio, papel } = useAuth();
  const router = useRouter();
  const { empresaAtiva, empresas } = useEmpresa();
  const nomeEmpresa = empresaAtiva?.nome_fantasia ?? empresas[0]?.nome_fantasia ?? negocio?.nome ?? "";
  const [titulos, setTitulos] = React.useState<ContaReceber[] | null>(null);
  const [modelo, setModelo] = React.useState<string>(MODELOS_COBRANCA[0].texto);
  const [editandoModelo, setEditandoModelo] = React.useState(false);
  const [textoModelo, setTextoModelo] = React.useState("");
  const [salvoOk, setSalvoOk] = React.useState(false);
  const [filtro, setFiltro] = React.useState<"atrasados" | "todos">("atrasados");
  const [enviando, setEnviando] = React.useState<{ grupo: GrupoCliente; texto: string } | null>(null);

  React.useEffect(() => {
    if (papel === "funcionario") router.replace("/dashboard/empresa");
  }, [papel, router]);

  const carregar = React.useCallback(async () => {
    if (!negocio) return;
    const [lista, msg] = await Promise.all([listarContasReceber(negocio.usuarioId), lerMensagemCobranca(negocio.usuarioId)]);
    setTitulos(lista.filter((t) => t.status === "pendente"));
    if (msg) setModelo(msg);
  }, [negocio]);
  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  const hoje = hojeIso();
  const grupos = React.useMemo<GrupoCliente[]>(() => {
    const mapa = new Map<string, GrupoCliente>();
    for (const t of titulos ?? []) {
      if (filtro === "atrasados" && t.vencimento > hoje) continue;
      const chave = t.cliente_id ?? `sem:${t.descricao}`;
      const g =
        mapa.get(chave) ??
        ({
          chave,
          nome: t.clientes?.nome ?? "Sem cliente",
          telefone: t.clientes?.telefone ?? null,
          clienteId: t.cliente_id,
          titulos: [],
          total: 0,
          maiorAtraso: 0,
          ultimaCobranca: null,
        } as GrupoCliente);
      g.titulos.push(t);
      g.total += Number(t.valor);
      g.maiorAtraso = Math.max(g.maiorAtraso, t.vencimento < hoje ? diasEntre(t.vencimento, hoje) : 0);
      if (t.ultima_cobranca_em && (!g.ultimaCobranca || t.ultima_cobranca_em > g.ultimaCobranca)) g.ultimaCobranca = t.ultima_cobranca_em;
      mapa.set(chave, g);
    }
    return Array.from(mapa.values()).sort((a, b) => b.maiorAtraso - a.maiorAtraso || b.total - a.total);
  }, [titulos, filtro, hoje]);

  const totalGeral = grupos.reduce((acc, g) => acc + g.total, 0);

  async function salvarModelo() {
    if (!negocio) return;
    await salvarMensagemCobranca(negocio.usuarioId, textoModelo);
    setModelo(textoModelo.trim() || MODELOS_COBRANCA[0].texto);
    setEditandoModelo(false);
    setSalvoOk(true);
    setTimeout(() => setSalvoOk(false), 2500);
  }

  return (
    <Container full className="flex flex-col gap-6 py-8">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-h2 text-foreground">Cobrança</h1>
          <p className="text-body text-muted">Quem te deve, por cliente. Um toque e a mensagem já abre no WhatsApp — você revisa antes de mandar.</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setTextoModelo(modelo);
            setEditandoModelo((v) => !v);
          }}
        >
          <MessageCircle size={16} />
          Minha mensagem de cobrança
        </Button>
      </div>

      {salvoOk && <p className="rounded-xl bg-accent-50/60 px-3 py-2 text-small text-foreground">Mensagem salva. Ela vai pronta nas próximas cobranças.</p>}

      {editandoModelo && (
        <Card padding="lg" className="flex flex-col gap-3">
          <h2 className="text-h3 text-foreground">Mensagem de cobrança</h2>
          <div className="flex flex-wrap gap-2">
            {MODELOS_COBRANCA.map((m) => (
              <button key={m.id} type="button" onClick={() => setTextoModelo(m.texto)} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/10">
                Usar modelo: {m.rotulo}
              </button>
            ))}
          </div>
          <textarea
            value={textoModelo}
            onChange={(e) => setTextoModelo(e.target.value)}
            rows={7}
            maxLength={600}
            aria-label="Texto da mensagem de cobrança"
            className="rounded-xl border border-border bg-card p-3 text-small text-foreground"
          />
          <p className="text-xs text-muted">
            O app troca sozinho: {"{nome}"} (primeiro nome do cliente), {"{empresa}"}, {"{itens}"} (lista do que está em aberto), {"{total}"} e{" "}
            {"{quantidade}"}.
          </p>
          <div className="rounded-xl bg-muted/10 p-3">
            <p className="mb-1 text-xs font-semibold text-muted">Como fica (exemplo)</p>
            <p className="whitespace-pre-line text-small text-foreground">
              {montarMensagemCliente(
                textoModelo,
                "Maria Souza",
                [
                  { id: "1", descricao: "Fiado: Corte + barba", valor: 60, vencimento: hoje } as ContaReceber,
                  { id: "2", descricao: "Fiado: Pomada", valor: 35, vencimento: hoje } as ContaReceber,
                ],
                nomeEmpresa || "Minha empresa"
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void salvarModelo()}>
              <Save size={16} /> Salvar mensagem
            </Button>
            <Button variant="tertiary" onClick={() => setEditandoModelo(false)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-muted/10 p-1">
          {(
            [
              ["atrasados", "Vencidos e de hoje"],
              ["todos", "Tudo em aberto"],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={cn("rounded-full px-4 py-2 text-small font-medium", filtro === id ? "bg-card text-accent-700 shadow-sm" : "text-muted hover:text-foreground")}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <p className="text-small text-muted">
          {grupos.length} {grupos.length === 1 ? "cliente" : "clientes"} · <strong className="text-foreground">{formatarMoeda(totalGeral)}</strong> a receber
        </p>
      </div>

      {titulos === null ? (
        <p className="py-8 text-center text-muted">Carregando...</p>
      ) : grupos.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-10 text-center">
          <HandCoins size={28} className="text-accent-700" />
          <p className="text-body text-foreground">{filtro === "atrasados" ? "Ninguém em atraso. 🎉" : "Nada em aberto."}</p>
          <p className="text-small text-muted">Vendas fiadas e contas a receber aparecem aqui quando vencem.</p>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {grupos.map((g) => {
            const temTelefone = !!linkWhatsApp(g.telefone, "x");
            return (
              <Card key={g.chave} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {g.clienteId ? (
                      <Link href={`/dashboard/empresa/clientes/${g.clienteId}`} className="block truncate text-body font-semibold text-foreground hover:underline">
                        {g.nome}
                      </Link>
                    ) : (
                      <p className="truncate text-body font-semibold text-foreground">{g.nome}</p>
                    )}
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      {g.telefone ? (
                        <span className="flex items-center gap-1">
                          <Phone size={11} />
                          {g.telefone}
                        </span>
                      ) : (
                        "Sem telefone no cadastro"
                      )}
                      {g.ultimaCobranca ? <span>· cobrado em {new Date(g.ultimaCobranca).toLocaleDateString("pt-BR")}</span> : null}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-h3 text-foreground">{formatarMoeda(g.total)}</p>
                    {g.maiorAtraso > 0 && (
                      <Badge variant="danger" size="sm">
                        {g.maiorAtraso} dia(s) de atraso
                      </Badge>
                    )}
                  </div>
                </div>
                <ul className="flex flex-col gap-1 text-small">
                  {g.titulos
                    .slice()
                    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
                    .map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/5 px-2 py-1">
                        <span className="min-w-0 truncate text-foreground">{t.descricao.replace(/^Fiado:\s*/i, "")}</span>
                        <span className={cn("shrink-0 text-xs", t.vencimento < hoje ? "text-rose-700 dark:text-rose-300" : "text-muted")}>
                          {formatarMoeda(Number(t.valor))} · {new Date(t.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}
                        </span>
                      </li>
                    ))}
                </ul>
                {temTelefone ? (
                  <Button onClick={() => setEnviando({ grupo: g, texto: montarMensagemCliente(modelo, g.nome, g.titulos, nomeEmpresa) })}>
                    <MessageCircle size={16} /> Cobrar no WhatsApp
                  </Button>
                ) : g.clienteId ? (
                  <Link href={`/dashboard/empresa/clientes-fornecedores`} className="text-small font-semibold text-accent-700 hover:underline dark:text-accent-300">
                    Cadastrar o telefone do cliente pra cobrar pelo WhatsApp
                  </Link>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {enviando && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
          <div className="flex w-full max-w-lg flex-col gap-3 rounded-t-3xl bg-card p-5 shadow-card-hover sm:rounded-3xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-h3 text-foreground">Cobrar {enviando.grupo.nome.split(" ")[0]}</h2>
                <p className="text-small text-muted">Revise e ajuste o que quiser. Só esta mensagem muda — o modelo salvo continua igual.</p>
              </div>
              <button type="button" onClick={() => setEnviando(null)} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
                <X size={20} />
              </button>
            </div>
            <textarea
              value={enviando.texto}
              onChange={(e) => setEnviando({ ...enviando, texto: e.target.value })}
              rows={9}
              aria-label="Mensagem para o cliente"
              className="rounded-xl border border-border bg-card p-3 text-small text-foreground"
            />
            <a
              href={linkWhatsApp(enviando.grupo.telefone, enviando.texto) ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                const ids = enviando.grupo.titulos.map((t) => t.id);
                setEnviando(null);
                void registrarCobrancaFeitaVarios(ids)?.then(() => carregar());
              }}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1f7a4d] text-body font-semibold text-white hover:opacity-90"
            >
              <MessageCircle size={18} /> Abrir no WhatsApp
            </a>
          </div>
        </div>
      )}
    </Container>
  );
}
