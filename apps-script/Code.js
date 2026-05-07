/**
 * Code.gs — Apps Script inerWeb Bilan d'année 2nde TNE
 * inerWeb Édu — F. Henninot, LP Privé Jacques Raynaud, Campus ÉQUATIO Marseille
 *
 * Backend pour :
 *   - arcade.html (élève — quiz "Cockpit Frigo", 50 Q en 60 min)
 *   - tableau-bord-live.html (prof — surveillance temps réel)
 *   - tableau-bord.html (prof — bilan post-épreuve + radar)
 *
 * Onglets Sheet utilisés :
 *   - tne_comptes      (auth élève : pseudo + classe + mdp hashé + nom optionnel)
 *   - tne_resultats    (notes /20 + sous-stats par thème)
 *   - tne_live         (heartbeats temps réel — last write wins)
 *   - tne_logs         (sécurité : devtools, focus perdu, reconnect)
 *   - tne_params       (paramètres globaux : ouverture classe, code prof, code AES)
 *
 * Déploiement :
 *   1. Ouvrir Apps Script (script.google.com), nouveau projet
 *   2. Coller ce fichier dans Code.gs
 *   3. Coller appsscript.json dans le manifeste
 *   4. Lancer manuellement initialiser() une fois pour créer les onglets
 *   5. Déployer comme application web : "Tout le monde", "Exécuter en mon nom"
 *   6. Copier l'URL /exec dans arcade.html, tableau-bord-live.html, tableau-bord.html
 *   7. Créer un trigger horaire keepAlive() toutes les 5 min
 */

// ========================
// CONSTANTES À CONFIGURER
// ========================
const SHEET_ID = '16T1T3yL6M49OhJUQS1SmFHwW7Bywp7m2kSXDiXdmItk'; // Sheet collecteur universel inerWeb
const ONGLET_COMPTES = 'tne_comptes';
const ONGLET_RESULTATS = 'tne_resultats';
const ONGLET_LIVE = 'tne_live';
const ONGLET_LOGS = 'tne_logs';
const ONGLET_PARAMS = 'tne_params';

const CODE_LPPJR = 'LPPJR2026';                                  // Code prof — modifiable via params
const HMAC_SECRET = 'inerWeb-FH-2026-bilan-tne-secret-hmac-key'; // Modifiable
const MODULE = 'inerweb-bilan-tne';
const VERSION = '1.0';

const CLASSES_AUTORISEES = ['2TNE-A', '2TNE-B', '2TNE-C', 'TEST'];
const LIMITE_COMPTES_PAR_CLASSE = 40;
const LOCKOUT_DUREE_MS = 5 * 60 * 1000;
const LOCKOUT_MAX_ESSAIS = 5;
const SEUIL_RECONNECT_MS = 60 * 1000;        // Gap > 60s = reconnexion comptée
const SEUIL_INACTIF_LIVE_MS = 30 * 1000;     // Pas de heartbeat > 30s = à risque

// ========================
// ROUTAGE
// ========================
function doGet(e) { return handleRequest(e, 'GET'); }
function doPost(e) { return handleRequest(e, 'POST'); }

