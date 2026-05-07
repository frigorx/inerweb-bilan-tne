# Schéma de données — banque de questions

> Source de vérité : `data/bilan-tne.json` (clair, dev) → chiffré en `data/bilan-tne.enc` (AES-GCM, prod)

## Format global

```json
{
  "module": "inerweb-bilan-tne",
  "version": "1.0",
  "date_build": "2026-05-07",
  "themes": [...],
  "questions": [...],
  "symboles_frigo": [...],
  "symboles_electrotech": [...]
}
```

## themes[]

```json
{
  "id": "secu_elec",
  "label": "Sécurité électrique",
  "description": "Habilitation B0/H0/BS, EPI électricien, VAT",
  "tirees": 8,
  "banque_min": 20,
  "ordre": 1,
  "competences_cc": ["CC22", "CC61", "CC75"]
}
```

**Liste des 9 thèmes** :

| id | label | tirées | banque |
|---|---|---|---|
| `secu_elec` | Sécurité électrique | 8 | 20 |
| `hauteur` | Travail en hauteur | 5 | 12 |
| `responsabilite` | Responsabilité élève | 3 | 8 |
| `fgaz` | F-GAZ | 7 | 18 |
| `thermo` | Thermodynamique | 7 | 18 |
| `frigo` | Composants frigo | 6 | 12 |
| `electrotech` | Électrotechnique | 8 | 20 |
| `ri_classe` | Règlement intérieur + vie de classe | 3 | 8 |
| `orientation` | Orientation post-TNE | 3 | 8 |
| **TOTAL** | | **50** | **124** |

## questions[]

```json
{
  "id": "q042",
  "theme": "secu_elec",
  "type": "qcm4",
  "niveau": "base",
  "enonce": "Quelle habilitation est nécessaire pour effectuer une consignation électrique en BT ?",
  "choix": ["B0", "BR", "BC", "H0V"],
  "reponse": 2,
  "explication": "BC = Chargé de Consignation (BT). B0 = exécutant non électricien.",
  "competences_cc": ["CC22", "CC61"]
}
```

**Champs obligatoires** :
- `id` : neutre (`q001`...`q124`), pas le nom du composant ni du thème
- `theme` : un des 9 ids
- `type` : `qcm4` (4 choix), `svg-mystere` (avec `svg_id`), `vrai-faux` (2 choix)
- `enonce` : la question, sans le nom du composant si `svg-mystere`
- `choix` : tableau de 2 ou 4 strings
- `reponse` : index 0-based de la bonne réponse
- `explication` : 1-2 phrases pour le feedback élève (affiché après réponse)
- `niveau` : `base` | `application` | `analyse` (pour pondération éventuelle)
- `competences_cc` : codes officiels TNE

**Pour les questions svg-mystere** :

```json
{
  "id": "q078",
  "theme": "frigo",
  "type": "svg-mystere",
  "svg_id": "sf_03",
  "enonce": "Quel est le nom de ce composant frigorifique ?",
  "choix": ["Compresseur", "Détendeur thermostatique", "Électrovanne", "Vanne à pression constante"],
  "reponse": 1,
  "explication": "Le détendeur thermostatique régule l'évaporation par la surchauffe en sortie d'évaporateur.",
  "niveau": "base",
  "competences_cc": ["CC31", "CC33"]
}
```

Le `svg_id` (`sf_03`) est neutre — aucun lien avec le nom du composant. Le mapping `svg_id → contenu SVG` est dans `symboles_frigo[]`.

## symboles_frigo[] / symboles_electrotech[]

```json
{
  "id": "sf_03",
  "svg": "<svg viewBox='0 0 200 200'>...</svg>"
}
```

**Aucune métadonnée nominative** côté serveur ni côté client. Le SVG est sanitisé (pas de `<text>`, `<title>`, `<desc>`, `<metadata>`, `id`, `inkscape:*`, `data-*`).

## Tirage côté arcade.html

1. Pour chaque thème, tirer aléatoirement `tirees` questions parmi `banque[]`
2. Concaténer dans l'ordre des thèmes (1 → 9)
3. Mélanger l'ordre des thèmes (sauf `ri_classe` et `orientation` qui restent en fin pour la respiration)
4. Mélanger l'ordre des choix de chaque question (et reconstruire l'index `reponse`)

Résultat : 50 questions dans un ordre unique par élève, anti-copie sur le voisin.
