/* DRIVXI Service Worker · caché + notificaciones push */
const CACHE_NAME = 'drivxi-cache-v1';
const URLS_TO_CACHE = ['./index.html', './drivxi.html', './app.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});

/* ---------- PUSH: muestra el aviso aunque la app esté cerrada ---------- */
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    try { d = { cuerpo: event.data.text() }; } catch (e2) { d = {}; }
  }
  const titulo = d.titulo || d.title || 'DRIVXI';
  const cuerpo = d.cuerpo || d.body || 'Tienes una notificación nueva.';
  const tag = d.tag || ('drivxi-' + Date.now());
  const url = d.url || './app.html';
  const opciones = {
    body: cuerpo,
    icon: new URL('icon-192.png', self.registration.scope).href,
    tag: tag,
    renotify: false,
    requireInteraction: !!d.persistente,
    vibrate: d.vibrar || [250, 100, 250, 100, 400],
    timestamp: Date.now(),
    data: { url: url, viaje_id: d.viaje_id || null, estado: d.estado || null, tipo: d.tipo || 'push' }
  };
  event.waitUntil(
    self.registration.showNotification(titulo, opciones).then(() => avisarClientes(d))
  );
});

async function avisarClientes(d) {
  try {
    const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const msg = d && d.tipo === 'push-estado'
      ? { tipo: 'push-estado', viaje_id: d.viaje_id || null, estado: d.estado || null }
      : { tipo: 'push-viaje', viaje_id: (d && d.viaje_id) || null };
    lista.forEach((c) => { try { c.postMessage(msg); } catch (e) {} });
  } catch (e) {}
}

/* ---------- Clic en la notificación: abre/enfoca la app ---------- */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || './app.html';
  event.waitUntil(
    (async () => {
      try {
        const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of lista) {
          try {
            if (c.url === url || c.url.endsWith('/app.html') || c.url.endsWith('/drivxi.html') || c.url.endsWith('/index.html')) {
              await c.focus();
              try { c.postMessage({ tipo: 'abrir-viaje', viaje_id: data.viaje_id || null }); } catch (e) {}
              return;
            }
          } catch (e) {}
        }
      } catch (e) {}
      try {
        const absoluto = new URL(url, self.registration.scope).href;
        await self.clients.openWindow(absoluto);
      } catch (e) {}
    })()
  );
});