function handleRequest(e, methode) {
  e = e || { parameter: {}, postData: null };
  const action = ((e.parameter && e.parameter.action) || '').toLowerCase();
  let body = {};
  if (methode === 'POST' && e.postData && e.postData.contents) {
    try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
  }
  const params = Object.assign({}, e.parameter, body);

  let result;
  try {
    switch (action) {
      // --- Routes élève ---
      case 'check_pseudo':       result = checkPseudo(params); break;
      case 'create_account':     result = createAccount(params); break;
      case 'login':              result = login(params); break;
      case 'change_password':    result = changePassword(params); break;
      case 'heartbeat':          result = heartbeat(params); break;
      case 'submit_result':      result = submitResult(params); break;
      case 'log_event':          result = logEvent(params); break;
      case 'get_class_status':   result = getClassStatus(params); break;

      // --- Routes prof (code LPPJR) ---
      case 'live_status':        result = liveStatus(params); break;
      case 'list_accounts':      result = listAccounts(params); break;
      case 'list_results':       result = listResults(params); break;
      case 'list_logs':          result = listLogs(params); break;
      case 'reset_password':     result = resetPassword(params); break;
      case 'delete_account':     result = deleteAccount(params); break;
      case 'rename_pseudo':      result = renamePseudo(params); break;
      case 'reset_class_passwords': result = resetClassPasswords(params); break;
      case 'clear_class':        result = clearClass(params); break;
      case 'clear_live':         result = clearLive(params); break;
      case 'get_settings':       result = getSettings(params); break;
      case 'update_settings':    result = updateSettings(params); break;

      // --- Ping + keep-alive ---
      case 'ping':               result = { ok: true, version: VERSION, module: MODULE, ts: new Date().toISOString() }; break;

      default:
        result = { ok: false, error: 'Action inconnue : ' + action };
    }
  } catch (err) {
    result = { ok: false, error: 'Erreur serveur : ' + err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========================
// UTILITAIRES SHEET
// ========================
function getSheet(nom) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(nom);
  if (!sh) { sh = ss.insertSheet(nom); initSheet(sh, nom); }
  return sh;
}

function initSheet(sh, nom) {
  let entetes = [];
  switch (nom) {
    case ONGLET_COMPTES:
      entetes = ['classe', 'pseudo', 'nom_initiale', 'hash_mdp', 'salt', 'date_creation', 'derniere_connexion', 'nb_connexions', 'reset_demande', 'verrouille_jusqu_a', 'nb_essais_rates', 'token_session'];
      break;
    case ONGLET_RESULTATS:
      entetes = ['date', 'classe', 'pseudo', 'nom_initiale', 'note_20', 'score_pct', 'nb_questions', 'nb_correctes', 'duree_sec', 'sous_notes_themes', 'detail_questions', 'focus_perdu_count', 'reconnect_count', 'devtools_ouvert', 'token_changes', 'hmac_signature', 'invalidee'];
      break;
    case ONGLET_LIVE:
      entetes = ['classe', 'pseudo', 'nom_initiale', 'token', 'session_debut', 'dernier_heartbeat', 'derniere_action', 'q_courante', 'q_repondues', 'focus_perdu_count', 'reconnect_count', 'devtools_count', 'token_changes', 'fini', 'note_20'];
      break;
    case ONGLET_LOGS:
      entetes = ['date', 'type', 'classe', 'pseudo', 'message', 'token'];
      break;
    case ONGLET_PARAMS:
      sh.appendRow(['cle', 'valeur']);
      const defauts = [
        ['ouvert_2TNE-A', 'true'],
        ['ouvert_2TNE-B', 'true'],
        ['ouvert_2TNE-C', 'true'],
        ['ouvert_TEST', 'true'],
        ['code_lppjr', CODE_LPPJR],
        ['code_aes', 'BILAN-TNE-2026'],
        ['date_debut_global', ''],
        ['date_fin_global', ''],
        ['max_tentatives', '1'],
        ['limite_comptes_par_classe', String(LIMITE_COMPTES_PAR_CLASSE)],
        ['titre_session', 'Bilan d\'année 2nde TNE'],
        ['duree_indicative_min', '60']
      ];
      defauts.forEach(l => sh.appendRow(l));
      return sh;
  }
  if (entetes.length > 0) sh.appendRow(entetes);
  return sh;
}

function estVrai(v) { return v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1'; }

function lireToutesLignes(sh) {
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { entetes: data[0] || [], lignes: [] };
  const entetes = data[0];
  const lignes = [];
  for (let i = 1; i < data.length; i++) {
    const obj = { _row: i + 1 };
    entetes.forEach((h, j) => obj[h] = data[i][j]);
    lignes.push(obj);
  }
  return { entetes, lignes };
}

function indexCol(sh, nom) {
  const entetes = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return entetes.indexOf(nom) + 1; // 1-based
}

// ========================
// SÉCURITÉ : HASH, HMAC
// ========================
function genererSalt() {
  const bytes = [];
  for (let i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256));
  return Utilities.base64Encode(bytes);
}

function genererToken() {
  return Utilities.getUuid().replace(/-/g, '');
}

function hasherMdp(mdp, salt) {
  let h = mdp + ':' + salt;
  for (let i = 0; i < 5000; i++) {
    h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h));
  }
  return h;
}

function calculerHmac(donnees) {
  return Utilities.base64Encode(Utilities.computeHmacSha256Signature(donnees, HMAC_SECRET));
}

function verifierCodeProf(code) { return code === lireParams().code_lppjr; }

// ========================
// PARAMÈTRES
// ========================
function lireParams() {
  const sh = getSheet(ONGLET_PARAMS);
  const { lignes } = lireToutesLignes(sh);
  const obj = {};
  lignes.forEach(l => obj[l.cle] = l.valeur);
  return obj;
}

function ecrireParam(cle, valeur) {
  const sh = getSheet(ONGLET_PARAMS);
  const { lignes } = lireToutesLignes(sh);
  const ligne = lignes.find(l => l.cle === cle);
  if (ligne) sh.getRange(ligne._row, 2).setValue(valeur);
  else sh.appendRow([cle, valeur]);
}

