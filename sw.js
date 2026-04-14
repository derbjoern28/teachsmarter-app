/* ═══════════════════════════════════════════
   TeachSmarter Service Worker — Offline-First
   Scope: nur eigene Origin + date.nager.at
   ═══════════════════════════════════════════ */

const CACHE = 'teachsmarter-v38';

const SHELL = [
  './TeachSmarter_Dashboard.html',
  './TeachSmarter_App_Onboarding.html',
  './ts-icon.svg',
  './manifest.json',
  './ts-style.css',
  './ts-core.js',
  './ts-ferien.js',
  './ts-kalender.js',
  './ts-events.js',
  './ts-planung.js',
  './ts-stunde.js',
  './ts-klassen.js',
  './ts-app.js',
  './ts-tools.js',
  './impressum.html',
  './datenschutz.html',
  './support.html',
];

/* ── Install: App Shell cachen ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: alte Caches löschen ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: Strict Scope ── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* Externe Requests: NUR date.nager.at (Feiertage), Network-first + Cache-Fallback mit 7-Tage-TTL */
  if(url.origin !== self.location.origin) {
    if(url.hostname === 'date.nager.at') {
      const HOLIDAY_TTL = 7 * 24 * 60 * 60 * 1000; // 7 Tage in ms
      const tsKey = e.request.url + '__ts';

      e.respondWith(
        caches.open(CACHE).then(async cache => {
          // Prüfe Cache-Alter
          const tsResp = await cache.match(tsKey);
          const ts = tsResp ? Number(await tsResp.text()) : 0;
          const stale = !ts || (Date.now() - ts > HOLIDAY_TTL);

          // Wenn Cache frisch: direkt zurückgeben
          if(!stale) {
            const cached = await cache.match(e.request);
            if(cached) return cached;
          }

          // Network-first: frisch laden und cachen
          return fetch(e.request)
            .then(r => {
              if(r.ok) {
                cache.put(e.request, r.clone());
                cache.put(tsKey, new Response(String(Date.now())));
              }
              return r;
            })
            .catch(async () => {
              // Offline-Fallback: veralteten Cache lieber als gar nichts
              return (await cache.match(e.request)) || new Response(JSON.stringify([]), { headers: {'Content-Type':'application/json'} });
            });
        })
      );
    }
    /* Alle anderen externen Requests: nicht abfangen */
    return;
  }

  /* Gleiche Origin: Stale-While-Revalidate */
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      const networkFetch = fetch(e.request)
        .then(r => {
          if(r.ok) cache.put(e.request, r.clone());
          return r;
        })
        .catch(() => null);
      return cached || await networkFetch;
    })
  );
});
