"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, Building2, CheckCheck, Home, X } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { listarNotificacoes, marcarNotificacoesLidas, type Notificacao } from "@/lib/data/notificacoes";

function quando(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return `hoje, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  if (d.toDateString() === ontem.toDateString()) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/**
 * Sininho no topo (10/nov/2026): os mesmos avisos do push (vencimentos,
 * atrasos, DAS, estoque, relatório...) ficam guardados aqui, cada um com a
 * etiqueta da parte do app — Pessoal ou Empresa.
 */
export function CentralNotificacoes() {
  const { user } = useAuth();
  const router = useRouter();
  const [lista, setLista] = React.useState<Notificacao[] | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const [filtro, setFiltro] = React.useState<"tudo" | "pessoal" | "empresa">("tudo");
  const caixaRef = React.useRef<HTMLDivElement>(null);

  const carregar = React.useCallback(() => {
    if (!user) return;
    listarNotificacoes(user.id).then(setLista);
  }, [user]);

  React.useEffect(() => {
    carregar();
    const aoVoltar = () => document.visibilityState === "visible" && carregar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [carregar]);

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  if (lista === null) return null;
  const naoLidas = lista.filter((n) => !n.lida_em);
  const visiveis = filtro === "tudo" ? lista : lista.filter((n) => n.area === filtro);

  async function marcarTodas() {
    const ids = naoLidas.map((n) => n.id);
    setLista((l) => (l ?? []).map((n) => (n.lida_em ? n : { ...n, lida_em: new Date().toISOString() })));
    await marcarNotificacoesLidas(ids);
  }

  async function abrir(n: Notificacao) {
    setAberto(false);
    if (!n.lida_em) {
      setLista((l) => (l ?? []).map((x) => (x.id === n.id ? { ...x, lida_em: new Date().toISOString() } : x)));
      void marcarNotificacoesLidas([n.id]);
    }
    if (n.url && n.url.startsWith("/")) router.push(n.url);
  }

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={naoLidas.length ? `Notificações: ${naoLidas.length} não lidas` : "Notificações"}
        aria-expanded={aberto}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-muted/10 hover:text-foreground"
      >
        <Bell size={19} />
        {naoLidas.length > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">
            {naoLidas.length > 9 ? "9+" : naoLidas.length}
          </span>
        )}
      </button>
      {aberto && (
        <div className="fixed inset-x-3 top-16 z-50 flex max-h-[75vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card-hover sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-body font-semibold text-foreground">Notificações</p>
            <div className="flex items-center gap-1">
              {naoLidas.length > 0 && (
                <button type="button" onClick={() => void marcarTodas()} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-700 hover:bg-muted/10 dark:text-primary-300">
                  <CheckCheck size={14} /> Marcar todas como lidas
                </button>
              )}
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="flex gap-1 px-3 pt-2">
            {(
              [
                ["tudo", "Tudo"],
                ["pessoal", "Pessoal"],
                ["empresa", "Empresa"],
              ] as const
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(id)}
                className={cn("rounded-full px-3 py-1 text-xs font-medium", filtro === id ? "bg-muted/15 text-foreground" : "text-muted hover:text-foreground")}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {visiveis.length === 0 ? (
            <p className="px-4 py-8 text-center text-small text-muted">Nenhuma notificação por aqui.</p>
          ) : (
            <ul className="flex-1 divide-y divide-border overflow-y-auto">
              {visiveis.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => void abrir(n)} className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/5", !n.lida_em && "bg-primary-50/40 dark:bg-primary-900/10")}>
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        n.area === "empresa" ? "bg-accent-50 text-accent-700" : "bg-primary-50 text-primary-700"
                      )}
                    >
                      {n.area === "empresa" ? <Building2 size={14} /> : <Home size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase", n.area === "empresa" ? "bg-accent-50 text-accent-800" : "bg-primary-50 text-primary-800")}>
                          {n.area === "empresa" ? "Empresa" : "Pessoal"}
                        </span>
                        <span className="text-[11px] text-muted">{quando(n.criada_em)}</span>
                        {!n.lida_em && <span className="ml-auto h-2 w-2 rounded-full bg-rose-600" aria-label="Não lida" />}
                      </span>
                      <span className="mt-1 block text-small font-semibold text-foreground">{n.titulo.replace(/^Calixto · (Empresa|Pessoal) — /, "").replace(/^Calixto — /, "")}</span>
                      <span className="block text-xs text-muted">{n.corpo}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