// ========================
// LOG SÉCURITÉ
// ========================
function logSecu(type, classe, pseudo, message, token) {
  const sh = getSheet(ONGLET_LOGS);
  sh.appendRow([new Date().toISOString(), type, classe || '', pseudo || '', message || '', token || '']);
}

// ========================
// ROUTE : check_pseudo
// ========================
function checkPseudo(params) {
  const classe = params.classe;
  const pseudo = (params.pseudo || '').toUpperCase();
  if (!CLASSES_AUTORISEES.includes(classe)) return { ok: false, error: 'Classe inconnue' };
  const { lignes } = lireToutesLignes(getSheet(ONGLET_COMPTES));
  const exists = lignes.some(l => l.classe === classe && (l.pseudo || '').toUpperCase() === pseudo);
  return { ok: true, exists };
}

// ========================
// ROUTE : create_account
// ========================
function createAccount(params) {
  const classe = params.classe;
  const pseudo = (params.pseudo || '').toUpperCase().trim();
  const nomInitiale = (params.nom_initiale || '').trim();
  const mdp = params.mdp || classe;

  if (!CLASSES_AUTORISEES.includes(classe)) return { ok: false, error: 'Classe inconnue' };
  if (!pseudo || pseudo.length < 4) return { ok: false, error: 'Pseudo trop court (4 caractères minimum)' };
  if (!/^[A-Z0-9_-]+$/.test(pseudo)) return { ok: false, error: 'Pseudo invalide (lettres, chiffres, _ et - uniquement)' };

  const paramsGlobaux = lireParams();
  if (!estVrai(paramsGlobaux['ouvert_' + classe])) return { ok: false, error: 'Le bilan est fermé pour la classe ' + classe };

  const sh = getSheet(ONGLET_COMPTES);
  const { lignes } = lireToutesLignes(sh);

  const limite = parseInt(paramsGlobaux.limite_comptes_par_classe || LIMITE_COMPTES_PAR_CLASSE);
  const nbDansClasse = lignes.filter(l => l.classe === classe).length;
  if (nbDansClasse >= limite) {
    logSecu('LIMITE_ATTEINTE', classe, pseudo, nbDansClasse + '/' + limite, '');
    return { ok: false, error: 'La classe ' + classe + ' est complète (' + nbDansClasse + '/' + limite + ')' };
  }

  const collision = lignes.find(l => l.classe === classe && (l.pseudo || '').toUpperCase() === pseudo);
  if (collision) return { ok: false, error: 'Pseudo déjà utilisé dans ' + classe, collision: true };

  const salt = genererSalt();
  const hash = hasherMdp(mdp, salt);
  const token = genererToken();
  sh.appendRow([classe, pseudo, nomInitiale, hash, salt, new Date().toISOString(), '', 0, 'false', '', 0, token]);
  logSecu('CREATION', classe, pseudo, 'Compte créé (' + nomInitiale + ')', token);
  return { ok: true, classe, pseudo, nom_initiale: nomInitiale, token };
}

