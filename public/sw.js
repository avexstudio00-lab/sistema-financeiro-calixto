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


// Notificações push (item 6.6 da especificação de 03/out/2026) -- o
// payload vem sempre de src/lib/push/enviarPush.ts no formato PayloadPush
// (titulo, corpo, url, tag). Aparece na tela de bloqueio com som/vibração
// mesmo com o app fechado. Se a pessoa ligou "Ocultar prévia", o próprio
// servidor já manda o texto genérico -- nada sensível chega aqui.
self.addEventListener("push", (event) => {
  let payload = { titulo: "Calixto", corpo: "Você tem uma notificação do Calixto" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Payload sem JSON (não deveria acontecer) -- mostra o texto genérico.
  }

  const opcoes = {
    body: payload.corpo,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: payload.url || "/dashboard" },
    vibrate: [200, 100, 200],
    timestamp: Date.now(),
  };
  // `tag` agrupa: o mesmo aviso reenviado substitui o anterior em vez de
  // empilhar duplicado na central de notificações.
  if (payload.tag) {
    opcoes.tag = payload.tag;
    opcoes.renotify = true;
  }

  event.waitUntil(self.registration.showNotification(payload.titulo, opcoes));
});

// Clique na notificação: leva direto pra tela do lançamento/conta/dívida
// que gerou o aviso -- reaproveita uma janela aberta do app (navegando ela
// até a tela certa) ou abre uma nova.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const caminho = (event.notification.data && event.notification.data.url) || "/dashboard";
  const destino = new URL(caminho, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (janelas) => {
      for (const janela of janelas) {
        if (new URL(janela.url).origin !== self.location.origin) continue;
        try {
          if (janela.url !== destino && "navigate" in janela) await janela.navigate(destino);
        } catch {
          // navigate pode falhar em janelas não controladas -- segue pro focus.
        }
        if ("focus" in janela) return janela.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    })
  );
});
