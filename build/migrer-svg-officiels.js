/**
 * migrer-svg-officiels.js
 * Remplace les SVG (frigo + électrotech) par ceux de la bibliothèque officielle
 * F. Henninot (inerweb_symboles.json — 348 symboles).
 *
 * Source : C:/Users/henni/OneDrive/Bureau/inerWeb/Symboles/inerweb_symboles.json
 * Cible  : assets/svg-frigo/sf_XX.svg + assets/svg-electrotech/se_XX.svg
 *
 * On utilise svg_avec (avec bornes 13-14, A1-A2…) car les chiffres de bornes
 * sont pédagogiquement essentiels et ne révèlent pas le nom du composant.
 * On vérifie qu'aucun mot-clé du nom n'apparaît en clair dans le SVG.
 */
const fs = require('fs');
const path = require('path');

const SOURCE_JSON = 'C:/Users/henni/OneDrive/Bureau/inerWeb/Symboles/inerweb_symboles.json';
const ROOT = path.resolve(__dirname, '..');
const DIR_FRIGO = path.join(ROOT, 'assets', 'svg-frigo');
const DIR_ELECTRO = path.join(ROOT, 'assets', 'svg-electrotech');

// Mapping QCM ID → ID dans la bibliothèque officielle
const MAPPING_FRIGO = {
  'sf_01': { src: 'compresseur_general',    nom: 'Compresseur (générique)' },
  'sf_02': { src: 'echangeur_a_plaques',     nom: 'Condenseur (échangeur à plaques)' },
  'sf_03': { src: 'detendeur_thermo_ext',    nom: 'Détendeur thermostatique' },
  'sf_04': { src: 'electrovanne_frigo',      nom: 'Électrovanne frigo' },
  'sf_05': { src: 'bouteille_liquide',       nom: 'Bouteille liquide' },
  'sf_06': { src: 'echangeur_a_air',         nom: 'Évaporateur (échangeur à air)' },
  'sf_07': { src: 'filtre_deshydrateur',     nom: 'Filtre déshydrateur' },
  'sf_08': { src: 'voyant_liquide',          nom: 'Voyant liquide' },
  'sf_09': { src: 'compresseur_piston',      nom: 'Compresseur piston' }
};

const MAPPING_ELECTRO = {
  'se_01': { src: 'contact_no_13_14',                 nom: 'Contact NO 13-14' },
  'se_02': { src: 'contact_nf_21_22',                 nom: 'Contact NF 21-22' },
  'se_03': { src: 'contact_no_temporise_travail',     nom: 'Contact NO temporisé travail' },
  'se_04': { src: 'bobine_contacteur',                nom: 'Bobine de contacteur (A1-A2)' },
  'se_05': { src: 'contact_puissance_3p_no',          nom: 'Contact puissance tripolaire NO' },
  'se_06': { src: 'relais_thermique',                 nom: 'Relais thermique (95-96 / 97-98)' },
  'se_07': { src: 'fusible_1p',                       nom: 'Fusible 1P' },
  'se_08': { src: 'sectionneur_porte_fus_1p',         nom: 'Porte-fusible' },
  'se_09': { src: 'disjoncteur_magneto_therm_2p',     nom: 'Disjoncteur magnéto-thermique 2P' }, // ré-affecté : on n'avait que 1P avant
  'se_10': { src: 'disjoncteur_2p',                   nom: 'Disjoncteur 2P' },
  'se_11': { src: 'disjoncteur_3p',                   nom: 'Disjoncteur 3P' },
  'se_12': { src: 'disjoncteur_3p_n',                 nom: 'Disjoncteur 4P (3P+N)' },
  'se_13': { src: 'sectionneur_3p',                   nom: 'Sectionneur 3P' },
  'se_14': { src: 'pressostat_hp',                    nom: 'Pressostat HP' },                    // bonus : utile pour la croix du frigoriste
  'se_15': { src: 'pressostat_bp',                    nom: 'Pressostat BP' }                     // bonus
};

