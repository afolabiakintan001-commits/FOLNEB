const CACHE_NAME = 'folneb-v1';
const PRECACHE_URLS = [
  '/',
  'index.html',
  'home.html',
  'converter.html',
  'main.css',
  'main.js',
  'converter.js',
  'src/assets/images/FOLNEB-horizontal.png',
  'src/assets/images/FOLNEB-logo.png',
  'src/assets/images/FOLNEB-logo-transparent.png',
  'src/assets/images/FOLNEB-story.png',
  'src/js/lib/pdf.min.js',
  'src/js/lib/pdf.worker.min.js',
  'src/js/lib/html2canvas.min.js',
  'src/js/lib/pdf-lib.min.js',
  'src/js/lib/jspdf.umd.min.js',
  'src/js/lib/mammoth.min.js',
  'src/js/lib/xlsx.full.min.js',
  'src/js/lib/tesseract.min.js',
  'src/js/lib/jszip.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((res) => {
        try { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, copy)); } catch {}
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

