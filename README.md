# Marketplace TestOps Dashboard

[![React](https://img.shields.io/badge/React-19.3-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20%2F%206.x-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646cff.svg)](https://vitejs.dev/)
[![QA Automation](https://img.shields.io/badge/Role-QA%20Automation%20%26%20Harness%20Engineer-purple.svg)]()

Tableau de bord local de **QA Automation & Harness Engineering** pour la plateforme **Marketplace TestOps**.
Il centralise, normalise et visualise les résultats d'exécution réels des tests automatisés Java/Maven, des audits de sécurité Quality Guardian Python, et des workflows CI/CD GitHub Actions.

---

## 1. Architecture Technique

```
marketplace-testops/frontend/
├── public/
│   ├── data/
│   │   └── testops-report.json    # Rapport JSON normalisé collecté en local
│   ├── favicon.svg
│   └── icons.svg
├── scripts/
│   └── collect-reports.mjs        # Collecteur local universel (Surefire XML + Guardian JSON)
├── src/
│   ├── components/
│   │   ├── Header.tsx             # En-tête, SHA git, provenance et bascule Démo/Réel
│   │   ├── MetricCards.tsx        # Cartes métriques (taux de succès, durée, ventilation Java/Python)
│   │   ├── SourceBreakdown.tsx    # Sections dédiées Surefire, Quality Guardian, GitHub Actions
│   │   ├── TestDetailModal.tsx    # Modale d'inspection approfondie (stack traces, lignes de règles)
│   │   ├── TestRunsTable.tsx      # Table interactive (recherche, filtres par source et statut)
│   │   └── StatusBanner.tsx       # Bannières d'état (vide, erreur, avertissement démo)
│   ├── data/
│   │   └── demo-data.ts           # Données d'exemple isolées (fallback sans écraser le réel)
│   ├── services/
│   │   └── reportService.ts       # Service de chargement, validation JSON et parsing résilient
│   ├── types/
│   │   └── testops.ts             # Schéma TypeScript strict (TestOpsReport, Suite, Case, Status)
│   ├── App.css                    # Design system fluide (sans dépendance lourde externe)
│   ├── App.tsx                    # Composant maître du Dashboard
│   └── main.tsx                   # Point d'entrée React
├── package.json                   # Scripts 'dev', 'build', 'lint', 'collect'
└── vite.config.ts
```

---

## 2. Prérequis

- **Node.js** : v20+ ou v24+
- **npm** : v10+
- **PowerShell** (Windows) ou terminal standard
- **Java 17 / 21 & Maven** (pour générer les rapports Surefire dans `marketplace`)
- **Python 3.9+** (pour générer les rapports Quality Guardian dans `marketplace/ai-lab`)

---

## 3. Installation et Démarrage Local

Depuis le répertoire du frontend :

```powershell
cd C:\Users\dell\Desktop\6in1\marketplace-testops\frontend

# 1. Vérifier l'installation des dépendances
npm install

# 2. Lancer le serveur de développement Vite
npm run dev
```

L'application est accessible par défaut sur `http://localhost:5173`.

---

## 4. Collecte et Normalisation des Rapports Réels

Le dashboard est conçu pour visualiser les résultats **réels** générés par vos suites de tests. Le navigateur ne pouvant pas lire arbitrairement votre disque Windows pour des raisons de sécurité, un collecteur Node.js dédié (`scripts/collect-reports.mjs`) extrait, normalise et exporte les données vers `public/data/testops-report.json`.

### Lancer la collecte

```powershell
cd C:\Users\dell\Desktop\6in1\marketplace-testops\frontend
npm run collect
```

### Ce que fait le collecteur :

1. **Java / Maven Surefire** :
   - Inspecte `../../marketplace/target/surefire-reports/`.
   - Parse les fichiers `TEST-*.xml` (sans dépendance externe).
   - Extrait les compteurs (`tests`, `failures`, `errors`, `skipped`, `time`), ainsi que le détail de chaque `<testcase>` avec son message d'échec et sa stack trace complète.
2. **Python / Quality Guardian** :
   - Inspecte `../../marketplace/ai-lab/month-01-quality-guardian/reports/`.
   - Normalise le rapport `quality-report.json` (ou `quality-report-after.json`).
   - Préserve les règles déclenchées (`SECRET_ASSIGNMENT`, `PRIVATE_KEY`), le niveau de sévérité, le fichier et la ligne sans divulguer les valeurs sensibles (politique Zero-Leak).
3. **GitHub Actions CI/CD** :
   - Inspecte les définitions de workflows dans `../../marketplace/.github/workflows/`.
   - Enregistre le statut de configuration et les étapes de build/test.
4. **Git Metadata** :
   - Récupère le dernier commit du dépôt `marketplace` (`git log -1`) en lecture seule pour afficher le SHA, l'auteur et le message exact de l'exécution.
5. **Calculs & Validation** :
   - Calcule le taux de succès global (`(passed / total) * 100`).
   - Cumule les durées exactes mesurées.
   - Écrit `public/data/testops-report.json`.

---

## 5. Comment Générer les Rapports Sources dans `marketplace`

Si vous souhaitez exécuter de nouveaux tests dans le dépôt `marketplace` :

### A. Tests Java / Maven Surefire
```powershell
cd C:\Users\dell\Desktop\6in1\marketplace
.\mvnw.cmd clean test --no-transfer-progress
```
Les rapports XML sont générés dans `target/surefire-reports/`.

### B. Audit Python Quality Guardian
```powershell
cd C:\Users\dell\Desktop\6in1\marketplace\ai-lab\month-01-quality-guardian
.\.venv\Scripts\python.exe cli.py scan --root ../.. --report reports/quality-report.json
```
Le rapport d'audit est généré dans `reports/quality-report.json`.

Puis, revenez dans le frontend pour actualiser le dashboard :
```powershell
cd C:\Users\dell\Desktop\6in1\marketplace-testops\frontend
npm run collect
```
Dans l'interface web, cliquez sur le bouton **↻ Actualiser** pour charger instantanément les nouveaux résultats sans recharger la page.

---

## 6. Format du Contrat de Données JSON (`testops-report.json`)

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-10-26T21:13:08.762Z",
  "environment": "local",
  "repository": "marketplace",
  "git": {
    "commitSha": "80598c4",
    "author": "macModa",
    "commitDate": "2026-10-26 18:25:02 +0100",
    "commitMessage": "test: isolate Spring context tests with H2"
  },
  "summary": {
    "totalSuites": 4,
    "totalTests": 5,
    "passed": 4,
    "failed": 1,
    "errors": 0,
    "skipped": 0,
    "successRate": 80.0,
    "durationMs": 9503
  },
  "suites": [
    {
      "id": "surefire-TEST-com.marketplace.service.ProductServiceTest",
      "source": "java",
      "suiteName": "com.marketplace.service.ProductServiceTest",
      "status": "passed",
      "executedAt": "2026-10-26T20:25:16.615Z",
      "durationMs": 779,
      "testsCount": 2,
      "passedCount": 2,
      "failedCount": 0,
      "errorCount": 0,
      "skippedCount": 0,
      "testCases": [
        {
          "id": "com.marketplace.service.ProductServiceTest#getProductById_whenProductDoesNotExist_returns404",
          "name": "getProductById_whenProductDoesNotExist_returns404",
          "className": "com.marketplace.service.ProductServiceTest",
          "status": "passed",
          "durationMs": 518
        }
      ],
      "provenance": "Surefire XML: TEST-com.marketplace.service.ProductServiceTest.xml"
    }
  ]
}
```

---

## 7. Fonctionnalités de l'Interface

- **En-tête dynamique** : Affichage du SHA du commit Git, de la date de mesure exacte, de la provenance et statut des données.
- **Bascule Démo / Réel** : Permet à un recruteur ou évaluateur de basculer instantanément entre vos données réelles locales et un jeu de démonstration complet sans altérer les fichiers locaux.
- **Cartes métriques** : Tests exécutés, Taux de réussite (%), Échecs/Anomalies, Ignorés/Erreurs, Durée totale cumulée, avec distinction visuelle Java/Python.
- **Section Sources & Suites** :
  - Suites JUnit 5 / Surefire avec liste des méthodes testées et durée par test.
  - Rapports Quality Guardian avec tags de sévérité (`WARNING`, `ERROR`) et règles détectées.
  - Workflows GitHub Actions vérifiés.
- **Registre interactif des tests** :
  - Moteur de recherche en temps réel par nom de méthode, classe, message d'erreur ou règle.
  - Filtres segmentés par source (`Toutes sources`, `Java Maven`, `Python Guardian`, `CI/CD`).
  - Filtres segmentés par statut (`Tous`, `Réussis`, `En échec`).
- **Modale d'inspection diagnostique** :
  - Clic sur n'importe quel test ou anomalie.
  - Affichage de la stack trace complète dans un bloc de code stylisé.
  - Emplacement exact (fichier, ligne) pour un diagnostic immédiat de régression.
- **Gestion des états d'erreur & Empty State** :
  - Avertissement interactif avec commande PowerShell suggérée si aucun rapport n'a encore été généré.
  - Tolérance aux fichiers corrompus sans crash de l'interface.

---

## 8. Vérifications de Qualité Frontend

Le projet applique les règles strictes de TypeScript (`verbatimModuleSyntax`) et d'ESLint 9+ :

```powershell
# Vérification du typage et du linting
npm run lint

# Validation de la compilation de production
npm run build
```

---

## 9. Sécurité et Bonnes Pratiques

- **Aucun secret exposé** : Les rapports de Quality Guardian masquent volontairement la valeur brute des tokens et secrets détectés.
- **Aucune variable d'environnement sensible dans le frontend** : Aucun jeton d'API GitHub privé n'est injecté dans `VITE_*`.
- **Collecteur sécurisé** : Le collecteur s'exécute localement en lecture seule et ne prend aucune commande non vérifiée en provenance du navigateur.
