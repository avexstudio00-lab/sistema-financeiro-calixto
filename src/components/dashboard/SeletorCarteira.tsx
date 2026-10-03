"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { listarContas } from "@/lib/data/contas";
import type { Conta } from "@/lib/data/tipos";

/** Carteiras do usuário (cache simples por montagem). */
export function useCarteiras() {
  const { user } = useAuth();
  const [contas, setContas] = React.useState<Conta[]>([]);
  React.useEffect(() => {
    if (!user) return;
    listarContas(user.id).then(setContas);
  }, [user]);
  return contas;
}

/**
 * Campo "Entrou em qual carteira?" (item 5.10 da especificação de
 * 03/out/2026). Pré-seleciona a primeira carteira que não é cartão.
 */
export function SeletorCarteira({
  valor,
  onChange,
  rotulo = "Entrou em qual carteira?",
  ajuda = "O valor entra nessa carteira na categoria \"Resgates e rendimentos\".",
}: {
  valor: string;
  onChange: (id: string) => void;
  rotulo?: string;
  ajuda?: string;
}) {
  const contas = useCarteiras();
  const id = React.useId();
  React.useEffect(() => {
    if (!valor && contas.length > 0) {
      const padrao = contas.find((c) => c.tipo !== "cartao_credito") ?? contas[0];
      onChange(padrao.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contas]);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-foreground">
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-xl border border-border bg-card px-4 text-small text-foreground"
      >
        <option value="">Selecione a carteira...</option>
        {contas
          .filter((c) => c.tipo !== "cartao_credito")
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
      </select>
      {ajuda && <span className="text-xs text-muted">{ajuda}</span>}
    </div>
  );
}

/** Diálogo curto pra escolher a carteira antes de confirmar um recebimento. */
export function EscolherCarteiraDialog({
  titulo,
  descricao,
  salvando,
  onConfirmar,
  onFechar,
}: {
  titulo: string;
  descricao?: string;
  salvando?: boolean;
  onConfirmar: (contaId: string) => void | Promise<void>;
  onFechar: () => void;
}) {
  const [contaId, setContaId] = React.useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-t-3xl bg-card p-6 shadow-card-hover sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-foreground">{titulo}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-muted/10">
            <X size={20} />
          </button>
        </div>
        {descricao && <p className="text-small text-muted">{descricao}</p>}
        <SeletorCarteira valor={contaId} onChange={setContaId} />
        <Button size="lg" disabled={!contaId || salvando} onClick={() => onConfirmar(contaId)}>
          {salvando ? "Salvando..." : "Confirmar recebimento"}
        </Button>
      </div>
    </div>
  );
}
