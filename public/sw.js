const CACHE_VERSION = "gestao-sms-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("gestao-sms-") && key !== CACHE_VERSION)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// O sistema lida com dados institucionais autenticados. Por segurança,
// o service worker não mantém respostas de páginas, APIs ou documentos em cache.
self.addEventListener("fetch", () => {});