// ========================
// ROUTE : login
// ========================
function login(params) {
  const classe = params.classe;
  const pseudo = (params.pseudo || '').toUpperCase().trim();
  const mdp = params.mdp || '';

  const sh = getSheet(ONGLET_COMPTES);
  const { lignes } = lireToutesLignes(sh);
  const compte = lignes.find(l => l.classe === classe && (l.pseudo || '').toUpperCase() === pseudo);
  if (!compte) {
    logSecu('LOGIN_ECHEC', classe, pseudo, 'Compte inexistant', '');
    return { ok: false, error: 'Pseudo inconnu pour cette classe.' };
  }

  if (compte.verrouille_jusqu_a) {
    const verrouilleJusqua = new Date(compte.verrouille_jusqu_a).getTime();
    if (verrouilleJusqua > Date.now()) {
      const resteSec = Math.ceil((verrouilleJusqua - Date.now()) / 1000);
      return { ok: false, error: 'Compte verrouillé. Réessaie dans ' + resteSec + ' s.' };
    }
  }

  const hash = hasherMdp(mdp, compte.salt);
  if (hash !== compte.hash_mdp) {
    const essais = parseInt(compte.nb_essais_rates || 0) + 1;
    sh.getRange(compte._row, indexCol(sh, 'nb_essais_rates')).setValue(essais);
    if (essais >= LOCKOUT_MAX_ESSAIS) {
      sh.getRange(compte._row, indexCol(sh, 'verrouille_jusqu_a')).setValue(new Date(Date.now() + LOCKOUT_DUREE_MS).toISOString());
      sh.getRange(compte._row, indexCol(sh, 'nb_essais_rates')).setValue(0);
      logSecu('LOCKOUT', classe, pseudo, '', compte.token_session);
      return { ok: false, error: 'Trop d\'essais ratés. Compte verrouillé 5 minutes.' };
    }
    return { ok: false, error: 'Mot de passe incorrect (' + essais + '/' + LOCKOUT_MAX_ESSAIS + ').' };
  }

  // Login OK
  const nouveauToken = genererToken();
  sh.getRange(compte._row, indexCol(sh, 'derniere_connexion')).setValue(new Date().toISOString());
  sh.getRange(compte._row, indexCol(sh, 'nb_connexions')).setValue(parseInt(compte.nb_connexions || 0) + 1);
  sh.getRange(compte._row, indexCol(sh, 'nb_essais_rates')).setValue(0);
  sh.getRange(compte._row, indexCol(sh, 'token_session')).setValue(nouveauToken);

  const paramsGlobaux = lireParams();
  return {
    ok: true,
    classe,
    pseudo,
    nom_initiale: compte.nom_initiale || '',
    code_aes: paramsGlobaux.code_aes || 'BILAN-TNE-2026',
    ouvert: estVrai(paramsGlobaux['ouvert_' + classe]),
    reset_demande: estVrai(compte.reset_demande),
    token: nouveauToken,
    titre_session: paramsGlobaux.titre_session || 'Bilan d\'année 2nde TNE',
    duree_indicative_min: parseInt(paramsGlobaux.duree_indicative_min || 60)
  };
}

// ========================
// ROUTE : change_password
// ========================
function changePassword(params) {
  const classe = params.classe;
  const pseudo = (params.pseudo || '').toUpperCase().trim();
  const ancien = params.ancien_mdp || '';
  const nouveau = params.nouveau_mdp || '';
  if (nouveau.length < 4) return { ok: false, error: 'Nouveau mot de passe trop court' };

  const sh = getSheet(ONGLET_COMPTES);
  const { lignes } = lireToutesLignes(sh);
  const compte = lignes.find(l => l.classe === classe && (l.pseudo || '').toUpperCase() === pseudo);
  if (!compte) return { ok: false, error: 'Compte inexistant' };

  const hashAncien = hasherMdp(ancien, compte.salt);
  if (hashAncien !== compte.hash_mdp) return { ok: false, error: 'Ancien mot de passe incorrect' };

  const nouveauSalt = genererSalt();
  const nouveauHash = hasherMdp(nouveau, nouveauSalt);
  sh.getRange(compte._row, indexCol(sh, 'hash_mdp')).setValue(nouveauHash);
  sh.getRange(compte._row, indexCol(sh, 'salt')).setValue(nouveauSalt);
  sh.getRange(compte._row, indexCol(sh, 'reset_demande')).setValue('false');
  return { ok: true };
}

