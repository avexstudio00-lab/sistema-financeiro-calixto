"use client";

import * as React from "react";
import Link from "next/link";
import { Search, X, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { buscarGlobal, type GrupoBusca } from "@/lib/data/busca";

/**
 * Busca global (item 6.2 da especificação de 03/out/2026): ícone de lupa no
 * cabeçalho de todas as telas internas, também aberta com Ctrl+K / Cmd+K.
 * Procura em transações, clientes/fornecedores, dívidas e contas, metas e
 * investimentos, produtos e serviços — tudo de uma vez, agrupado.
 */
export function BuscaGlobal() {
  const { user, negocio, podeAcessarMinhaEmpresa } = useAuth();
  const [aberta, setAberta] = React.useState(false);
  const [texto, setTexto] = React.useState("");
  const [grupos, setGrupos] = React.useState<GrupoBusca[]>([]);
  const [buscando, setBuscando] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta(true);
      }
      if (e.key === "Escape") setAberta(false);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  React.useEffect(() => {
    if (aberta) setTimeout(() => inputRef.current?.focus(), 30);
    else {
      setTexto("");
      setGrupos([]);
    }
  }, [aberta]);

  React.useEffect(() => {
    if (!aberta || !user) return;
    const termo = texto.trim();
    if (termo.length < 2) {
      setGrupos([]);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const timer = setTimeout(async () => {
      const r = await buscarGlobal(termo, user.id, podeAcessarMinhaEmpresa ? negocio?.usuarioId ?? null : null);
      if (!cancelado) {
        setGrupos(r);
        setBuscando(false);
      }
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [texto, aberta, user, negocio, podeAcessarMinhaEmpresa]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label="Buscar (Ctrl+K)"
        title="Buscar (Ctrl+K)"
        className="flex h-9 items-center gap-2 rounded-lg px-2 text-muted hover:bg-muted/10 hover:text-foreground"
      >
        <Search size={18} />
        <span className="hidden text-xs lg:inline">Ctrl K</span>
      </button>

      {aberta && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 p-4 pt-[10vh] backdrop-blur-sm"
          onClick={() => setAberta(false)}
        >
          <div
            role="dialog"
            aria-label="Busca global"
            className="flex max-h-[75vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-card shadow-card-hover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search size={18} className="shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Buscar transações, clientes, dívidas, metas, produtos..."
                className="h-14 min-w-0 flex-1 bg-transparent text-body text-foreground placeholder:text-muted focus:outline-none"
              />
              {buscando && <Loader2 size={16} className="shrink-0 animate-spin text-muted" />}
              <button type="button" onClick={() => setAberta(false)} aria-label="Fechar" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto p-2">
              {texto.trim().length < 2 ? (
                <p className="px-3 py-6 text-center text-small text-muted">Digite pelo menos 2 letras.</p>
              ) : !buscando && grupos.length === 0 ? (
                <p className="px-3 py-6 text-center text-small text-muted">Nada encontrado para &quot;{texto.trim()}&quot;.</p>
              ) : (
                grupos.map((g) => (
                  <div key={g.grupo} className="mb-2">
                    <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">{g.grupo}</p>
                    {g.itens.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={() => setAberta(false)}
                        className="flex flex-col rounded-xl px-3 py-2 hover:bg-muted/10"
                      >
                        <span className="truncate text-small font-medium text-foreground">{item.titulo}</span>
                        <span className="truncate text-xs text-muted">{item.detalhe}</span>
                      </Link>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
