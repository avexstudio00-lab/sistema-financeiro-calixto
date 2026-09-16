import type { Categoria, Conta } from "@/lib/data/tipos";
import { salvarCache, lerCache } from "./cache";

/**
 * Cache das listas de categorias e contas que o formulário de "nova
 * anotação" (NovaTransacaoModal) precisa para funcionar -- guardado por
 * usuário efetivo (pessoal = user.id, negócio = negocio.usuarioId, ver
 * AuthProvider) para o modal conseguir abrir e deixar escolher categoria e
 * conta mesmo sem internet. Reaproveita o mesmo cache genérico de leitura
 * de src/lib/offline/cache.ts, só com uma chave própria (não conflita com
 * o cache do painel).
 */

export interface DadosFormOffline {
  categorias: Categoria[];
  contas: Conta[];
}

function chave(usuarioEfetivoId: string) {
  return `form-transacao:${usuarioEfetivoId}`;
}

export function salvarDadosFormOffline(usuarioEfetivoId: string, categorias: Categoria[], contas: Conta[]) {
  salvarCache<DadosFormOffline>(chave(usuarioEfetivoId), { categorias, contas });
}

export function lerDadosFormOffline(usuarioEfetivoId: string): DadosFormOffline | null {
  return lerCache<DadosFormOffline>(chave(usuarioEfetivoId))?.dados ?? null;
}
