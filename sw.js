// Service worker minimo: cachea el cascaron de la app para que abra rapido
// y cumple el requisito de instalabilidad (evento fetch) para empacar la
// PWA como APK (Trusted Web Activity).
const CACHE = 'yes-validador-v1';
const ARCHIVOS = ['./scanner.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Red primero (para no servir una version vieja del escaner), con la
// cache como respaldo si no hay conexion.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copia));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