// ========================
// ROUTE : heartbeat (NOUVEAU)
// Reçoit toutes les 15s pendant l'épreuve, met à jour tne_live (last write wins)
// Détecte reconnect (gap > 60s) et token mismatch
// ========================
function heartbeat(params) {
  const classe = params.classe;
  const pseudo = (params.pseudo || '').toUpperCase().trim();
  const nomInitiale = params.nom_initiale || '';
  const token = params.token || '';
  const qCourante = parseInt(params.q_courante || 0);
  const qRepondues = parseInt(params.q_repondues || 0);
  const focusPerdu = parseInt(params.focus_perdu_count || 0);
  const devtools = parseInt(params.devtools_count || 0);
  const fini = estVrai(params.fini);

  if (!classe || !pseudo) return { ok: false, error: 'classe + pseudo requis' };

  const sh = getSheet(ONGLET_LIVE);
  const { lignes } = lireToutesLignes(sh);
  const ligne = lignes.find(l => l.classe === classe && (l.pseudo || '').toUpperCase() === pseudo);
  const now = new Date().toISOString();
  const nowMs = Date.now();

  if (!ligne) {
    sh.appendRow([classe, pseudo, nomInitiale, token, now, now, now, qCourante, qRepondues, focusPerdu, 0, devtools, 0, fini ? 'true' : 'false', '']);
    return { ok: true, created: true };
  }

  // Détection reconnect (gap > 60s)
  let reconnectCount = parseInt(ligne.reconnect_count || 0);
  const gapMs = nowMs - new Date(ligne.dernier_heartbeat).getTime();
  if (gapMs > SEUIL_RECONNECT_MS) {
    reconnectCount++;
    logSecu('RECONNECT', classe, pseudo, 'Gap ' + Math.round(gapMs / 1000) + 's (#' + reconnectCount + ')', token);
  }

  // Détection token mismatch (changement d'appareil ou tentative reset)
  let tokenChanges = parseInt(ligne.token_changes || 0);
  if (ligne.token && token && ligne.token !== token) {
    tokenChanges++;
    logSecu('TOKEN_MISMATCH', classe, pseudo, 'Token précédent: ' + (ligne.token || '').slice(0, 8) + '... → nouveau: ' + token.slice(0, 8) + '...', token);
  }

  // Détection avancement (action si q_repondues a augmenté)
  const ligneQRep = parseInt(ligne.q_repondues || 0);
  const derniereAction = qRepondues > ligneQRep ? now : ligne.derniere_action;

  // Update
  sh.getRange(ligne._row, indexCol(sh, 'token')).setValue(token);
  sh.getRange(ligne._row, indexCol(sh, 'dernier_heartbeat')).setValue(now);
  sh.getRange(ligne._row, indexCol(sh, 'derniere_action')).setValue(derniereAction);
  sh.getRange(ligne._row, indexCol(sh, 'q_courante')).setValue(qCourante);
  sh.getRange(ligne._row, indexCol(sh, 'q_repondues')).setValue(qRepondues);
  sh.getRange(ligne._row, indexCol(sh, 'focus_perdu_count')).setValue(focusPerdu);
  sh.getRange(ligne._row, indexCol(sh, 'reconnect_count')).setValue(reconnectCount);
  sh.getRange(ligne._row, indexCol(sh, 'devtools_count')).setValue(devtools);
  sh.getRange(ligne._row, indexCol(sh, 'token_changes')).setValue(tokenChanges);
  sh.getRange(ligne._row, indexCol(sh, 'fini')).setValue(fini ? 'true' : 'false');
  if (nomInitiale && !ligne.nom_initiale) sh.getRange(ligne._row, indexCol(sh, 'nom_initiale')).setValue(nomInitiale);

  return { ok: true, reconnect_count: reconnectCount, token_changes: tokenChanges };
}

// ========================
// ROUTE : submit_result
// Submit final avec HMAC, sous-stats par thème, et clôture de la ligne live
// ========================
function submitResult(params) {
  const classe = params.classe;
  const pseudo = (params.pseudo || '').toUpperCase().trim();
  const nomInitiale = params.nom_initiale || '';
  const note20 = parseFloat(params.note_20);
  const scorePct = parseFloat(params.score_pct);
  const nbQuestions = parseInt(params.nb_questions);
  const nbCorrectes = parseInt(params.nb_correctes);
  const dureeSec = parseInt(params.duree_sec);
  const sousNotesThemes = JSON.stringify(params.sous_notes_themes || {});
  const detailQuestions = JSON.stringify(params.detail_questions || []);
  const focusPerdu = parseInt(params.focus_perdu_count || 0);
  const reconnectCount = parseInt(params.reconnect_count || 0);
  const tokenChanges = parseInt(params.token_changes || 0);
  const devtoolsOuvert = estVrai(params.devtools_ouvert) ? 'true' : 'false';
  const signatureClient = params.hmac_signature || '';

  // Vérif compte
  const shC = getSheet(ONGLET_COMPTES);
  const { lignes: comptes } = lireToutesLignes(shC);
  const compte = comptes.find(l => l.classe === classe && (l.pseudo || '').toUpperCase() === pseudo);
  if (!compte) return { ok: false, error: 'Compte inexistant — connexion nécessaire' };

  // Vérif HMAC
  const donnees = classe + ':' + pseudo + ':' + note20 + ':' + scorePct + ':' + nbQuestions + ':' + nbCorrectes + ':' + dureeSec;
  const sigAttendue = calculerHmac(donnees);
  if (signatureClient !== sigAttendue) {
    logSecu('HMAC_INVALIDE', classe, pseudo, 'Signature invalide', '');
    return { ok: false, error: 'Signature invalide' };
  }

  // Vérif max_tentatives
  const paramsGlobaux = lireParams();
  const maxTent = parseInt(paramsGlobaux.max_tentatives || 0);
  if (maxTent > 0) {
    const shR = getSheet(ONGLET_RESULTATS);
    const { lignes: resultats } = lireToutesLignes(shR);
    const tentatives = resultats.filter(r => r.classe === classe && (r.pseudo || '').toUpperCase() === pseudo).length;
    if (tentatives >= maxTent) return { ok: false, error: 'Nombre maximum de tentatives atteint (' + maxTent + ')' };
  }

  // Insertion résultat
  const shR = getSheet(ONGLET_RESULTATS);
  shR.appendRow([
    new Date().toISOString(), classe, pseudo, nomInitiale, note20, scorePct, nbQuestions, nbCorrectes, dureeSec,
    sousNotesThemes, detailQuestions, focusPerdu, reconnectCount, devtoolsOuvert, tokenChanges, signatureClient, 'false'
  ]);

  // Marquer la session live comme finie
  const shL = getSheet(ONGLET_LIVE);
  const { lignes: lives } = lireToutesLignes(shL);
  const live = lives.find(l => l.classe === classe && (l.pseudo || '').toUpperCase() === pseudo);
  if (live) {
    shL.getRange(live._row, indexCol(shL, 'fini')).setValue('true');
    shL.getRange(live._row, indexCol(shL, 'note_20')).setValue(note20);
  }

  if (devtoolsOuvert === 'true') logSecu('DEVTOOLS', classe, pseudo, 'DevTools détecté pendant l\'épreuve', '');

  return { ok: true, note: note20 };
}

