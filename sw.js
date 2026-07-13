// sw.js — Service Worker do Good Day
// Mantém o cache original do app (para carregamento rápido/offline) e
// adiciona o recebimento de notificações push, mesmo com o app fechado.

const CACHE = 'goodday-v5';
const ASSETS = ['/', '/index.html', '/app.js', '/style.css', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith('http')) return;
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      var rc = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, rc)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request))
  );
});

// ─── NOTIFICAÇÕES PUSH ───────────────────────────────────────────────────────
self.addEventListener('push', function (event) {
  console.log('[Good Day SW] evento push recebido. Tem dados?', !!(event && event.data));
  let data = { title: 'Good Day', body: 'Você tem um lembrete.' };
  try {
    if (event.data) {
      const text = event.data.text();
      console.log('[Good Day SW] payload bruto:', text);
      data = JSON.parse(text);
    }
  } catch (e) {
    console.error('[Good Day SW] erro ao ler payload:', e);
  }

  console.log('[Good Day SW] mostrando notificação:', data);

  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'good-day-reminder',
    renotify: true,
    data: { url: '/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Good Day', options)
      .then(() => console.log('[Good Day SW] showNotification concluído com sucesso.'))
      .catch(e => console.error('[Good Day SW] showNotification falhou:', e))
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
