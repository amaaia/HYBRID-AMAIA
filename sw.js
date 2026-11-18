/* Service worker: la app abre sin conexión (gimnasio sin cobertura).
   - index.html: primero red, si falla la copia guardada.
   - Librería de Supabase y fuentes: copia guardada y se actualiza en segundo plano.
   - Las llamadas a Supabase (datos) nunca se guardan aquí. */
const CACHE='hyrox-v2';
const CORE=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
 if(u.origin===location.origin&&u.pathname.includes('/app/'))return; // la app pública tiene su propio service worker
 if(r.mode==='navigate'||(u.origin===location.origin&&/index\.html$|\/$/.test(u.pathname))){e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(CACHE).then(c=>c.put('index.html',cp));return res}).catch(()=>caches.match('index.html')));return}
 const lib=/cdn\.jsdelivr\.net$|fonts\.googleapis\.com$|fonts\.gstatic\.com$/.test(u.hostname);
 if(u.origin===location.origin||lib){e.respondWith(caches.match(r).then(hit=>{const net=fetch(r).then(res=>{if(res&&(res.ok||res.type==='opaque')){const cp=res.clone();caches.open(CACHE).then(c=>c.put(r,cp))}return res}).catch(()=>hit);return hit||net}))}
});
