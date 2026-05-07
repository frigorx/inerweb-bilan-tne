/**
 * build.js — inerWeb Bilan d'année 2nde TNE
 * Construit data/bilan-tne.enc à partir de data/bilan-tne.json + assets/svg-frigo + assets/svg-electrotech
 *
 * 1. Lit la banque de questions (clair)
 * 2. Charge tous les SVG sanitisés et les injecte dans le payload
 * 3. Chiffre AES-GCM 256 (PBKDF2 200 000 itérations) avec passphrase BILAN-TNE-2026
 * 4. Sort data/bilan-tne.enc (base64)
 *
 * Usage : node build/build.js [--password=BILAN-TNE-2026]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const FICHIER_QUESTIONS = path.join(ROOT, 'data', 'bilan-tne.json');
const DIR_SVG_FRIGO = path.join(ROOT, 'assets', 'svg-frigo');
const DIR_SVG_ELECTRO = path.join(ROOT, 'assets', 'svg-electrotech');
const FICHIER_OUT_ENC = path.join(ROOT, 'data', 'bilan-tne.enc');
const FICHIER_OUT_DEBUG = path.join(ROOT, 'data', 'bilan-tne.enc.json');

// Passphrase
let password = 'BILAN-TNE-2026';
process.argv.slice(2).forEach(a => { if (a.startsWith('--password=')) password = a.slice('--password='.length); });

// 1. Lire la banque
if (!fs.existsSync(FICHIER_QUESTIONS)) {
  console.error('[ERREUR] Fichier introuvable : ' + FICHIER_QUESTIONS);
  console.error('[INFO] Lance d\'abord la rédaction de la banque (agent ou manuel).');
  process.exit(1);
}
const banque = JSON.parse(fs.readFileSync(FICHIER_QUESTIONS, 'utf8'));
console.log('[INFO] Banque chargée : ' + (banque.questions || []).length + ' questions, ' + (banque.themes || []).length + ' thèmes.');

// 2. Charger les SVG
function chargerSvgs(dir, prefix) {
  if (!fs.existsSync(dir)) { console.warn('[WARN] Dossier absent : ' + dir); return []; }
  const fichiers = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.svg')).sort();
  return fichiers.map(f => ({
    id: f.replace(/\.svg$/, ''),
    svg: fs.readFileSync(path.join(dir, f), 'utf8').replace(/\s+/g, ' ').trim()
  }));
}
banque.symboles_frigo = chargerSvgs(DIR_SVG_FRIGO, 'sf_');
banque.symboles_electrotech = chargerSvgs(DIR_SVG_ELECTRO, 'se_');
console.log('[INFO] ' + banque.symboles_frigo.length + ' SVG frigo + ' + banque.symboles_electrotech.length + ' SVG électrotech intégrés.');

// 3. Sérialiser
const jsonClair = JSON.stringify(banque);
console.log('[INFO] Payload total : ' + jsonClair.length + ' caractères.');

// 4. Chiffrement AES-GCM
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
console.log('[INFO] Dérivation PBKDF2 (200 000 itérations)...');
const t0 = Date.now();
const key = crypto.pbkdf2Sync(password, salt, 200000, 32, 'sha256');
console.log('[INFO] Clé dérivée en ' + (Date.now() - t0) + ' ms.');

const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(jsonClair, 'utf8'), cipher.final()]);
const authTag = cipher.getAuthTag();
const fullCipher = Buffer.concat([ciphertext, authTag]);

const blob = {
  v: '1', alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iter: 200000,
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  ct: fullCipher.toString('base64')
};
const blobBase64 = Buffer.from(JSON.stringify(blob), 'utf8').toString('base64');

fs.writeFileSync(FICHIER_OUT_ENC, blobBase64);
fs.writeFileSync(FICHIER_OUT_DEBUG, JSON.stringify(blob, null, 2));
console.log('[OK] ' + FICHIER_OUT_ENC + ' (' + blobBase64.length + ' chars).');

// 5. Test déchiffrement
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);
const dechiffre = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
if (dechiffre !== jsonClair) { console.error('[ERREUR] Déchiffrement invalide.'); process.exit(1); }
console.log('[OK] Vérification d\'intégrité réussie.');
console.log('[FIN] Mot de passe utilisé : ' + password + ' — à fournir aux élèves à la connexion.');