// ========================
// ROUTE : log_event
// ========================
function logEvent(params) {
  logSecu(params.type || 'INFO', params.classe || '', params.pseudo || '', params.message || '', params.token || '');
  return { ok: true };
}

// ========================
// ROUTE : get_class_status
// ========================
function getClassStatus(params) {
  const classe = params.classe;
  const paramsGlobaux = lireParams();
  return {
    ok: true,
    classe,
    ouvert: estVrai(paramsGlobaux['ouvert_' + classe]),
    titre_session: paramsGlobaux.titre_session || '',
    duree_indicative_min: parseInt(paramsGlobaux.duree_indicative_min || 60)
  };
}

// ========================
// ROUTE PROF : live_status — état temps réel
// Renvoie tableau des sessions actives avec calcul d'état (vert/orange/rouge/gris)
// ========================
function liveStatus(params) {
  if (!verifierCodeProf(params.code)) return { ok: false, error: 'Code prof invalide' };

  const shL = getSheet(ONGLET_LIVE);
  const { lignes } = lireToutesLignes(shL);
  const nowMs = Date.now();

  let sessions = lignes.map(l => {
    const heartbeatMs = l.dernier_heartbeat ? new Date(l.dernier_heartbeat).getTime() : 0;
    const actionMs = l.derniere_action ? new Date(l.derniere_action).getTime() : 0;
    const gapHb = nowMs - heartbeatMs;
    const gapAct = nowMs - actionMs;
    const fini = estVrai(l.fini);

    let etat;
    if (fini) etat = 'fini';
    else if (gapHb > 60000) etat = 'deconnecte';     // ⚫
    else if (parseInt(l.reconnect_count || 0) >= 3 || parseInt(l.token_changes || 0) >= 1 || parseInt(l.devtools_count || 0) >= 1) etat = 'suspect';  // 🔴
    else if (gapAct > 60000 && gapHb < 60000) etat = 'lent';  // 🟡
    else etat = 'actif';                              // 🟢

    return {
      classe: l.classe,
      pseudo: l.pseudo,
      nom_initiale: l.nom_initiale || '',
      session_debut: l.session_debut,
      dernier_heartbeat: l.dernier_heartbeat,
      derniere_action: l.derniere_action,
      gap_heartbeat_sec: Math.round(gapHb / 1000),
      gap_action_sec: Math.round(gapAct / 1000),
      q_courante: parseInt(l.q_courante || 0),
      q_repondues: parseInt(l.q_repondues || 0),
      focus_perdu_count: parseInt(l.focus_perdu_count || 0),
      reconnect_count: parseInt(l.reconnect_count || 0),
      devtools_count: parseInt(l.devtools_count || 0),
      token_changes: parseInt(l.token_changes || 0),
      fini: fini,
      note_20: l.note_20 || '',
      etat: etat
    };
  });

  if (params.classe && params.classe !== 'TOUTES') {
    sessions = sessions.filter(s => s.classe === params.classe);
  }

  // Tri : actifs en haut par avancement décroissant, puis lents, suspects, déconnectés, finis
  const ordreEtat = { 'actif': 1, 'lent': 2, 'suspect': 3, 'deconnecte': 4, 'fini': 5 };
  sessions.sort((a, b) => (ordreEtat[a.etat] - ordreEtat[b.etat]) || (b.q_repondues - a.q_repondues));

  // Stats globales
  const stats = {
    total: sessions.length,
    actifs: sessions.filter(s => s.etat === 'actif').length,
    lents: sessions.filter(s => s.etat === 'lent').length,
    suspects: sessions.filter(s => s.etat === 'suspect').length,
    deconnectes: sessions.filter(s => s.etat === 'deconnecte').length,
    finis: sessions.filter(s => s.fini).length,
    avancement_moyen: sessions.length ? Math.round(sessions.reduce((s, x) => s + x.q_repondues, 0) / sessions.length * 10) / 10 : 0,
    alertes_focus: sessions.filter(s => s.focus_perdu_count > 0).length,
    alertes_reconnect: sessions.filter(s => s.reconnect_count > 0).length,
    alertes_reconnect_fortes: sessions.filter(s => s.reconnect_count >= 3).length,
    alertes_token: sessions.filter(s => s.token_changes > 0).length,
    alertes_devtools: sessions.filter(s => s.devtools_count > 0).length
  };

  return { ok: true, sessions, stats, ts_serveur: new Date().toISOString() };
}

