// sw.js — Service Worker do Good Day: recebe pushes e mostra notificações,
// mesmo com o app fechado ou o navegador minimizado.

self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

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
