/**
 * Item 2.5 da especificação de 09/out/2026: encerramento de sessão
 * sincronizado entre abas e limpeza dos dados temporários do aparelho.
 *
 * - `avisarLogoutOutrasAbas()` publica num BroadcastChannel; as outras abas
 *   abertas do app escutam (`escutarLogoutOutrasAbas`) e saem na hora, sem
 *   esperar o próximo refresh do token.
 * - `limparDadosLocais()` apaga o cache offline (retratos de telas, listas do
 *   formulário) guardado no aparelho. A fila de anotações pendentes só é
 *   apagada quando já está vazia ou quando `incluirFilaPendente` for true —
 *   quem chama decide (o logout tenta sincronizar a fila antes).
 *
 * Nada aqui guarda dado financeiro em lugar nenhum: só apaga.
 */

const CANAL = "calixto-sessao";
const PREFIXOS_TEMPORARIOS = ["meucontrole:offline:", "meucontrole:empresa-ativa:"];
const CHAVE_FILA = "meucontrole:offline:fila";

type Mensagem = { tipo: "logout"; em: number };

function abrirCanal(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(CANAL);
  } catch {
    return null;
  }
}

export function avisarLogoutOutrasAbas(): void {
  const canal = abrirCanal();
  if (!canal) return;
  try {
    const msg: Mensagem = { tipo: "logout", em: Date.now() };
    canal.postMessage(msg);
  } finally {
    canal.close();
  }
}

/** Registra o ouvinte; devolve a função que desliga. */
export function escutarLogoutOutrasAbas(aoSair: () => void): () => void {
  const canal = abrirCanal();
  if (!canal) return () => {};
  canal.onmessage = (ev: MessageEvent<Mensagem>) => {
    if (ev.data && ev.data.tipo === "logout") aoSair();
  };
  return () => canal.close();
}

export function limparDadosLocais(opcoes: { incluirFilaPendente?: boolean } = {}): void {
  if (typeof window === "undefined") return;
  try {
    const chaves: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k) chaves.push(k);
    }
    for (const k of chaves) {
      if (k === CHAVE_FILA) {
        let vazia = true;
        try {
          const fila = JSON.parse(window.localStorage.getItem(k) ?? "[]");
          vazia = !Array.isArray(fila) || fila.length === 0;
        } catch {
          vazia = true;
        }
        if (vazia || opcoes.incluirFilaPendente) window.localStorage.removeItem(k);
        continue;
      }
      if (PREFIXOS_TEMPORARIOS.some((p) => k.startsWith(p))) window.localStorage.removeItem(k);
    }
    window.sessionStorage.clear();
  } catch {
    // Armazenamento indisponível: nada a limpar.
  }
  // Bancos IndexedDB do app (se algum navegador/versão tiver criado).
  try {
    const idb = window.indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
    if (idb && typeof idb.databases === "function") {
      idb
        .databases()
        .then((lista) => {
          for (const db of lista) {
            if (db.name && /calixto|meucontrole/i.test(db.name)) idb.deleteDatabase(db.name);
          }
        })
        .catch(() => {});
    }
  } catch {
    // sem IndexedDB
  }
}