// ========================
// ROUTES PROF
// ========================
function listAccounts(params) {
  if (!verifierCodeProf(params.code)) return { ok: false, error: 'Code prof invalide' };
  const { lignes } = lireToutesLignes(getSheet(ONGLET_COMPTES));
  let resultats = lignes;
  if (params.classe && params.classe !== 'TOUTES') resultats = lignes.filter(l => l.classe === params.classe);
  return { ok: true, comptes: resultats.map(l => ({
    classe: l.classe, pseudo: l.pseudo, nom_initiale: l.nom_initiale,
    date_creation: l.date_creation, derniere_connexion: l.derniere_connexion,
    nb_connexions: l.nb_connexions, reset_demande: estVrai(l.reset_demande)
  })) };
}

function listResults(params) {
  if (!verifierCodeProf(params.code)) return { ok: false, error: 'Code prof invalide' };
  const { lignes } = lireToutesLignes(getSheet(ONGLET_RESULTATS));
  let resultats = lignes;
  if (params.classe && params.classe !== 'TOUTES') resultats = lignes.filter(l => l.classe === params.classe);
  return { ok: true, resultats: resultats.map(l => ({
    _row: l._row, date: l.date, classe: l.classe, pseudo: l.pseudo, nom_initiale: l.nom_initiale,
    note_20: l.note_20, score_pct: l.score_pct, nb_questions: l.nb_questions, nb_correctes: l.nb_correctes,
    duree_sec: l.duree_sec, sous_notes_themes: l.sous_notes_themes, detail_questions: l.detail_questions,
    focus_perdu_count: l.focus_perdu_count, reconnect_count: l.reconnect_count, token_changes: l.token_changes,
    devtools_ouvert: estVrai(l.devtools_ouvert), invalidee: estVrai(l.invalidee)
  })) };
}

function listLogs(params) {
  if (!verifierCodeProf(params.code)) return { ok: false, error: 'Code prof invalide' };
  const { lignes } = lireToutesLignes(getSheet(ONGLET_LOGS));
  let resultats = lignes;
  if (params.classe && params.classe !== 'TOUTES') resultats = lignes.filter(l => l.classe === params.classe);
  return { ok: true, logs: resultats.slice(-200).reverse() };
}

function resetPassword(params) {
  if (!verifierCodeProf(params.code)) return { ok: false, error: 'Code prof invalide' };
  const classe = params.classe;
  const pseudo = (params.pseudo || '').toUpperCase().trim();
  const sh = getSheet(ONGLET_COMPTES);
  const { lignes } = lireToutesLignes(sh);
  const compte = lignes.find(l => l.classe === classe && (l.pseudo || '').toUpperCase() === pseudo);
  if (!compte) return { ok: false, error: 'Compte inexistant' };
  const nouveauSalt = genererSalt();
  const nouveauHash = hasherMdp(classe, nouveauSalt);
  sh.getRange(compte._row, indexCol(sh, 'hash_mdp')).setValue(nouveauHash);
  sh.getRange(compte._row, indexCol(sh, 'salt')).setValue(nouveauSalt);
  sh.getRange(compte._row, indexCol(sh, 'reset_demande')).setValue('true');
  sh.getRange(compte._row, indexCol(sh, 'verrouille_jusqu_a')).setValue('');
  sh.getRange(compte._row, indexCol(sh, 'nb_essais_rates')).setValue(0);
  return { ok: true };
}