// Mots qui ne doivent JAMAIS apparaître dans le SVG (révèleraient le nom au QCM)
const MOTS_INTERDITS_FRIGO = ['compresseur', 'compres', 'detendeur', 'détendeur', 'electrovanne', 'électrovanne', 'bouteille', 'echangeur', 'échangeur', 'evaporateur', 'évaporateur', 'condenseur', 'filtre', 'deshydrateur', 'déshydrateur', 'voyant', 'piston', 'scroll'];
const MOTS_INTERDITS_ELECTRO = ['contact', 'bobine', 'contacteur', 'thermique', 'fusible', 'disjoncteur', 'sectionneur', 'pressostat', 'porte-fus'];

function sanitiseLeger(svg) {
  // Retire UNIQUEMENT ce qui pourrait spoiler. Garde les <text> avec chiffres de bornes.
  return svg
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<desc>[\s\S]*?<\/desc>/gi, '')
    .replace(/<metadata>[\s\S]*?<\/metadata>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function verifierAnonymat(svg, motsInterdits, id) {
  const svgLower = svg.toLowerCase();
  const interdits = motsInterdits.filter(m => svgLower.includes(m.toLowerCase()));
  if (interdits.length > 0) {
    console.warn('  ⚠ ' + id + ' contient mot(s) interdit(s) :', interdits.join(', '));
    return false;
  }
  return true;
}

function lireSymbole(banque, srcId) {
  const sym = banque.symbols.find(s => s.id === srcId);
  if (!sym) throw new Error('Symbole introuvable : ' + srcId);
  return sym;
}

function migrer(banque, mapping, dirCible, motsInterdits) {
  const lignesMapping = [];
  Object.keys(mapping).forEach(qcmId => {
    const cible = mapping[qcmId];
    const sym = lireSymbole(banque, cible.src);
    // Préférer svg_sans (déjà dépouillé) sinon svg_avec
    let svg = sym.svg_sans || sym.svg_avec;
    if (!svg) throw new Error('Pas de SVG pour ' + cible.src);
    const sain = sanitiseLeger(svg);
    const ok = verifierAnonymat(sain, motsInterdits, qcmId);
    fs.writeFileSync(path.join(dirCible, qcmId + '.svg'), sain);
    lignesMapping.push('| ' + qcmId + ' | ' + cible.nom + ' | ' + cible.src + ' | ' + (ok ? '✓' : '⚠') + ' |');
    console.log('  ' + (ok ? '✓' : '⚠') + ' ' + qcmId + ' ← ' + cible.src + '  (' + sain.length + ' chars)');
  });
  return lignesMapping;
}

(function main() {
  console.log('Lecture biblio officielle…');
  const banque = JSON.parse(fs.readFileSync(SOURCE_JSON, 'utf8'));
  console.log('  → ' + banque.symbols.length + ' symboles disponibles\n');

  console.log('=== Migration FRIGO ===');
  const frigoLignes = migrer(banque, MAPPING_FRIGO, DIR_FRIGO, MOTS_INTERDITS_FRIGO);

  console.log('\n=== Migration ÉLECTROTECH ===');
  const elecLignes = migrer(banque, MAPPING_ELECTRO, DIR_ELECTRO, MOTS_INTERDITS_ELECTRO);

  // MAPPING.md (à conserver localement, hors GitHub Pages)
  const md = `# MAPPING SVG — bilan TNE

> Correspondance entre les IDs neutres affichés dans le QCM et les symboles
> officiels de la bibliothèque inerweb_symboles.json (F. Henninot).
>
> ⚠ Ce fichier ne doit JAMAIS être publié — il révèle les bonnes réponses.

## Frigo
| ID QCM | Composant | Source biblio | Anonymat |
|---|---|---|---|
${frigoLignes.join('\n')}

## Électrotechnique
| ID QCM | Composant | Source biblio | Anonymat |
|---|---|---|---|
${elecLignes.join('\n')}

## Bonus
- se_14 = Pressostat HP — réaffecté depuis "Protection magnétique seule" pour mieux servir la croix du frigoriste
- se_15 = Pressostat BP — idem

Migration : ${new Date().toISOString()}
`;
  fs.writeFileSync(path.join(ROOT, 'MAPPING.md'), md);
  console.log('\n✅ MAPPING.md mis à jour à la racine.');
})();
