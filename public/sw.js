// Service worker do "Meu Controle".
// Propósito: habilitar a instalação do PWA (ícone na tela inicial, modo
// standalone) e, quando o app é aberto sem internet, mostrar uma página
// amigável ("offline.html") em vez do erro genérico do navegador.
//
// IMPORTANTE: isto NÃO cacheia dados nem páginas do app. Só guarda essa
// única página estática (sem nenhum número/saldo real) pra mostrar quando a
// rede falha ao abrir o app. Todo o resto -- páginas do dashboard, APIs,
// dados -- continua sempre vindo direto da rede, nunca de cache: é um app
// financeiro, os números têm que ser sempre os reais.

const CACHE_OFFLINE = "meucontrole-offline-fallback-v1";
const PAGINA_OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_OFFLINE)
      .then((cache) => cache.add(PAGINA_OFFLINE))
      .catch(() => {
        // Se o precache falhar por algum motivo, não impede a instalação
        // do service worker -- só significa que o fallback offline não vai
        // funcionar até a próxima visita bem-sucedida.
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves
            .filter((chave) => chave !== CACHE_OFFLINE)
            .map((chave) => caches.delete(chave))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Só intercepta navegação (abrir o app / trocar de página). Chamadas de
// API, dados, scripts, imagens etc. continuam passando direto pra rede,
// sem cache -- exatamente como antes.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(PAGINA_OFFLINE))
  );
});
