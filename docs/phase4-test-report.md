# Phase 4.2 — Rapport d'Exécution et Fiabilité des Preuves
## Collector Marketplace TestOps (Schema v2.0.0)

Document mis à jour le 01/11/2026 suite à la revue indépendante de Phase 4.2.
Fichier audité en boîte noire : `scripts/collect-reports.candidate.mjs` (918 lignes).

---

## 1. Synthèse de l'Exécution Réelle la Plus Récente

Commande exécutée :
```powershell
node --test tests/collector/collect-reports.test.mjs
```

### Résultats bruts observés
- **Total des tests exécutés** : 37
- **Tests réussis** : 37 (100%)
- **Tests échoués** : 0
- **Suites de test** : 6 (5 groupes fonctionnels + suite racine)
- **Durée totale rapportée par le test runner** : `duration_ms 2933.4308` (durée d'exécution de la suite : 2.82 s)
- **Intégrité des 5 fichiers protégés** : Validée en `before()` et `after()` par empreintes SHA-256 non nulles identiques.

---

## 2. Classification Détaillée des Résultats

### A. Tests Réussis (Conformité au Schéma TestOps v2.0.0)
- **Surefire XML** :
  - Extraction exacte de `testsCount`, `passedCount`, `failedCount`, `errorCount`, `skippedCount` et `durationMs` sur XML valides (Tests 1, 2, 3, 4).
  - Gestion sans plantage de fichiers non-conformes ou absents (Tests 6, 7, 11, 12).
  - Gestion des cas non-numériques : `tests="not_a_number"` déclenche l'arrêt strict de cohérence (`NaN !== NaN` dans `validatePayload`), `time="invalid"` sérialise `durationMs: null` sans crash (Tests 8, 9).
- **Quality Guardian Diagnostics** :
  - Ségrégation stricte : les findings restent cantonnés dans `diagnostics`, aucun n'est injecté dans `suites[]` ni ne modifie `summary.totalTests` (Tests 13, 29).
  - Normalisation robuste des findings : rejet strict des findings dépourvus de `rule`, `message` ou `file` (Tests 14, 15, 16).
  - Repli contrôlé : sévérité inconnue normalisée en `"WARNING"` (Test 17).
  - Préservation fidèle des types de `line` (`undefined`, `null`, `42`) (Test 18).
  - Résilience aux fichiers corrompus : fichiers invalides ignorés sans interrompre le traitement des valides (Tests 19, 21, 24).
  - Signalement explicite des répertoires absents ou vides (`available: false` avec motif) (Tests 22, 23).
- **Historique des Snapshots** :
  - Tri chronologique fonctionnel sur mtimes distincts : le snapshot avec le mtime le plus récent est sélectionné même si un fichier plus ancien porte le nom `"final"` (Tests 25, 26, 28).
- **Intégrité et Sécurité des Fichiers** :
  - Les 5 fichiers protégés existent, ont des hashes non nuls et demeurent strictement intacts (Tests 33, 34, hook `after()`).
  - Les répertoires sources temporaires ne subissent aucune modification de fichier ni d'empreinte lors d'une collecte réussie (Test 35).
  - Le collecteur écrit exclusivement dans le fichier cible `--output` fourni (Test 36).
  - Lors d'une erreur de renommage, le fichier temporaire `.testops-report-tmp-*` est nettoyé par `unlinkSync` (Test 37).

---

### B. Comportements Incorrects Caractérisés (Défauts du Collecteur Candidat)

1. **Suite 100% ignorée étiquetée `passed` (Test 5)** :
   - *Observation* : Lorsque `tests=1, skipped=1, failures=0, errors=0`, le statut général de la suite est évalué à `'passed'` au lieu de `'unknown'` ou `'skipped'`.
   - *Cause dans le code* : La condition ternaire `(failures > 0 || errors > 0) ? 'failed' : tests === 0 ? 'unknown' : 'passed'` ne teste pas si `tests === skipped`.
2. **Absence de validation de positivité sur les compteurs XML (Test 10)** :
   - *Observation* : Une entrée `failures="-1"` est conservée telle quelle (`failedCount: -1`, `summary.failed: -1`) et `passedCount` est calculé à `3` via `Math.max(0, 2 - (-1))`.
   - *Cause dans le code* : Utilisation brute de `parseInt()` sans `Math.max(0, ...)`.
3. **Acceptation sans avertissement d'un JSON Guardian sans clé `findings` (Test 20)** :
   - *Observation* : Un fichier JSON valide sans propriété `findings` (ex: `{ "metadata": "only" }`) est accepté comme un snapshot valide avec 0 finding.
   - *Cause dans le code* : `Array.isArray(parsed.findings) ? parsed.findings : []` replie silencieusement sur un tableau vide.
4. **Non-déterminisme du tri en cas de mtimes identiques (Test 27)** :
   - *Observation* : En cas de mtimes strictement égaux, le comparateur `(a, b) => a.fileMtimeISO < b.fileMtimeISO ? -1 : a.fileMtimeISO > b.fileMtimeISO ? 1 : 0` renvoie `0`.
   - *Conséquence* : Le collecteur ne fournit aucun critère de tri secondaire (comme l'ordre alphabétique du nom de fichier). L'ordre final dépend uniquement de la stabilité de l'algorithme de tri de la plateforme et de l'ordre d'énumération du système de fichiers hôte.

---

### C. Garanties Non Démontrées

1. **Inspection des Workflows CI/CD (Test 30)** :
   - Le test démontre que le collecteur n'injecte aucune fausse suite `github-actions` et laisse `executions: []`.
   - **Non démontré** : Le collecteur n'inspecte pas les fichiers YAML dans son architecture actuelle (`collectExecutions()` renvoie inconditionnellement `[]`). Le test ne démontre donc pas une validation ou une analyse de configuration CI/CD, mais l'absence voulue de génération de données factices.
2. **Atomicité Matérielle Complète (Test 37)** :
   - Le test démontre que le bloc `catch` de `writeJsonAtomic` supprime le fichier `.testops-report-tmp-*` lorsque `renameSync` échoue sur une collision avec un répertoire sous Windows.
   - **Non démontré** : Cela ne garantit pas l'atomicité face à un arrêt brutal de la machine (coupure d'alimentation), un crash du noyau, ou une défaillance de `fs.unlinkSync` (ex: permission refusée sur le fichier temporaire).

---

### D. Limitations de l'Environnement

1. **Ordre d'énumération du système de fichiers (`fs.readdirSync`)** :
   - Ni Node.js ni la norme POSIX ne garantissent l'ordre de retour de `readdirSync`. Sous Windows NTFS, l'ordre est généralement alphabétique pour les petits répertoires, mais ce comportement n'est pas contractuel.
2. **Permissions Sandbox Windows** :
   - Lors d'une exécution sandboxed sans arguments CLI, les répertoires réels de `marketplace` renvoient une erreur d'accès (`inaccessible`), ce qui est le comportement normal de sécurité du bac à sable.

---

## 3. Intégrité Cryptographique des Fichiers Protégés

| Fichier | Taille | Empreinte SHA-256 observée | Statut |
|---|---:|---|---|
| `scripts/collect-reports.candidate.mjs` | 39 247 | `988D7DDB39ECE2B87AC1D4AC7C8794E40DED446DF7A4B2ADB9C05E4FD6C103C6` | **INCHANGÉ** |
| `scripts/collect-reports.mjs` | 2 520 | `1CE8BC4D3510081B18F8F58C22271691F3E9CCAD0806BAF1BEA1F006093557AE` | **INCHANGÉ** |
| `scripts/collect-reports.before-fix.mjs` | 2 520 | `1CE8BC4D3510081B18F8F58C22271691F3E9CCAD0806BAF1BEA1F006093557AE` | **INCHANGÉ** |
| `scripts/collect-reports.restored.mjs` | 11 637 | `E99D5AEBDA24050FC5FAC531A3E722C5D7A2B0E5FB943957D9169E4A962EBB3B` | **INCHANGÉ** |
| `public/data/testops-report.json` | 4 374 | `9FECD555CFD1F629270947D8C0A2314881AFDF9C78E53EF730F0D737DFD3FFEF` | **INCHANGÉ** |

---

## 4. État Git (`git status --short`)

```text
A  scripts/collect-reports.candidate.mjs
?? docs/
?? scripts/collect-reports.before-fix.mjs
?? scripts/collect-reports.restored.mjs
?? tests/
```

Fichiers modifiés au cours de la Phase 4.2 :
1. `tests/collector/collect-reports.test.mjs`
2. `docs/phase4-test-plan.md`
3. `docs/phase4-test-report.md`

Aucune modification n'a été apportée au collecteur candidat ou aux fichiers protégés.
