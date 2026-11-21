/**
 * Destino de notificação (21/nov/2026): o aviso (push ou sininho) leva pra
 * tela certa JÁ no item — ex. /dashboard/empresa/contas?aba=receber&id=X&acao=liquidar
 * abre a aba "A receber", rola até a conta, destaca e abre o "Receber".
 *
 * Cada tela lê os parâmetros uma vez (depois de carregar os dados), faz o
 * que precisa e limpa a URL — assim recarregar a página não repete a ação.
 */

/** Lê os parâmetros da URL atual (só no navegador). */
export function lerDestino(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

/** Tira os parâmetros da barra de endereço sem recarregar a tela. */
export function limparDestino(nomes: string[]) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let mudou = false;
  for (const n of nomes) {
    if (url.searchParams.has(n)) {
      url.searchParams.delete(n);
      mudou = true;
    }
  }
  if (mudou) window.history.replaceState(window.history.state, "", url.pathname + (url.search ? url.search : "") + url.hash);
}

/** Rola até o elemento e pisca um contorno por alguns segundos. Tenta de
 * novo por um instante, porque a lista pode terminar de desenhar depois. */
export function destacarElemento(id: string, tentativas = 10) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (!el) {
    if (tentativas > 0) window.setTimeout(() => destacarElemento(id, tentativas - 1), 150);
    return;
  }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const classes = ["ring-2", "ring-amber-400", "ring-offset-2", "ring-offset-background", "rounded-2xl"];
  el.classList.add(...classes);
  window.setTimeout(() => el.classList.remove(...classes), 3500);
}
