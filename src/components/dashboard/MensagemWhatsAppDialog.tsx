"use client";

import * as React from "react";
import { Check, Copy, MessageCircle, X } from "lucide-react";
import { linkWhatsApp } from "@/lib/util/texto";

/**
 * Janela de mensagem pronta pro WhatsApp (13/nov/2026): o app monta o texto
 * (orçamento, pedido ao fornecedor, cliente sumido...) e a pessoa revisa e
 * muda o que quiser antes de abrir o WhatsApp. Sem telefone cadastrado, abre
 * o WhatsApp para escolher o contato.
 */
export function MensagemWhatsAppDialog({
  titulo,
  subtitulo = "Revise e ajuste o que quiser antes de mandar.",
  textoInicial,
  telefone,
  onFechar,
  onEnviado,
  extra,
}: {
  titulo: string;
  subtitulo?: string;
  textoInicial: string;
  telefone: string | null | undefined;
  onFechar: () => void;
  /** Chamado ao abrir o WhatsApp (ex.: registrar que foi enviado). */
  onEnviado?: (texto: string) => void;
  /** Conteúdo opcional abaixo do texto (ex.: escolher modelo). */
  extra?: React.ReactNode;
}) {
  const [texto, setTexto] = React.useState(textoInicial);
  const [copiado, setCopiado] = React.useState(false);

  React.useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  const link = linkWhatsApp(telefone, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-t-3xl bg-card p-5 shadow-card-hover sm:rounded-3xl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-h3 text-foreground">{titulo}</h2>
            <p className="text-small text-muted">{subtitulo}</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
            <X size={20} />
          </button>
        </div>
        {extra}
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={10}
          aria-label="Mensagem"
          className="min-h-40 rounded-xl border border-border bg-card p-3 text-small text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
        />
        {!linkWhatsApp(telefone, "x") && (
          <p className="text-xs text-muted">Sem WhatsApp cadastrado: o WhatsApp abre para você escolher o contato.</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              onEnviado?.(texto);
              onFechar();
            }}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1f7a4d] text-body font-semibold text-white hover:opacity-90"
          >
            <MessageCircle size={18} /> Abrir no WhatsApp
          </a>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(texto).then(() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              });
            }}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 text-small font-semibold text-foreground hover:bg-muted/10"
          >
            {copiado ? <Check size={16} /> : <Copy size={16} />}
            {copiado ? "Copiado" : "Copiar texto"}
          </button>
        </div>
      </div>
    </div>
  );
}
