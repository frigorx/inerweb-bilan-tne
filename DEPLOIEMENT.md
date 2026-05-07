# Déploiement — inerWeb Bilan TNE

## 1. Build de la banque chiffrée

Prérequis : Node.js (v16+) installé.

```bash
cd C:\Users\henni\inerweb-bilan-tne
node build\build.js
```

→ Génère `data/bilan-tne.enc` (banque chiffrée avec passphrase `BILAN-TNE-2026`).

Si tu changes le mot de passe :
```bash
node build\build.js --password=MON-NOUVEAU-MDP-2026
```
Puis modifie aussi `code_aes` dans le Sheet (onglet `tne_params`) pour synchroniser.

## 2. Apps Script

1. Va sur https://script.google.com
2. Nouveau projet → nom : `inerweb-bilan-tne`
3. Colle le contenu de `apps-script/Code.gs` dans `Code.gs`
4. Clique sur l'icône engrenage (⚙ Paramètres) → "Afficher le fichier manifeste appsscript.json"
5. Colle le contenu de `apps-script/appsscript.json`
6. **IMPORTANT** : adapte la constante `SHEET_ID` en haut du Code.gs si besoin (par défaut : Sheet collecteur universel `16T1T3yL...`)
7. Lance manuellement la fonction `initialiser()` une fois (Editor → Sélectionne `initialiser` → Exécuter) pour créer les onglets dans le Sheet
8. **Déployer** → Nouveau déploiement → Type : **Application Web**
   - Description : `inerweb-bilan-tne v1.0`
   - Exécuter en tant que : **Moi**
   - Qui peut accéder : **Tout le monde** (anonyme — sinon les élèves ne pourront pas)
9. Copie l'URL `/exec` qui s'affiche (ex `https://script.google.com/macros/s/AKfycb.../exec`)

### Trigger keep-alive (anti cold-start)

Apps Script s'endort après inactivité. Pour rester réactif :

1. Dans l'éditeur Apps Script : icône horloge ⏰ "Triggers"
2. Ajouter trigger → Fonction : `keepAlive` — Événement : "Au déclencheur temporel" — Toutes les **5 minutes**
3. Sauvegarder

→ Réduit la latence de ~18 s à ~3-5 s pour les élèves.

## 3. Branchement des HTML

Dans **les 3 fichiers** `arcade.html`, `tableau-bord-live.html`, `tableau-bord.html`, remplace la ligne :

```js
const APPS_SCRIPT_URL = '__A_REMPLIR_APRES_DEPLOIEMENT__';
```

par l'URL `/exec` copiée à l'étape 2 :

```js
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
```

## 4. GitHub Pages

```bash
cd C:\Users\henni\inerweb-bilan-tne
git init
git add .
git commit -m "v1.0 inerWeb Bilan TNE — initial"
git branch -M main
git remote add origin https://github.com/frigorx/inerweb-bilan-tne.git
git push -u origin main
```

⚠ **Avant de pousser, vérifie le `.gitignore`** :

```
# .gitignore
MAPPING.md
assets/svg-frigo/MAPPING.md
assets/svg-electrotech/MAPPING.md
data/bilan-tne.json
data/bilan-tne.enc.json
```

→ Le fichier `bilan-tne.json` (clair, avec les bonnes réponses) ne doit **JAMAIS** être poussé sur GitHub Pages.
→ Les MAPPING.md (correspondance SVG → noms) non plus.
→ Seul `data/bilan-tne.enc` (chiffré) est publié.

Sur GitHub :
- Settings → Pages → Source : `main` / `/(root)`
- Save → URL : `https://frigorx.github.io/inerweb-bilan-tne/`

## 5. URLs finales

| Public | URL |
|---|---|
| 📱 Élève — quiz | `https://frigorx.github.io/inerweb-bilan-tne/arcade.html` |
| 🟢 Prof — surveillance LIVE | `https://frigorx.github.io/inerweb-bilan-tne/tableau-bord-live.html` |
| 📊 Prof — bilan post-épreuve | `https://frigorx.github.io/inerweb-bilan-tne/tableau-bord.html` |
| 📚 Élève — fiches révision | `https://frigorx.github.io/inerweb-bilan-tne/ressources/` |

## 6. Test de bout en bout

1. Ouvre `arcade.html` en local ou en ligne
2. Crée un compte test (classe `TEST`, pseudo `TEST01`, mdp `1234`)
3. Démarre l'épreuve avec `BILAN-TNE-2026`
4. Réponds à 2-3 questions
5. Ouvre `tableau-bord-live.html` (autre onglet) — tu dois voir le compte TEST en 🟢
6. Termine le quiz dans `arcade.html`
7. Ouvre `tableau-bord.html` — tu dois voir la note + radar
8. Clique "Détail" → vérifie sous-notes par thème
9. Export CSV pour vérifier le format

## 7. Sécurité — checklist avant ouverture aux élèves

- [ ] Apps Script déployé en mode "Anyone anonymous"
- [ ] Trigger keepAlive actif (toutes les 5 min)
- [ ] `bilan-tne.json` PAS sur GitHub Pages (`.gitignore` correct)
- [ ] `MAPPING.md` PAS sur GitHub Pages
- [ ] `bilan-tne.enc` POUR L'ÉLÈVE est bien chiffré (test : `cat data/bilan-tne.enc | head -c 100` = du base64 illisible)
- [ ] Code prof modifié si tu n'es pas seul (par défaut `LPPJR2026`)
- [ ] Test élève complet réalisé en condition réelle
- [ ] Sheet collecteur universel (`16T1T3yL...`) accessible

## 8. Maintenance

- Modifier une question : éditer `data/bilan-tne.json` → `node build/build.js` → `git push`
- Ajouter une classe : modifier `CLASSES_AUTORISEES` dans `Code.gs` + redéployer Apps Script (nouvelle version)
- Vider une classe en fin d'année : `clear_class` avec `confirmation: '2TNE-A'`
- Réinitialiser tous les mots de passe : `reset_class_passwords` avec `classe: '2TNE-A'`
