// sw.js — Service Worker do Good Day: recebe pushes e mostra notificações,
// mesmo com o app fechado ou o navegador minimizado.

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  let data = { title: 'Good Day', body: 'Você tem um lembrete.' };
  try { if (event.data) data = event.data.json(); } catch (e) {}

  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'good-day-reminder',
    renotify: true,
    data: { url: '/' }
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Good Day', options));
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
