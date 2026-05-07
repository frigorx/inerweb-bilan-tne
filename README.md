# inerWeb Bilan d'année — 2nde TNE

> Quiz "Cockpit Frigo" — bilan d'année ludique pour 2nde TNE — durée libre prévue 1 h, note finale /20 + radar 9 axes
> **F. Henninot — LP Privé Jacques Raynaud · Campus ÉQUATIO Marseille**

## Vue d'ensemble

3 pages HTML autonomes branchées sur un Apps Script + Google Sheet (collecteur universel) :

| Page | Public | Rôle |
|---|---|---|
| `arcade.html` | Élève | Quiz 50 questions tirées dans 124, ludique, anti-triche, note /20 + médaille |
| `tableau-bord-live.html` | Prof | Surveillance temps réel pendant l'épreuve : heartbeat, focus perdu, reconnects, devtools |
| `tableau-bord.html` | Prof | Bilan post-épreuve : liste, radar moyen, heatmap classe × thème, export CSV |

+ 9 fiches de révision (`ressources/01_*.html` à `09_*.html`) + index (`ressources/index.html`).

## Caractéristiques

- **Banque chiffrée** AES-GCM 256 bits (PBKDF2 200 000 itérations) — déchiffrée côté navigateur avec passphrase prof
- **9 thèmes** mappés sur le référentiel 2nde TNE (CC1 → CC9) : sécurité élec, hauteur, responsabilité, F-GAZ, thermo, composants frigo (8 schémas), électrotech (15 symboles NF), RI/vie classe, orientation post-TNE
- **Tirage aléatoire** par thème + mélange ordre questions + mélange choix → chaque élève reçoit un questionnaire unique, anti-copie sur le voisin
- **Anti-triche** : HMAC sur le score final, détection devtools, log focus perdu, détection reconnexions (gap > 60s), détection token mismatch, copier/coller bloqué, console silencieuse
- **Heartbeat 15 s** pour surveillance live + détection inactivité
- **Note /20** + sous-notes par thème (radar 9 axes) calculée au build du résultat
- **Charte inerWeb Édu** stricte : Calibri 14pt min, bleu `#1b3a63`, orange `#ff6b35`, fond clair, pas de dark mode

## Arborescence

```
inerweb-bilan-tne/
├── arcade.html                ← élève (Cockpit Frigo)
├── tableau-bord-live.html     ← prof — surveillance temps réel
├── tableau-bord.html          ← prof — bilan post-épreuve
├── favicon.svg
├── data/
│   ├── SCHEMA.md              ← format JSON questions
│   ├── bilan-tne.json         ← banque CLAIR (dev) - 124 questions
│   ├── bilan-tne.enc          ← banque CHIFFRÉE (prod) — généré par build/build.js
│   └── bilan-tne.enc.json     ← debug du chiffrement
├── assets/
│   ├── svg-frigo/             ← 9 schémas frigo sanitisés (sf_01 à sf_09)
│   │   └── MAPPING.md         ← correspondance prof (HORS livraison élève)
│   └── svg-electrotech/       ← 15 symboles NF inline (se_01 à se_15)
│       └── MAPPING.md         ← correspondance prof (HORS livraison élève)
├── apps-script/
│   ├── Code.gs                ← backend Apps Script (12+ routes)
│   └── appsscript.json        ← manifeste
├── build/
│   └── build.js               ← chiffre la banque (Node.js + crypto)
├── ressources/
│   ├── index.html             ← portail des 9 fiches
│   ├── 01_fiche_securite_electrique.html
│   ├── 02_fiche_travail_hauteur.html
│   ├── 03_fiche_responsabilite_eleve.html
│   ├── 04_fiche_fgaz.html
│   ├── 05_fiche_thermodynamique.html
│   ├── 06_fiche_composants_frigo.html
│   ├── 07_fiche_electrotech.html
│   ├── 08_fiche_ri_vie_classe.html
│   └── 09_fiche_orientation_post_tne.html
├── MAPPING.md                 ← mapping global SVG → noms (HORS livraison)
├── README.md
├── PROCEDURE_PROF.md
└── DEPLOIEMENT.md
```

## Mention RGPD

> Données traitées par F. Henninot, enseignant LP Privé Jacques Raynaud — Campus ÉQUATIO Marseille.
> Stockage chiffré AES-256 sur Google Sheets (collecteur universel). Données pseudo + initiale uniquement (pas de nom complet en clair côté serveur).
> Suppression au 31/08 de chaque année scolaire.

## Composition du bilan

| # | Thème | Tirées | Banque | Compétences CC |
|---|---|---|---|---|
| 1 | Sécurité électrique | 8 | 20 | CC22, CC61, CC75 |
| 2 | Travail en hauteur | 5 | 12 | CC22, CC61, CC75 |
| 3 | Responsabilité élève | 3 | 8 | CC75, CC93 |
| 4 | F-GAZ | 7 | 18 | CC43, CC61 |
| 5 | Thermodynamique | 7 | 18 | CC32, CC52 |
| 6 | Composants frigo (svg) | 6 | 12 | CC31, CC33 |
| 7 | Électrotechnique (svg + qcm) | 8 | 20 | CC31, CC33, CC42 |
| 8 | Règlement intérieur + vie classe | 3 | 8 | savoir-être |
| 9 | Orientation post-TNE | 3 | 8 | parcours |
| | **TOTAL** | **50** | **124** | |

**Notation** : note finale /20 + 9 sous-notes par thème (calculées en interne, visibles dans le tableau de bord prof + radar élève).

## Pour démarrer

1. Lis `DEPLOIEMENT.md` (Apps Script + GitHub Pages)
2. Lis `PROCEDURE_PROF.md` (préparer une session, donner le mot de passe, exporter)
3. Construis la banque chiffrée : `cd build && node build.js`
4. Pousse sur GitHub et active Pages
5. Donne le mot de passe d'épreuve aux élèves au tableau

## Crédits

Conception et code : Franck Henninot · LP Privé Jacques Raynaud — Campus ÉQUATIO Marseille
Cowork Claude Opus 4.7 — mai 2026
