/* DRIVXI Service Worker · notificaciones push (cajón del celular) + caché ligera */
const CACHE_NAME = 'drivxi-cache-v2';
const URLS_TO_CACHE = ['./', './index.html', './app.html', './viaje.html', './manifest.json', './icon-192.png', './icon-512.png'];

/* ---------- INSTALACIÓN: nunca falla aunque algún archivo no exista en el repositorio ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(URLS_TO_CACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    } catch (e) { /* sin caché igual se activa */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
    } catch (e) {}
    await self.clients.claim();
  })());
});

/* ---------- RED: rápido y siempre actualizado ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  // Supabase, Google Maps, fuentes y CDN van DIRECTO a la red (sin pasar por el service worker = más rápido)
  if (url.origin !== self.location.origin) return;

  const esPagina = req.mode === 'navigate' || /\.html?$/i.test(url.pathname) || url.pathname.endsWith('/');
  if (esPagina) {
    // Páginas: siempre la versión más reciente de GitHub; la copia local solo se usa sin internet
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copia = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(url.origin + url.pathname, copia)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Iconos y manifest: copia local inmediata y se actualiza en segundo plano
  event.respondWith(
    caches.match(req).then((cacheada) => {
      const red = fetch(req).then((res) => {
        if (res && res.ok) {
          const copia = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copia)).catch(() => {});
        }
        return res;
      }).catch(() => cacheada);
      return cacheada || red;
    })
  );
});

/* ---------- PUSH: muestra el aviso en el cajón del celular aunque la app esté cerrada ---------- */
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
            if (c.url === url || c.url.endsWith('/app.html') || c.url.endsWith('/index.html')) {
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
