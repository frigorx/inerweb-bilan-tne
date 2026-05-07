/**
 * update-passphrase.js — Met à jour le param code_aes dans le Sheet via update_settings
 */
const https = require('https');

const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxsBftvAR73qXbWIqSDm2pIgNMHtMHq5QDJaCVQ_9tp0iVjGv6LxAch49bvVVhOMyJ4/exec';
const CODE_PROF = 'LPPJR2026';
const NOUVELLE_PASSPHRASE = '2tne2526';

function postFollow(urlStr, body) {
  return new Promise((resolve, reject) => {
    const u = new globalThis.URL(urlStr);
    const data = JSON.stringify(body);
    const opts = { method: 'POST', hostname: u.hostname, path: u.pathname + u.search, headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(data) } };
    const req = https.request(opts, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const u2 = new globalThis.URL(res.headers.location);
        https.get(u2, r2 => { let d = ''; r2.on('data', c => d += c); r2.on('end', () => resolve(d)); }).on('error', reject);
        return;
      }
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

(async () => {
  const res = await postFollow(ENDPOINT + '?action=update_settings', {
    code: CODE_PROF,
    updates: { code_aes: NOUVELLE_PASSPHRASE, 'ouvert_2TNE': 'true' }
  });
  console.log('Réponse :', res);

  // Vérification
  const get = await postFollow(ENDPOINT + '?action=get_settings', { code: CODE_PROF });
  const obj = JSON.parse(get);
  console.log('code_aes actuel :', obj.params && obj.params.code_aes);
})();