function deleteAccount(params) {
  if (!verifierCodeProf(params.code)) return { ok: false, error: 'Code prof invalide' };
  const classe = params.classe;
  const pseudo = (params.pseudo || '').toUpperCase().trim();
  const sh = getSheet(ONGLET_COMPTES);
  const { lignes } = lireToutesLignes(sh);
  const compte = lignes.find(l => l.classe === classe && (l.pseudo || '').toUpperCase() === pseudo);
  if (!compte) return { ok: false, error: 'Compte inexistant' };
  sh.deleteRow(compte._row);
  return { ok: true };
}

function renamePseudo(params) {
  if (!verifierCodeProf(params.code)) return { ok: false, error: 'Code prof invalide' };
  const classe = params.classe;
  const ancien = (params.ancien_pseudo || '').toUpperCase().trim();
  const nouveau = (params.nouveau_pseudo || '').toUpperCase().trim();
  const sh = getSheet(ONGLET_COMPTES);
  const { lignes } = lireToutesLignes(sh);
  const compte = lignes.find(l => l.classe === classe && (l.pseudo || '').toUpperCase() === ancien);
  if (!compte) return { ok: false, error: 'Compte inexistant' };
  const collision = lignes.find(l => l.classe === classe && (l.pseudo || '').toUpperCase() === nouveau);
  if (collision) return { ok: false, error: 'Le nouveau pseudo existe déjà' };
  sh.getRange(compte._row, indexCol(sh, 'pseudo')).setValue(nouveau);
  return { ok: true };
}

function resetClassPasswords(params) {
  if (!verifierCodeProf(params.code)) return { ok: false, error: 'Code prof invalide' };
  const classe = params.classe;
  const sh = getSheet(ONGLET_COMPTES);
  const { lignes } = lireToutesLignes(sh);
  const cibles = lignes.filter(l => l.classe === classe);
  cibles.forEach(c => {
    const nouveauSalt = genererSalt();
    const nouveauHash = hasherMdp(classe, nouveauSalt);
    sh.getRange(c._row, indexCol(sh, 'hash_mdp')).setValue(nouveauHash);
    sh.getRange(c._row, indexCol(sh, 'salt')).setValue(nouveauSalt);
    sh.getRange(c._row, indexCol(sh, 'reset_demande')).setValue('true');
    sh.getRange(c._row, indexCol(sh, 'verrouille_jusqu_a')).setValue('');
    sh.getRange(c._row, indexCol(sh, 'nb_essais_rates')).setValue(0);
  });
  return { ok: true, nb: cibles.length };
}

function clearClass(params) {
  if (!verifierCodeProf(params.code)) return { ok: false, error: 'Code prof invalide' };
  const classe = params.classe;
  const confirmation = params.confirmation || '';
  if (confirmation !== classe) return { ok: false, error: 'Confirmation invalide (taper le nom de la classe)' };

  let nbC = 0, nbR = 0, nbL = 0;
  [ONGLET_COMPTES, ONGLET_RESULTATS, ONGLET_LIVE].forEach(o => {
    const sh = getSheet(o);
    const { lignes } = lireToutesLignes(sh);
    const aSuppr = lignes.filter(l => l.classe === classe);
    aSuppr.sort((a, b) => b._row - a._row).forEach(l => sh.deleteRow(l._row));
    if (o === ONGLET_COMPTES) nbC = aSuppr.length;
    if (o === ONGLET_RESULTATS) nbR = aSuppr.length;
    if (o === ONGLET_LIVE) nbL = aSuppr.length;
  });
  return { ok: true, nb_comptes: nbC, nb_resultats: nbR, nb_live: nbL };
}

function clearLive(params) {
  if (!verifierCodeProf(params.code)) return { ok: false, error: 'Code prof invalide' };
  const sh = getSheet(ONGLET_LIVE);
  const last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1);
  return { ok: true, nb_supprime: last - 1 };
}

function getSettings(params) {
  if (!verifierCodeProf(params.code)) return { ok: false, error: 'Code prof invalide' };
  return { ok: true, params: lireParams() };
}

function updateSettings(params) {
  if (!verifierCodeProf(params.code)) return { ok: false, error: 'Code prof invalide' };
  const updates = params.updates || {};
  Object.keys(updates).forEach(cle => ecrireParam(cle, updates[cle]));
  return { ok: true };
}

// ========================
// INIT MANUEL — à lancer une fois après collage
// ========================
function initialiser() {
  getSheet(ONGLET_COMPTES);
  getSheet(ONGLET_RESULTATS);
  getSheet(ONGLET_LIVE);
  getSheet(ONGLET_LOGS);
  getSheet(ONGLET_PARAMS);
  Logger.log('Onglets créés.');
}

// ========================
// KEEP ALIVE — anti cold-start (trigger toutes les 5 min)
// ========================
function keepAlive() { return new Date().toISOString(); }
