/* ═══════════════════════════════════════════
   TeachSmarter Service Worker — Offline-First
   Scope: nur eigene Origin + date.nager.at
   ═══════════════════════════════════════════ */

const CACHE = 'teachsmarter-v49';

/* Cloudflare Pages liefert HTML-Dateien ohne .html-Extension (Pretty URLs).
   Alle Shell-URLs daher ohne .html — sonst 308-Redirect und Cache-Miss. */
const SHELL = [
  '/TeachSmarter_Dashboard',
  '/ts-icon.svg',
  '/manifest.json',
  '/ts-style.css',
  '/ts-core.js',
  '/ts-ferien.js',
  '/ts-kalender.js',
  '/ts-events.js',
  '/ts-planung.js',
  '/ts-stunde.js',
  '/ts-klassen.js',
  '/ts-app.js',
  '/ts-tools.js',
  '/ts-icon-192.png',
  '/impressum',
  '/datenschutz',
  '/support',
];

/* Hilfsfunktion: nur cachen wenn ok (redirected ist ok für same-origin) */
function safePut(cache, request, response) {
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
}

/* ── Install: App Shell cachen ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(
        SHELL.map(url =>
          fetch(url, { redirect: 'follow' })
            .then(r => safePut(cache, url, r))
            .catch(() => { /* einzelne Fehler blockieren nicht */ })
        )
      )
    ).then(() => self.skipWaiting())
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

  /* .html-URLs: SW nicht einmischen — Chrome folgt dem Cloudflare 308-Redirect nativ.
     SW-generierte Redirects für Navigation-Requests führen in Chrome zu ERR_FAILED. */
  if (url.pathname.endsWith('.html')) return;

  /* Externe Requests: NUR date.nager.at (Feiertage), Network-first + Cache-Fallback mit 7-Tage-TTL */
  if (url.origin !== self.location.origin) {
    if (url.hostname === 'date.nager.at') {
      const HOLIDAY_TTL = 7 * 24 * 60 * 60 * 1000;
      const tsKey = e.request.url + '__ts';

      e.respondWith(
        caches.open(CACHE).then(async cache => {
          const tsResp = await cache.match(tsKey);
          const ts = tsResp ? Number(await tsResp.text()) : 0;
          const stale = !ts || (Date.now() - ts > HOLIDAY_TTL);

          if (!stale) {
            const cached = await cache.match(e.request);
            if (cached) return cached;
          }

          return fetch(e.request)
            .then(r => {
              safePut(cache, e.request, r);
              if (r.ok && !r.redirected) cache.put(tsKey, new Response(String(Date.now())));
              return r;
            })
            .catch(async () => {
              return (await cache.match(e.request)) ||
                new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });
            });
        })
      );
    }
    /* Alle anderen externen Requests: nicht abfangen */
    return;
  }

  /* Gleiche Origin: Cache-first, Stale-While-Revalidate */
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);

      /* Im Hintergrund revalidieren — nur ok + nicht-redirected cachen */
      const networkFetch = fetch(e.request, { redirect: 'follow' })
        .then(r => {
          safePut(cache, e.request, r);
          return r;
        })
        .catch(() => null);

      /* Cache-Treffer: sofort zurückgeben */
      if (cached) {
        networkFetch.catch(() => {});
        return cached;
      }

      /* Kein Cache: Netzwerk abwarten */
      const response = await networkFetch;
      if (response) return response;

      /* Fallback: Dashboard aus Cache */
      return (
        await cache.match('/TeachSmarter_Dashboard') ||
        new Response(
          '<h2 style="font-family:sans-serif;padding:2rem;color:#3BA89B">TeachSmarter wird geladen…<br><small style="color:#999">Bitte kurz warten und Seite neu laden.</small></h2>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      );
    })
  );
});
