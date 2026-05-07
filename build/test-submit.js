/**
 * test-submit.js — Simule un submit_result complet (comme arcade.html).
 * Permet de valider la chaîne sans navigateur.
 */
const https = require('https');
const crypto = require('crypto');

const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxsBftvAR73qXbWIqSDm2pIgNMHtMHq5QDJaCVQ_9tp0iVjGv6LxAch49bvVVhOMyJ4/exec';
const HMAC_SECRET = 'inerWeb-FH-2026-bilan-tne-secret-hmac-key';

function hmac(s) { return crypto.createHmac('sha256', HMAC_SECRET).update(s).digest('base64'); }

function postFollow(urlStr, body) {
  return new Promise((resolve, reject) => {
    const u = new globalThis.URL(urlStr);
    const data = JSON.stringify(body);
    const opts = { method: 'POST', hostname: u.hostname, path: u.pathname + u.search, headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(data) } };
    const req = https.request(opts, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const u2 = new globalThis.URL(res.headers.location);
        https.get(u2, r2 => {
          let d = ''; r2.on('data', c => d += c); r2.on('end', () => resolve(d));
        }).on('error', reject);
        return;
      }
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

(async () => {
  const classe='TEST', pseudo='PILOTE01', note20=14.4, scorePct=72, total=50, correct=36, dureeSec=2840;
  const donnees = classe+':'+pseudo+':'+note20+':'+scorePct+':'+total+':'+correct+':'+dureeSec;
  const sig = hmac(donnees);
  console.log('Données HMAC :', donnees);
  console.log('Signature   :', sig.slice(0, 20) + '...');

  const payload = {
    classe, pseudo, nom_initiale: 'Test A.',
    note_20: note20, score_pct: scorePct,
    nb_questions: total, nb_correctes: correct, duree_sec: dureeSec,
    sous_notes_themes: {
      secu_elec: { label: 'Sécurité élec', total: 8, correct: 6, pct: 75 },
      hauteur: { label: 'Hauteur', total: 5, correct: 4, pct: 80 },
      responsabilite: { label: 'Responsabilité', total: 3, correct: 2, pct: 67 },
      fgaz: { label: 'F-GAZ', total: 7, correct: 5, pct: 71 },
      thermo: { label: 'Thermo', total: 7, correct: 4, pct: 57 },
      frigo: { label: 'Frigo', total: 6, correct: 5, pct: 83 },
      electrotech: { label: 'Électrotech', total: 8, correct: 5, pct: 63 },
      ri_classe: { label: 'RI', total: 3, correct: 3, pct: 100 },
      orientation: { label: 'Orientation', total: 3, correct: 2, pct: 67 }
    },
    detail_questions: [
      { id: 'q001', theme: 'secu_elec', ok: true, choix_index: 2 },
      { id: 'q065', theme: 'thermo', ok: true, choix_index: 1 }
    ],
    focus_perdu_count: 1, reconnect_count: 0, token_changes: 0,
    devtools_ouvert: false,
    hmac_signature: sig
  };

  console.log('\n=== Envoi submit_result ===');
  const res = await postFollow(ENDPOINT + '?action=submit_result', payload);
  console.log('Réponse :', res.slice(0, 400));
})();
