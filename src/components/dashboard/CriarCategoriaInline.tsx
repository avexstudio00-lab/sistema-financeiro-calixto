"use client";

import * as React from "react";
import { Plus, Check, X } from "lucide-react";
import { criarCategoriaPersonalizada } from "@/lib/data/categorias";
import type { Categoria } from "@/lib/data/tipos";

export interface CriarCategoriaInlineProps {
  usuarioId: string;
  tipo: "receita" | "despesa";
  onCriada: (categoria: Categoria) => void;
  /** Classe do botão "+" no estado fechado — cada tela onde este componente
   * é usado (chip do modal de anotação, botão no orçamento, etc.) passa o
   * visual que combina com o resto da tela. Sem valor, cai num chip
   * genérico tracejado. */
  botaoClassName?: string;
  rotulo?: string;
}

/**
 * Botão "+" reutilizável pra criar uma categoria personalizada na hora, sem
 * sair da tela em que a pessoa está (modal de nova anotação, orçamento, ou
 * qualquer outro seletor de categoria) — usa a mesma
 * `criarCategoriaPersonalizada` de sempre (src/lib/data/categorias.ts,
 * `is_personalizada: true`), só que com essa UI compartilhada em vez de
 * cada tela reimplementar o próprio formulário.
 */
export function CriarCategoriaInline({
  usuarioId,
  tipo,
  onCriada,
  botaoClassName,
  rotulo = "Nova categoria",
}: CriarCategoriaInlineProps) {
  const [aberto, setAberto] = React.useState(false);
  const [nome, setNome] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  function cancelar() {
    setAberto(false);
    setNome("");
    setErro(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) return;
    setSalvando(true);
    setErro(null);
    const { data, error } = await criarCategoriaPersonalizada(usuarioId, nomeLimpo, tipo);
    setSalvando(false);
    if (error || !data) {
      setErro("Não foi possível criar. Tente outro nome.");
      return;
    }
    onCriada(data as Categoria);
    cancelar();
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={
          botaoClassName ??
          "flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-small font-medium text-muted transition-colors hover:border-primary-400 hover:text-primary-700"
        }
      >
        <Plus size={14} />
        {rotulo}
      </button>
    );
  }

  return (
    <form onSubmit={salvar} className="flex flex-wrap items-center gap-1.5">
      <input
        autoFocus
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome da categoria"
        maxLength={40}
        className="h-9 w-40 rounded-full border border-border bg-card px-3 text-small text-foreground focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-100"
      />
      <button
        type="submit"
        disabled={salvando || !nome.trim()}
        aria-label="Salvar categoria"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
      >
        <Check size={16} />
      </button>
      <button
        type="button"
        onClick={cancelar}
        aria-label="Cancelar"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-muted/10"
      >
        <X size={16} />
      </button>
      {erro && <p className="w-full text-small text-rose-600">{erro}</p>}
    </form>
  );
}
