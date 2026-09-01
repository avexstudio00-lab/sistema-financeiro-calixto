// Service worker mínimo do "Meu Controle".
// Propósito: só habilitar a instalação do PWA (ícone na tela inicial, modo
// standalone). Não guarda cache de dados — este é um app financeiro, então
// os números sempre vêm direto da rede, nunca de uma versão antiga guardada.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Passa toda requisição direto pra rede, sem interceptar/cachear nada.
self.addEventListener("fetch", () => {});
