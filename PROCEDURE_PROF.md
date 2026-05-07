# Procédure prof — inerWeb Bilan TNE

## 🚦 Avant la séance

1. Vérifier que l'Apps Script tourne : ouvrir `tableau-bord-live.html` → entrer le code prof
2. Vider les sessions LIVE de la session précédente : route `clear_live` (bouton à ajouter ou via Apps Script directement)
3. Ouvrir l'onglet Sheet du collecteur universel (`16T1T3yL...`) — onglets `tne_comptes`, `tne_resultats`, `tne_live`, `tne_logs`
4. Choisir le **mot de passe d'épreuve** : par défaut `BILAN-TNE-2026`. Modifiable via `update_settings` (clé `code_aes`).

> ⚠ Si tu modifies le mot de passe d'épreuve, tu dois **rebuilder la banque** : `node build/build.js --password=NOUVEAU-MDP`

## 🟢 Démarrer la session avec les élèves

1. Au tableau, écris :
   - L'URL : `https://frigorx.github.io/inerweb-bilan-tne/arcade.html`
   - Le mot de passe d'épreuve : `BILAN-TNE-2026`
2. Demande aux élèves de :
   - Choisir leur classe
   - Saisir un pseudo (ex `ICEBLUE42`) + leur prénom et initiale du nom (ex `Marie D.`)
   - Choisir un blason
   - Créer un mot de passe à eux (4+ caractères) qu'ils retiennent
   - Entrer le mot de passe d'épreuve donné au tableau
3. Ouvre `tableau-bord-live.html` sur ton écran (idéalement projeté ou sur un 2ᵉ écran)

## 👀 Pendant l'épreuve

- Le tableau LIVE se rafraîchit toutes les 5 s
- Code couleur :
  - 🟢 actif (heartbeat < 30 s, action < 1 min)
  - 🟡 lent (aucune réponse depuis > 1 min — élève bloqué)
  - 🔴 suspect (focus perdu / devtools / 3+ reconnects / token changé)
  - ⚫ déconnecté (pas de heartbeat depuis > 60 s)
- Stats globales en haut : connectés, actifs, finis, alertes devtools

**Si un élève passe en 🔴** : va le voir, sans accusation. Possibilités :
- Sortie d'onglet involontaire (notification téléphone) → OK
- 3+ reconnects = WiFi instable → noter mais ne pas pénaliser
- DevTools détecté = action volontaire → invalider le résultat ensuite via tableau-bord.html

**Reconnexion d'un élève** :
- Il revient sur `arcade.html`
- Saisit son pseudo + son mot de passe perso
- Le système détecte le gap > 60 s et incrémente `reconnect_count`
- Il reprend là où il en était ? Non — actuellement il recommence (à améliorer en V2)

## ✅ Après l'épreuve

1. Ouvre `tableau-bord.html` (bilan)
2. **Onglet Liste** : note de chaque élève /20, durée, alertes
3. **Onglet Heatmap** : voir d'un coup d'œil les thèmes faibles par classe (rouge < 50 %, jaune 50-70 %, vert > 70 %)
4. **Onglet Radar classe** : profil moyen de la classe sur les 9 thèmes
5. **Onglet Alertes** : élèves avec focus/devtools/reconnects suspects → tu décides d'invalider ou pas
6. **Bouton 📥 Export CSV** : sauvegarde du tableau pour archivage Pronote / bulletin

## 🛠 Routes Apps Script utiles (admin)

Toutes en POST sur l'URL `/exec` avec `code: 'LPPJR2026'` :

| Action | Effet |
|---|---|
| `live_status` | État live (utilisé par tableau-bord-live) |
| `list_results` | Liste des bilans (tableau-bord) |
| `list_logs` | Logs sécurité (200 derniers) |
| `delete_account` | Supprime un compte élève |
| `rename_pseudo` | Renomme un pseudo (ex faute de frappe) |
| `reset_password` | Reset mdp d'un élève (devient sa classe) |
| `reset_class_passwords` | Reset toute la classe |
| `clear_class` | ⚠ Supprime tous les comptes + résultats + live d'une classe |
| `clear_live` | Vide l'onglet live (utile entre 2 sessions) |
| `update_settings` | `{ updates: { ouvert_2TNE-A: 'false' } }` ferme une classe |

## 🔒 Conformité RGPD

- Pas de **nom complet** côté serveur — seulement pseudo + initiale (`Marie D.`)
- Données chiffrées en transit + au repos (HTTPS + AES-GCM banque)
- Suppression au 31/08 chaque année (à faire manuellement via `clear_class` pour chaque classe)
- Mot de passe élève haché (5000 itérations SHA-256 + salt aléatoire 16 octets)
- HMAC sur les scores → impossible de soumettre une note bidouillée
- Logs accessibles uniquement avec code prof
