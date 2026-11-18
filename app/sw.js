/* Service worker: la app abre sin conexión. HTML y módulos: primero red y, si falla, la copia guardada.
   Las llamadas a la base de datos y al coach nunca se guardan aquí. */
const CACHE = 'rh-v1';
const CORE = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/main.js', 'js/util.js', 'js/store.js', 'js/engine.js', 'js/paces.js', 'js/ui.js', 'js/views.js', 'js/session.js', 'js/guide.js', 'js/onboarding.js', 'js/ai.js', 'js/cloud.js', 'js/config.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const same = u.origin === location.origin, lib = u.hostname === 'cdn.jsdelivr.net';
  if (!same && !lib) return;
  e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return res; })
    .catch(() => caches.match(r).then(hit => hit || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
