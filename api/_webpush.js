// api/_webpush.js — configura o web-push com as chaves VAPID (uma vez por instância)
const webpush = require('web-push');

let configured = false;

function getWebPush() {
  if (!configured) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:contato@gooddayapp.com.br';
    if (!publicKey || !privateKey) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configuradas.');
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return webpush;
}

module.exports = { getWebPush };
