// =============================================
//  Homelytic Service Worker
//  Strategi: Cache-First dengan Network Fallback
// =============================================

const APP_NAME    = 'homelytic';
const CACHE_VER   = 'v1.0.1';
const CACHE_NAME  = `${APP_NAME}-static-${CACHE_VER}`;
const DATA_CACHE  = `${APP_NAME}-data-${CACHE_VER}`;

// Aset inti yang wajib di-cache saat install
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './assets/style.css',
  './icons/icon-192x192-C.png',
  './icons/icon-512x512-D.png',
  './offline.html',
];

// =============================================
//  INSTALL — cache semua aset inti
// =============================================
self.addEventListener('install', event => {
  console.log(`[Homelytic SW] Install — ${CACHE_NAME}`);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err =>
              console.warn(`[Homelytic SW] Gagal cache: ${url}`, err)
            )
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// =============================================
//  ACTIVATE — hapus cache lama
// =============================================
self.addEventListener('activate', event => {
  console.log(`[Homelytic SW] Aktif — ${CACHE_NAME}`);

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name =>
              name.startsWith(APP_NAME) &&
              name !== CACHE_NAME &&
              name !== DATA_CACHE
            )
            .map(name => {
              console.log(`[Homelytic SW] Hapus cache lama: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// =============================================
//  FETCH — strategi per jenis request
// =============================================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (!request.url.startsWith('http')) return;

  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached =>
          cached || fetch(request).then(response => {
            cache.put(request, response.clone());
            return response;
          })
        )
      )
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request)
        .then(cached => cached || fetch(request)
          .then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(c => c.put(request, clone));
            }
            return response;
          })
          .catch(() => caches.match('./offline.html')
            .then(offlinePage => offlinePage || new Response(
              offlinePage_fallback(),
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            ))
          )
        )
    );
    return;
  }

  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(c => c.put(request, clone));
            }
            return response;
          });
        })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(DATA_CACHE).then(c => c.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// =============================================
//  SYNC — background sync
// =============================================
self.addEventListener('sync', event => {
  if (event.tag === 'sync-tasks') {
    console.log('[Homelytic SW] Background sync: sync-tasks');
    event.waitUntil(syncTasks());
  }
});

async function syncTasks() {
  console.log('[Homelytic SW] Sinkronisasi tugas selesai');
}

// =============================================
//  PUSH — notifikasi push
// =============================================
self.addEventListener('push', event => {
  let data = { title: 'Homelytic', body: 'Ada pengingat perawatan rumah!' };

  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    './icons/icon-192x192-C.png',
      badge:   './icons/icon-192x192-C.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url || './index.html' },
      actions: [
        { action: 'open',    title: 'Buka Aplikasi' },
        { action: 'dismiss', title: 'Abaikan'       },
      ],
    })
  );
});

// =============================================
//  NOTIFICATION CLICK
// =============================================
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : './index.html';

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if (client.url.includes('index.html') && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});

// =============================================
//  MESSAGE — komunikasi dari halaman utama
// =============================================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VER });
  }
});

// =============================================
//  OFFLINE PAGE FALLBACK (inline)
// =============================================
function offlinePage_fallback() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Homelytic — Offline</title>
  <style>
    body {
      font-family: 'DM Sans', sans-serif;
      background: #1a3a2a;
      color: #f5f0e8;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      text-align: center;
      padding: 24px;
    }
    .icon { font-size: 72px; margin-bottom: 20px; }
    h1 { font-size: 1.5rem; margin-bottom: 10px; }
    p  { font-size: 0.9rem; color: #a8d5b5; line-height: 1.6; max-width: 300px; }
    button {
      margin-top: 24px;
      padding: 12px 28px;
      background: #c8a84b;
      color: #1a3a2a;
      border: none;
      border-radius: 12px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="icon">🏡</div>
  <h1>Kamu sedang offline</h1>
  <p>Periksa koneksi internetmu dan coba lagi. Data terakhirmu tetap tersimpan di perangkat.</p>
  <button onclick="location.reload()">Coba Lagi</button>
</body>
</html>`;
}