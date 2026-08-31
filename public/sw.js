// Service worker mínimo: existe só para habilitar a instalação como PWA.
// Não faz cache nem intercepta nada -- todo request segue direto pra rede,
// para nunca servir dado desatualizado numa tela autenticada.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Passthrough intencional: sem event.respondWith, o navegador trata
  // a requisição normalmente.
});
