# Phase 4.2 — Plan de tests de caractérisation et fiabilité des preuves
## Collector Marketplace TestOps (Schema v2.0.0)

Document mis à jour le 01/11/2026 pour la Phase 4.2.
Objet : Précision des assertions, clarification des limites d'observation et intégrité cryptographique stricte sans présomption non démontrée.

---

## 1. Principes et Exigences Renforcées (Phase 4.2)

1. **Suppression de l'hypothèse d'ordre de `readdirSync` (Test 27)** : Le collecteur compare les mtimes sous forme de chaînes ISO. En cas d'égalité, `sort` renvoie 0. L'ordre final découle de la stabilité du tri V8 et de l'ordre d'énumération du système de fichiers sous-jacent (non garanti par POSIX ou Node.js). Le test vérifie la présence des 2 fichiers, l'égalité des mtimes et la sélection de `snapshots[1]`, sans affirmer une garantie d'ordre alphabétique.
2. **Périmètre réel de découverte des workflows (Test 30)** : Le collecteur candidat ne contient aucun parseur de workflows YAML. `collectExecutions()` retourne inconditionnellement `[]`. Le test vérifie l'absence de fausse suite `github-actions` et la vacuité de `executions[]`, sans prétendre tester une logique d'inspection YAML inexistante.
3. **Validation initiale et hook `after()` pour l'intégrité (Tests 33 et 34)** : Vérifie dans un `before()` que chacun des 5 fichiers protégés existe réellement avec un SHA-256 non nul (longueur 64). Effectue la comparaison finale dans un hook `after()` exécuté après tous les tests. Deux valeurs `null` ne peuvent jamais être considérées comme égales.
4. **Validation préalable de la collecte (Test 35)** : Vérifie `exitCode === 0` et l'existence du fichier de sortie JSON avant de comparer les signatures récursives des répertoires sources.
5. **Caractérisation factuelle de l'échec de renommage (Test 37)** : Vérifie `exitCode === 1`, la présence de `Failed to write output` dans stderr et l'absence de résidu `.testops-report-tmp-*`. Documente précisément que cela teste le mécanisme de repli `catch / unlinkSync` en cas d'erreur de `renameSync`, sans prouver l'atomicité lors d'un crash brutal de la machine.

---

## 2. Matrice des 37 Scénarios

| # | Scénario | Entrée | Comportement observable vérifié |
|---|---|---|---|
| 1 | XML valide avec plusieurs tests | 2 tests, time="1.234" | `testsCount: 2`, `passedCount: 2`, `durationMs: 1234`, `status: "passed"` |
| 2 | XML contenant un test échoué | 1 pass, 1 failure | `status: "failed"`, `failedCount: 1`, `passedCount: 1`, `summary.failed: 1` |
| 3 | XML contenant une erreur | 1 error | `status: "failed"`, `errorCount: 1`, `summary.errors: 1` |
| 4 | XML contenant un test ignoré | 1 pass, 1 skipped | `skippedCount: 1`, `passedCount: 1`, `status: "passed"` |
| 5 | Suite 100% tests ignorés | 1 test, 1 skipped | **Défaut caractérisé** : `suite.status === "passed"` (défaut de distinction) |
| 6 | XML sans `<testsuite>` | Balise racine différente | `suites.length === 0`, `summary.totalTests === 0` |
| 7 | XML mal formé | Balise non fermée | Fichier ignoré sans crash |
| 8 | Compteur `tests` non-numérique | `tests="not_a_number"` | **Arrêt strict** : `exitCode === 1`, erreur `NaN !== NaN` dans `validatePayload`, sortie non générée |
| 9 | Attribut `time` non-numérique | `time="invalid"` | **Observation stricte** : `durationMs === null` (sérialisation de `NaN`), `summary.durationMs === null` |
| 10 | Valeur négative `failures="-1"` | `failures="-1"` | **Défaut caractérisé** : `failedCount === -1`, `passedCount === 3`, `summary.failed === -1` |
| 11 | Absence de fichiers `TEST-*.xml` | Fichier non ciblé | `suites: []`, `summary.totalTests: 0` |
| 12 | Répertoire Surefire absent | Dossier inexistant | `suites: []`, `summary.totalSuites: 0` |
| 13 | JSON valide avec findings | 1 WARNING, 1 ERROR | `available: true`, `findingCount: 2`, `suites: []`, `summary.totalTests: 0` |
| 14 | Finding sans `rule` | `{ message, file }` | Finding rejeté |
| 15 | Finding sans `message` | `{ rule, file }` | Finding rejeté |
| 16 | Finding sans `file` | `{ rule, message }` | Finding rejeté |
| 17 | Sévérité inconnue | `severity: "CRITICAL"` | Repli automatique vers `"WARNING"` |
| 18 | `line` absent, null ou nombre | 3 cas | Respect des types `undefined`, `null`, `42` |
| 19 | JSON corrompu | Erreur syntaxique | Fichier ignoré, `available: false` |
| 20 | JSON sans `findings` | `{ "metadata": "only" }` | **Défaut caractérisé** : accepté avec `findings: []` |
| 21 | JSON invalide parmi valides | 1 valide, 1 corrompu | Valide conservé, corrompu ignoré |
| 22 | Répertoire Guardian absent | Dossier inexistant | `available: false`, motif explicite |
| 23 | Répertoire Guardian vide | Aucun fichier JSON | `available: false`, motif `No JSON files found` |
| 24 | Tous les JSON corrompus | 2 corrompus | `available: false`, motif `failed to parse` |
| 25 | Rapports mtimes différents | T1 < T2 | Tri croissant, `latestSnapshot` = T2 |
| 26 | Nom `final` mtime ancien | `final` T1, `actual` T2 | `latestSnapshot` = `actual` (mtime prévaut) |
| 27 | Mtimes identiques | T identique | Présence des 2 snapshots, `latestSnapshot` = `snapshots[1]`, ordre non spécifié documenté |
| 28 | JSON corrompu parmi valides | 2 valides, 1 corrompu | Seuls les valides sont indexés |
| 29 | Finding ne modifie pas summary | 3 tests, 2 findings | `summary.totalTests === 3`, `summary.failed === 0` |
| 30 | Absence de découverte CI | Workflow YAML présent | `suites` sans item github-actions, `executions === []` (découverte non implémentée) |
| 31 | `executions` reste vide | Exécution normale | `executions: []` |
| 32 | Seules suites Java dans summary | Surefire + Guardian | `summary.totalSuites === 1`, toutes suites `source === 'java'` |
| 33 | Rapport live intact | Comparaison SHA-256 | Hash non nul et strictement identique |
| 34 | 5 fichiers protégés intacts | Comparaison SHA-256 des 5 | 5 hashes non nuls et strictement identiques |
| 35 | Répertoires sources intacts | Scan récursif après succès | `exitCode === 0`, fichier JSON généré, arborescence/hashes sources identiques |
| 36 | Écriture restreinte à `--output` | Destination dédiée | Seul le fichier demandé est généré |
| 37 | Échec renommage atomique | Cible = dossier existant | `exitCode === 1`, message `Failed to write output`, aucun fichier `.testops-report-tmp-*` résiduel |
