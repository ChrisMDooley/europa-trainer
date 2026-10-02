/* sw.js — Europa-Trainer offline cache. Network first (updates arrive), cache as fallback.
   Bump VERSION on every release. */
const VERSION = 'europa-v1.2.0';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/europa.css', 'icons/icon.svg',
  'data/curriculum.js', 'data/map.js',
  'js/speech.js', 'js/spelling.js', 'js/model.js', 'js/progress.js', 'js/questions.js', 'js/session.js',
  'js/platform.js', 'js/ui.js', 'js/mapview.js', 'js/practice.js', 'js/screens.js', 'js/app.js',
  'fonts/atkinson-hyperlegible-latin-400-normal.woff2', 'fonts/atkinson-hyperlegible-latin-700-normal.woff2',
  'fonts/OpenDyslexic-Regular.woff', 'fonts/OpenDyslexic-Bold.woff'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
