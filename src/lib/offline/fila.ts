import type { NovaTransacao } from "@/lib/data/transacoes";

/**
 * Fila de anotações (gastos/receitas) criadas sem internet, esperando para
 * serem enviadas de verdade ao servidor assim que a conexão voltar (ver
 * "Parte 2" do modo offline -- src/lib/offline/sincronizarFila.ts é quem
 * consome essa fila).
 *
 * Fica em localStorage, no mesmo espírito simples do cache de leitura em
 * cache.ts: é pouca coisa (algumas anotações no máximo), então não precisa
 * de IndexedDB. Guarda tudo numa fila só (não separada por usuário/tela)
 * porque cada item já carrega o próprio usuario_id/tipo_negocio dentro de
 * `dados` -- não muda a ordem nem a lógica de sincronizar, e permite que
 * qualquer tela (painel pessoal, painel da empresa, fluxo de caixa)
 * enfileire e sincronize a mesma fila compartilhada.
 */

export interface ItemFila {
  idLocal: string;
  dados: NovaTransacao;
  /** ISO 8601 -- momento em que a anotação foi feita no aparelho (não é
   * necessariamente quando ela vai efetivamente existir no servidor). */
  criadoEm: string;
  tentativas: number;
  /** Mensagem do último erro ao tentar enviar, ou null se nunca falhou. */
  ultimoErro: string | null;
}

const CHAVE = "meucontrole:offline:fila";
const EVENTO_MUDOU = "meucontrole:fila:mudou";

function gerarId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ler(): ItemFila[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return [];
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? (lista as ItemFila[]) : [];
  } catch {
    return [];
  }
}

function salvar(lista: ItemFila[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    // Armazenamento cheio ou indisponível (modo privado, etc.) -- não trava
    // o resto do app, mas nesse caso a anotação pode não ter sido guardada
    // de verdade. Caso raro, sem tratamento especial por ora.
  }
  window.dispatchEvent(new Event(EVENTO_MUDOU));
}

export function listarFila(): ItemFila[] {
  return ler();
}

export function adicionarNaFila(dados: NovaTransacao): ItemFila {
  const item: ItemFila = {
    idLocal: gerarId(),
    dados,
    criadoEm: new Date().toISOString(),
    tentativas: 0,
    ultimoErro: null,
  };
  salvar([...ler(), item]);
  return item;
}

export function removerDaFila(idLocal: string) {
  salvar(ler().filter((item) => item.idLocal !== idLocal));
}

export function atualizarItemFila(
  idLocal: string,
  patch: Partial<Pick<ItemFila, "tentativas" | "ultimoErro">>
) {
  salvar(ler().map((item) => (item.idLocal === idLocal ? { ...item, ...patch } : item)));
}

/** Chama `callback` sempre que a fila mudar (nesta mesma aba). Devolve uma
 * função para parar de escutar. */
export function ouvirMudancaFila(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO_MUDOU, callback);
  return () => window.removeEventListener(EVENTO_MUDOU, callback);
}
