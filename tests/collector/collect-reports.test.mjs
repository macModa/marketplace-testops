/**
 * tests/collector/collect-reports.test.mjs
 *
 * Tests de caractérisation en boîte noire pour le collecteur candidat
 * scripts/collect-reports.candidate.mjs (Phase 4.2 — Finalisation et fiabilité des preuves)
 *
 * Invariants :
 * - Aucun fichier protégé n'est modifié
 * - Fixtures isolées dans os.tmpdir() et nettoyées après chaque test
 * - Exécution via child_process
 * - Assertions strictes sur comportements observables, sans hypothèses non démontrées
 * - Intégrité cryptographique des 5 fichiers protégés validée en before() et after()
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_ROOT = path.resolve(__dirname, '..', '..');
const CANDIDATE_SCRIPT = path.resolve(FRONTEND_ROOT, 'scripts', 'collect-reports.candidate.mjs');

// Liste des 5 fichiers strictement protégés
const PROTECTED_FILES = {
  candidate: path.resolve(FRONTEND_ROOT, 'scripts', 'collect-reports.candidate.mjs'),
  active: path.resolve(FRONTEND_ROOT, 'scripts', 'collect-reports.mjs'),
  beforeFix: path.resolve(FRONTEND_ROOT, 'tests', 'fixtures', 'collector', 'collect-reports.before-fix.mjs'),
  restored: path.resolve(FRONTEND_ROOT, 'tests', 'fixtures', 'collector', 'collect-reports.restored.mjs'),
  liveReport: path.resolve(FRONTEND_ROOT, 'public', 'data', 'testops-report.json'),
};

function getFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function scanDirSignatures(dirPath) {
  const result = {};
  if (!fs.existsSync(dirPath)) return result;

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dirPath, full);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        result[rel] = getFileHash(full);
      }
    }
  }

  walk(dirPath);
  return result;
}

/**
 * Helper d'exécution du collecteur candidat en sous-processus isolé
 */
function runCandidateCollector({ surefireDir, guardianDir, outputFile, extraArgs = [] }) {
  const args = [CANDIDATE_SCRIPT];

  if (surefireDir !== undefined) {
    args.push('--surefire', surefireDir);
  }
  if (guardianDir !== undefined) {
    args.push('--guardian', guardianDir);
  }
  if (outputFile !== undefined) {
    args.push('--output', outputFile);
  }
  if (extraArgs.length > 0) {
    args.push(...extraArgs);
  }

  const result = spawnSync(process.execPath, args, {
    cwd: FRONTEND_ROOT,
    encoding: 'utf-8',
    env: { ...process.env },
    timeout: 10000,
  });

  let parsedJson = null;
  if (outputFile && fs.existsSync(outputFile)) {
    try {
      const stat = fs.statSync(outputFile);
      if (stat.isFile()) {
        parsedJson = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      }
    } catch {
      parsedJson = null;
    }
  }

  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
    json: parsedJson,
  };
}

describe('Phase 4.2 — Caractérisation finale et fiabilité des preuves (Schema v2.0.0)', () => {
  let masterTmpDir;
  const initialProtectedHashes = {};

  before(() => {
    masterTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testops-charact-'));

    // Vérification initiale : existence réelle et SHA-256 non nul de chaque fichier protégé
    for (const [key, filePath] of Object.entries(PROTECTED_FILES)) {
      assert.ok(fs.existsSync(filePath), `Le fichier protégé ${key} (${filePath}) doit exister initialement sur le disque`);
      const hash = getFileHash(filePath);
      assert.notEqual(hash, null, `L'empreinte initiale de ${key} ne doit pas être nulle`);
      assert.equal(typeof hash, 'string', `L'empreinte initiale de ${key} doit être une chaîne`);
      assert.equal(hash.length, 64, `L'empreinte initiale de ${key} doit être un hash SHA-256 de 64 caractères hexadécimaux`);
      initialProtectedHashes[key] = hash;
    }
  });

  after(() => {
    try {
      // Vérification finale exhaustive : exécutée après l'ensemble des tests
      for (const [key, filePath] of Object.entries(PROTECTED_FILES)) {
        assert.ok(fs.existsSync(filePath), `Le fichier protégé ${key} doit toujours exister après l'ensemble des tests`);
        const finalHash = getFileHash(filePath);
        assert.notEqual(finalHash, null, `L'empreinte finale de ${key} ne doit pas être nulle`);
        assert.equal(
          finalHash,
          initialProtectedHashes[key],
          `L'empreinte SHA-256 finale de ${key} (${path.basename(filePath)}) doit correspondre exactement à l'empreinte initiale`
        );
      }
    } finally {
      if (masterTmpDir && fs.existsSync(masterTmpDir)) {
        fs.rmSync(masterTmpDir, { recursive: true, force: true });
      }
    }
  });

  function createTestWorkspace(name) {
    const ws = path.join(masterTmpDir, `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(ws, { recursive: true });
    const surefireDir = path.join(ws, 'surefire');
    const guardianDir = path.join(ws, 'guardian');
    const outputDir = path.join(ws, 'output');
    fs.mkdirSync(surefireDir, { recursive: true });
    fs.mkdirSync(guardianDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    const outputFile = path.join(outputDir, 'report.json');

    return {
      ws,
      surefireDir,
      guardianDir,
      outputDir,
      outputFile,
      cleanup: () => {
        try {
          fs.rmSync(ws, { recursive: true, force: true });
        } catch {}
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // A. Maven Surefire (Scénarios 1 à 12)
  // ───────────────────────────────────────────────────────────────────────────
  describe('A. Maven Surefire XML', () => {
    it('1. XML valide avec plusieurs tests réussis', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc1');
      try {
        fs.writeFileSync(
          path.join(surefireDir, 'TEST-Success.xml'),
          `<testsuite name="com.example.SuccessTest" tests="2" failures="0" errors="0" skipped="0" time="1.234">
            <testcase name="testA" classname="com.example.SuccessTest" time="0.500"/>
            <testcase name="testB" classname="com.example.SuccessTest" time="0.734"/>
          </testsuite>`
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        assert.equal(res.json.suites.length, 1);
        const suite = res.json.suites[0];
        assert.equal(suite.suiteName, 'com.example.SuccessTest');
        assert.equal(suite.testsCount, 2);
        assert.equal(suite.passedCount, 2);
        assert.equal(suite.failedCount, 0);
        assert.equal(suite.errorCount, 0);
        assert.equal(suite.skippedCount, 0);
        assert.equal(suite.status, 'passed');
        assert.equal(suite.durationMs, 1234);
        assert.equal(suite.testCases.length, 2);
        assert.equal(res.json.summary.totalTests, 2);
        assert.equal(res.json.summary.passed, 2);
        assert.equal(res.json.summary.successRate, 100);
      } finally {
        cleanup();
      }
    });

    it('2. XML contenant un test échoué', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc2');
      try {
        fs.writeFileSync(
          path.join(surefireDir, 'TEST-Failure.xml'),
          `<testsuite name="com.example.FailTest" tests="2" failures="1" errors="0" skipped="0" time="0.800">
            <testcase name="testPass" classname="com.example.FailTest" time="0.300"/>
            <testcase name="testFail" classname="com.example.FailTest" time="0.500">
              <failure message="Assertion failed: expected 1 but got 2" type="AssertionError">stacktrace</failure>
            </testcase>
          </testsuite>`
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        const suite = res.json.suites[0];
        assert.equal(suite.status, 'failed');
        assert.equal(suite.passedCount, 1);
        assert.equal(suite.failedCount, 1);
        assert.equal(res.json.summary.failed, 1);
        assert.equal(res.json.summary.passed, 1);
        assert.equal(suite.testCases[1].status, 'failed');
        assert.equal(suite.testCases[1].errorMessage, 'Assertion failed: expected 1 but got 2');
      } finally {
        cleanup();
      }
    });

    it('3. XML contenant une erreur d\'exécution', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc3');
      try {
        fs.writeFileSync(
          path.join(surefireDir, 'TEST-Error.xml'),
          `<testsuite name="com.example.ErrTest" tests="1" failures="0" errors="1" skipped="0" time="0.200">
            <testcase name="testCrash" classname="com.example.ErrTest" time="0.200">
              <error message="NullPointerException" type="java.lang.NullPointerException">stacktrace</error>
            </testcase>
          </testsuite>`
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        const suite = res.json.suites[0];
        assert.equal(suite.status, 'failed');
        assert.equal(suite.errorCount, 1);
        assert.equal(suite.failedCount, 0);
        assert.equal(res.json.summary.errors, 1);
      } finally {
        cleanup();
      }
    });

    it('4. XML contenant un test ignoré', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc4');
      try {
        fs.writeFileSync(
          path.join(surefireDir, 'TEST-Skipped.xml'),
          `<testsuite name="com.example.SkipTest" tests="2" failures="0" errors="0" skipped="1" time="0.500">
            <testcase name="testPass" classname="com.example.SkipTest" time="0.500"/>
            <testcase name="testSkip" classname="com.example.SkipTest" time="0">
              <skipped message="Temporarily disabled"/>
            </testcase>
          </testsuite>`
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        const suite = res.json.suites[0];
        assert.equal(suite.skippedCount, 1);
        assert.equal(suite.passedCount, 1);
        assert.equal(suite.status, 'passed');
        assert.equal(res.json.summary.skipped, 1);
        assert.equal(suite.testCases[1].status, 'skipped');
      } finally {
        cleanup();
      }
    });

    it('5. Suite composée uniquement de tests ignorés', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc5');
      try {
        fs.writeFileSync(
          path.join(surefireDir, 'TEST-AllSkipped.xml'),
          `<testsuite name="com.example.AllSkipTest" tests="1" failures="0" errors="0" skipped="1" time="0.010">
            <testcase name="testOnlySkip" classname="com.example.AllSkipTest" time="0">
              <skipped message="Ignored"/>
            </testcase>
          </testsuite>`
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        const suite = res.json.suites[0];
        assert.equal(suite.testsCount, 1);
        assert.equal(suite.skippedCount, 1);
        assert.equal(suite.passedCount, 0);
        assert.equal(suite.status, 'skipped');
      } finally {
        cleanup();
      }
    });

    it('6. XML sans élément <testsuite>', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc6');
      try {
        fs.writeFileSync(
          path.join(surefireDir, 'TEST-NoSuite.xml'),
          `<?xml version="1.0"?><other-element><subnode/></other-element>`
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        assert.equal(res.json.suites.length, 0);
        assert.equal(res.json.summary.totalTests, 0);
      } finally {
        cleanup();
      }
    });

    it('7. XML mal formé (syntaxe invalide)', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc7');
      try {
        fs.writeFileSync(
          path.join(surefireDir, 'TEST-Corrupt.xml'),
          `<testsuite name="Corrupt" tests="5" failures=` // truncated
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        assert.equal(res.json.suites.length, 0);
      } finally {
        cleanup();
      }
    });

    it('8. Compteur tests invalide (non-numérique)', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc8');
      try {
        fs.writeFileSync(
          path.join(surefireDir, 'TEST-NanTests.xml'),
          `<testsuite name="NanTest" tests="not_a_number" failures="0" errors="0" skipped="0" time="1.0">
            <testcase name="tc1" classname="NanTest" time="1.0"/>
          </testsuite>`
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        assert.equal(res.json.suites.length, 0);
        assert.equal(res.json.summary.totalTests, 0);
        assert.equal(res.json.summary.durationMs, 0);
        assert.match(res.stderr, /Invalid non-negative integer/);
        assert.equal(fs.existsSync(outputFile), true);
      } finally {
        cleanup();
      }
    });

    it('9. Attribut time invalide', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc9');
      try {
        fs.writeFileSync(
          path.join(surefireDir, 'TEST-InvalidTime.xml'),
          `<testsuite name="InvalidTime" tests="1" failures="0" errors="0" skipped="0" time="invalid">
            <testcase name="tc1" classname="InvalidTime" time="1.0"/>
          </testsuite>`
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });

        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        assert.equal(res.json.suites.length, 0);
        assert.equal(res.json.summary.totalTests, 0);
        assert.equal(res.json.summary.durationMs, 0);
        assert.match(res.stderr, /Invalid non-negative duration/);
      } finally {
        cleanup();
      }
    });

    it('9b. Dur?e testcase invalide', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc9b');
      try {
        fs.writeFileSync(
          path.join(surefireDir, 'TEST-InvalidTestcaseTime.xml'),
          `<testsuite name="InvalidTestcaseTime" tests="1" failures="0" errors="0" skipped="0" time="1.0">
            <testcase name="tc1" classname="InvalidTestcaseTime" time="foo"/>
          </testsuite>`
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        assert.equal(res.json.suites.length, 0);
        assert.equal(res.json.summary.totalTests, 0);
        assert.equal(res.json.summary.durationMs, 0);
        assert.match(res.stderr, /Invalid non-negative duration/);
      } finally {
        cleanup();
      }
    });

    it('10. Valeurs négatives et valeurs numériques incohérentes', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc10');
      try {
        fs.writeFileSync(
          path.join(surefireDir, 'TEST-Negative.xml'),
          `<testsuite name="NegativeSuite" tests="2" failures="-1" errors="0" skipped="0" time="0.5">
            <testcase name="tc1" classname="NegativeSuite" time="0.5"/>
          </testsuite>`
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        assert.equal(res.json.suites.length, 0);
        assert.equal(res.json.summary.totalTests, 0);
        assert.equal(res.json.summary.failed, 0);
        assert.equal(res.json.summary.passed, 0);
        assert.equal(res.json.summary.durationMs, 0);
        assert.match(res.stderr, /Invalid non-negative integer/);
      } finally {
        cleanup();
      }
    });

    it('11. Absence de fichiers TEST-*.xml', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc11');
      try {
        fs.writeFileSync(path.join(surefireDir, 'other.xml'), '<not-a-test/>');

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        assert.equal(res.json.suites.length, 0);
        assert.equal(res.json.summary.totalSuites, 0);
        assert.equal(res.json.summary.totalTests, 0);
      } finally {
        cleanup();
      }
    });

    it('12. Répertoire Surefire absent', () => {
      const { guardianDir, outputFile, cleanup } = createTestWorkspace('tc12');
      try {
        const nonExistentDir = path.join(masterTmpDir, 'surefire-does-not-exist');

        const res = runCandidateCollector({ surefireDir: nonExistentDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        assert.equal(res.json.suites.length, 0);
        assert.equal(res.json.summary.totalSuites, 0);
      } finally {
        cleanup();
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // B. Quality Guardian (Scénarios 13 à 24)
  // ───────────────────────────────────────────────────────────────────────────
  describe('B. Quality Guardian Diagnostics', () => {
    it('13. JSON valide avec plusieurs findings', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc13');
      try {
        fs.writeFileSync(
          path.join(guardianDir, 'quality-report.json'),
          JSON.stringify({
            scanned_target: 'marketplace',
            finding_count: 2,
            findings: [
              { rule: 'SECRET_ASSIGNMENT', severity: 'WARNING', message: 'Potential secret', file: '.env', line: 10 },
              { rule: 'REQUIRED_FILE', severity: 'ERROR', message: 'Missing file', file: 'pom.xml', line: null }
            ]
          })
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);
        const diag = res.json.diagnostics;
        assert.equal(diag.available, true);
        assert.equal(diag.snapshots.length, 1);
        const snap = diag.latestSnapshot;
        assert.equal(snap.findingCount, 2);
        assert.equal(snap.warningCount, 1);
        assert.equal(snap.errorCount, 1);
        assert.equal(snap.fileMtimeSource, 'filesystem');
        assert.equal(res.json.suites.length, 0);
        assert.equal(res.json.summary.totalTests, 0);
        assert.equal(res.json.summary.failed, 0);
      } finally {
        cleanup();
      }
    });

    it('14. Finding sans rule (doit être ignoré)', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc14');
      try {
        fs.writeFileSync(
          path.join(guardianDir, 'quality-report.json'),
          JSON.stringify({
            findings: [
              { severity: 'WARNING', message: 'No rule', file: 'test.py' },
              { rule: 'VALID_RULE', severity: 'WARNING', message: 'Valid', file: 'ok.py' }
            ]
          })
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        const snap = res.json.diagnostics.latestSnapshot;
        assert.equal(snap.findings.length, 1);
        assert.equal(snap.findings[0].rule, 'VALID_RULE');
      } finally {
        cleanup();
      }
    });

    it('15. Finding sans message (doit être ignoré)', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc15');
      try {
        fs.writeFileSync(
          path.join(guardianDir, 'quality-report.json'),
          JSON.stringify({
            findings: [{ rule: 'RULE_NO_MSG', severity: 'ERROR', file: 'test.py' }]
          })
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        const snap = res.json.diagnostics.latestSnapshot;
        assert.equal(snap.findings.length, 0);
        assert.equal(snap.findingCount, 0);
      } finally {
        cleanup();
      }
    });

    it('16. Finding sans file (doit être ignoré)', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc16');
      try {
        fs.writeFileSync(
          path.join(guardianDir, 'quality-report.json'),
          JSON.stringify({
            findings: [{ rule: 'RULE_NO_FILE', severity: 'ERROR', message: 'Hello' }]
          })
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        const snap = res.json.diagnostics.latestSnapshot;
        assert.equal(snap.findings.length, 0);
      } finally {
        cleanup();
      }
    });

    it('17. Severity inconnue (doit être repliée vers WARNING avec avertissement)', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc17');
      try {
        fs.writeFileSync(
          path.join(guardianDir, 'quality-report.json'),
          JSON.stringify({
            findings: [{ rule: 'RULE_UNKNOWN_SEV', severity: 'CRITICAL', message: 'Critical item', file: 'sec.js' }]
          })
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        const snap = res.json.diagnostics.latestSnapshot;
        assert.equal(snap.findings.length, 1);
        assert.equal(snap.findings[0].severity, 'WARNING', 'Caractérisation : sévérité inconnue repliée sur WARNING');
      } finally {
        cleanup();
      }
    });

    it('18. line absent, numérique ou null', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc18');
      try {
        fs.writeFileSync(
          path.join(guardianDir, 'quality-report.json'),
          JSON.stringify({
            findings: [
              { rule: 'R1', severity: 'WARNING', message: 'line absent', file: 'a.js' },
              { rule: 'R2', severity: 'WARNING', message: 'line null', file: 'b.js', line: null },
              { rule: 'R3', severity: 'WARNING', message: 'line 42', file: 'c.js', line: 42 }
            ]
          })
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        const findings = res.json.diagnostics.latestSnapshot.findings;
        assert.equal(findings[0].line, undefined);
        assert.equal(findings[1].line, null);
        assert.equal(findings[2].line, 42);
      } finally {
        cleanup();
      }
    });

    it('19. JSON syntaxiquement invalide (doit être ignoré sans crash)', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc19');
      try {
        fs.writeFileSync(path.join(guardianDir, 'broken.json'), '{ "findings": [ broken');

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.equal(res.json.diagnostics.available, false);
        assert.match(res.json.diagnostics.unavailableReason, /failed to parse|No JSON/);
      } finally {
        cleanup();
      }
    });

    it('20. JSON valide mais sans clé findings', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc20');
      try {
        fs.writeFileSync(path.join(guardianDir, 'empty-structure.json'), JSON.stringify({ metadata: 'only' }));

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        const snap = res.json.diagnostics.latestSnapshot;
        assert.ok(snap);
        assert.equal(snap.findingCount, 0);
        assert.deepEqual(snap.findings, []);
      } finally {
        cleanup();
      }
    });

    it('21. Fichier JSON invalide parmi plusieurs fichiers valides', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc21');
      try {
        fs.writeFileSync(path.join(guardianDir, 'valid.json'), JSON.stringify({ findings: [] }));
        fs.writeFileSync(path.join(guardianDir, 'corrupt.json'), '{ broken');

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.equal(res.json.diagnostics.available, true);
        assert.equal(res.json.diagnostics.snapshots.length, 1);
        assert.equal(res.json.diagnostics.snapshots[0].sourceFile, 'valid.json');
      } finally {
        cleanup();
      }
    });

    it('22. Répertoire Guardian absent', () => {
      const { surefireDir, outputFile, cleanup } = createTestWorkspace('tc22');
      try {
        const nonExistentDir = path.join(masterTmpDir, 'guardian-does-not-exist');

        const res = runCandidateCollector({ surefireDir, guardianDir: nonExistentDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.equal(res.json.diagnostics.available, false);
        assert.match(res.json.diagnostics.unavailableReason, /not found/i);
      } finally {
        cleanup();
      }
    });

    it('23. Répertoire Guardian vide', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc23');
      try {
        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.equal(res.json.diagnostics.available, false);
        assert.match(res.json.diagnostics.unavailableReason, /No JSON files found/i);
      } finally {
        cleanup();
      }
    });

    it('24. Tous les fichiers JSON invalides', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc24');
      try {
        fs.writeFileSync(path.join(guardianDir, 'corrupt1.json'), '{ broken 1');
        fs.writeFileSync(path.join(guardianDir, 'corrupt2.json'), '{ broken 2');

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.equal(res.json.diagnostics.available, false);
        assert.match(res.json.diagnostics.unavailableReason, /failed to parse/i);
      } finally {
        cleanup();
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // C. Historique des Snapshots (Scénarios 25 à 28)
  // ───────────────────────────────────────────────────────────────────────────
  describe('C. Historique des Snapshots', () => {
    it('25. Plusieurs rapports avec des mtimes différents', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc25');
      try {
        const fileOld = path.join(guardianDir, 'report-old.json');
        const fileNew = path.join(guardianDir, 'report-new.json');

        fs.writeFileSync(fileOld, JSON.stringify({ findings: [] }));
        fs.writeFileSync(fileNew, JSON.stringify({ findings: [] }));

        const timeOld = new Date('2026-10-01T10:00:00Z');
        const timeNew = new Date('2026-10-02T10:00:00Z');
        fs.utimesSync(fileOld, timeOld, timeOld);
        fs.utimesSync(fileNew, timeNew, timeNew);

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        const diag = res.json.diagnostics;
        assert.equal(diag.snapshots.length, 2);
        assert.equal(diag.snapshots[0].sourceFile, 'report-old.json');
        assert.equal(diag.snapshots[1].sourceFile, 'report-new.json');
        assert.equal(diag.latestSnapshot.sourceFile, 'report-new.json');
      } finally {
        cleanup();
      }
    });

    it('26. Nom contenant "final" mais dont le mtime est plus ancien', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc26');
      try {
        const fileFinal = path.join(guardianDir, 'quality-report-final.json');
        const fileActual = path.join(guardianDir, 'quality-report.json');

        fs.writeFileSync(fileFinal, JSON.stringify({ findings: [] }));
        fs.writeFileSync(fileActual, JSON.stringify({ findings: [] }));

        const timeFinal = new Date('2026-10-24T10:00:00Z');
        const timeActual = new Date('2026-10-30T10:00:00Z');
        fs.utimesSync(fileFinal, timeFinal, timeFinal);
        fs.utimesSync(fileActual, timeActual, timeActual);

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.equal(res.json.diagnostics.latestSnapshot.sourceFile, 'quality-report.json');
      } finally {
        cleanup();
      }
    });

    it('27. Caractérisation de deux rapports ayant exactement le même mtime', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc27');
      try {
        const fileA = path.join(guardianDir, 'report-a.json');
        const fileB = path.join(guardianDir, 'report-b.json');

        fs.writeFileSync(fileA, JSON.stringify({ findings: [] }));
        fs.writeFileSync(fileB, JSON.stringify({ findings: [] }));

        const sameTime = new Date('2026-10-25T12:00:00Z');
        fs.utimesSync(fileA, sameTime, sameTime);
        fs.utimesSync(fileB, sameTime, sameTime);

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        const diag = res.json.diagnostics;

        // 1. Les deux snapshots doivent être collectés
        assert.equal(diag.snapshots.length, 2);
        const sourceFiles = diag.snapshots.map(s => s.sourceFile);
        assert.ok(sourceFiles.includes('report-a.json'), 'report-a.json doit être présent dans snapshots');
        assert.ok(sourceFiles.includes('report-b.json'), 'report-b.json doit être présent dans snapshots');

        // 2. Les deux snapshots ont strictement le même mtime ISO
        assert.equal(diag.snapshots[0].fileMtimeISO, diag.snapshots[1].fileMtimeISO);

        // 3. Caractérisation du comportement sans présumer d'un ordre alphabétique :
        // Le collecteur effectue : snapshots.sort((a, b) => a.fileMtimeISO < b.fileMtimeISO ? -1 : a.fileMtimeISO > b.fileMtimeISO ? 1 : 0)
        // En cas d'égalité stricte de mtime, le comparateur retourne 0.
        // L'ordre final dépend donc de la stabilité du tri et de l'ordre d'énumération du système de fichiers (non garanti).
        // Le collecteur sélectionne systématiquement snapshots[snapshots.length - 1] comme latestSnapshot.
        assert.equal(diag.latestSnapshotIndex, 1, 'latestSnapshotIndex pointe sur le dernier élément du tableau');
        assert.equal(
          diag.latestSnapshot.sourceFile,
          diag.snapshots[1].sourceFile,
          'latestSnapshot correspond au dernier élément du tableau après tri'
        );
      } finally {
        cleanup();
      }
    });

    it('28. Un rapport invalide parmi plusieurs rapports valides', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc28');
      try {
        const f1 = path.join(guardianDir, 'r1.json');
        const fBad = path.join(guardianDir, 'rBad.json');
        const f2 = path.join(guardianDir, 'r2.json');

        fs.writeFileSync(f1, JSON.stringify({ findings: [] }));
        fs.writeFileSync(fBad, 'broken json');
        fs.writeFileSync(f2, JSON.stringify({ findings: [] }));

        const t1 = new Date('2026-10-01T10:00:00Z');
        const t2 = new Date('2026-10-02T10:00:00Z');
        fs.utimesSync(f1, t1, t1);
        fs.utimesSync(f2, t2, t2);

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.equal(res.json.diagnostics.snapshots.length, 2);
        assert.equal(res.json.diagnostics.latestSnapshot.sourceFile, 'r2.json');
      } finally {
        cleanup();
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // D. Séparation des Responsabilités (Scénarios 29 à 32)
  // ───────────────────────────────────────────────────────────────────────────
  describe('D. Séparation des Responsabilités', () => {
    it('29. Un finding Guardian ne modifie jamais summary.totalTests', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc29');
      try {
        fs.writeFileSync(
          path.join(surefireDir, 'TEST-Surefire.xml'),
          `<testsuite name="com.example.T1" tests="3" failures="0" errors="0" skipped="0" time="1.0">
            <testcase name="t1" classname="com.example.T1" time="0.3"/>
            <testcase name="t2" classname="com.example.T1" time="0.3"/>
            <testcase name="t3" classname="com.example.T1" time="0.4"/>
          </testsuite>`
        );
        fs.writeFileSync(
          path.join(guardianDir, 'quality-report.json'),
          JSON.stringify({
            findings: [
              { rule: 'SEC1', severity: 'WARNING', message: 'Warning 1', file: '.env' },
              { rule: 'SEC2', severity: 'ERROR', message: 'Error 1', file: 'app.properties' }
            ]
          })
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.equal(res.json.summary.totalTests, 3);
        assert.equal(res.json.summary.passed, 3);
        assert.equal(res.json.summary.failed, 0);
        assert.equal(res.json.diagnostics.latestSnapshot.findingCount, 2);
      } finally {
        cleanup();
      }
    });

    it('30. Absence de source d\'exécution CI réelle : executions[] est vide et aucune suite github-actions n\'est créée', () => {
      const { ws, surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc30');
      try {
        // Déposer un fichier workflow YAML dans un sous-dossier .github/workflows
        const workflowsDir = path.join(ws, '.github', 'workflows');
        fs.mkdirSync(workflowsDir, { recursive: true });
        const yamlContent = `
name: Frontend CI Pipeline
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Run Test
        run: npm run test
`;
        fs.writeFileSync(path.join(workflowsDir, 'frontend-ci.yml'), yamlContent);

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(res.json);

        // Limitation explicitement documentée :
        // Le collecteur candidat ne contient aucune logique de découverte ni de parsing de fichiers YAML.
        // Sa fonction collectExecutions() renvoie inconditionnellement [] en consignant :
        // "Workflow YAML files are not considered proof of execution."
        // Le test vérifie que le collecteur n'injecte aucune suite factice dans suites[] ni dans executions[].
        const workflowSuites = res.json.suites.filter(s => s.source === 'github-actions');
        assert.equal(workflowSuites.length, 0, 'suites[] ne doit contenir aucune suite de type github-actions');
        assert.deepEqual(res.json.executions, [], 'executions[] doit rester strictement un tableau vide');
        assert.equal(res.json.summary.totalSuites, 0, 'summary.totalSuites ne doit pas compter les workflows déclaratifs');
      } finally {
        cleanup();
      }
    });

    it('31. executions reste vide en l\'absence de preuve réelle', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc31');
      try {
        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.deepEqual(res.json.executions, []);
      } finally {
        cleanup();
      }
    });

    it('32. Seules les suites Java/Surefire contribuent au résumé', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc32');
      try {
        fs.writeFileSync(
          path.join(surefireDir, 'TEST-Surefire.xml'),
          `<testsuite name="com.example.T1" tests="1" failures="0" errors="0" skipped="0" time="0.1">
            <testcase name="t1" classname="com.example.T1" time="0.1"/>
          </testsuite>`
        );
        fs.writeFileSync(
          path.join(guardianDir, 'quality-report.json'),
          JSON.stringify({ findings: [{ rule: 'F', severity: 'ERROR', message: 'Err', file: 'f.js' }] })
        );

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.equal(res.json.summary.totalSuites, 1);
        assert.equal(res.json.suites.every(s => s.source === 'java'), true);
      } finally {
        cleanup();
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // E. Protection des Fichiers et Écriture Atomique (Scénarios 33 à 37)
  // ───────────────────────────────────────────────────────────────────────────
  describe('E. Protection des Fichiers', () => {
    it('33. Le rapport live existe, son empreinte est non nulle et strictement identique à l\'initiale', () => {
      assert.ok(fs.existsSync(PROTECTED_FILES.liveReport), 'Le rapport live public/data/testops-report.json doit exister');
      const currentLiveHash = getFileHash(PROTECTED_FILES.liveReport);
      assert.notEqual(currentLiveHash, null, 'L\'empreinte SHA-256 du rapport live ne doit pas être nulle');
      assert.equal(
        currentLiveHash,
        initialProtectedHashes.liveReport,
        'L\'empreinte SHA-256 de public/data/testops-report.json doit être identique avant et après'
      );
    });

    it('34. Les cinq fichiers protégés existent, leurs empreintes sont non nulles et inchangées', () => {
      for (const [key, filePath] of Object.entries(PROTECTED_FILES)) {
        assert.ok(fs.existsSync(filePath), `Le fichier protégé ${key} (${filePath}) doit exister`);
        const currentHash = getFileHash(filePath);
        assert.notEqual(currentHash, null, `L'empreinte de ${key} ne doit pas être nulle`);
        assert.equal(
          currentHash,
          initialProtectedHashes[key],
          `L'empreinte SHA-256 de ${path.basename(filePath)} (${key}) doit rester strictement inchangée`
        );
      }
    });

    it('35. Intégrité des répertoires sources après exécution réussie', () => {
      const { surefireDir, guardianDir, outputFile, cleanup } = createTestWorkspace('tc35');
      try {
        const xmlFile = path.join(surefireDir, 'TEST-A.xml');
        fs.writeFileSync(xmlFile, '<testsuite name="A" tests="1"><testcase name="a"/></testsuite>');
        const jsonFile = path.join(guardianDir, 'quality-report.json');
        fs.writeFileSync(jsonFile, JSON.stringify({ findings: [] }));

        // Capture de l'arborescence et des empreintes de tous les fichiers sources
        const surefireBefore = scanDirSignatures(surefireDir);
        const guardianBefore = scanDirSignatures(guardianDir);

        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });

        // Vérification préalable que la collecte a fonctionné et a généré le fichier cible
        assert.equal(res.exitCode, 0, 'La collecte doit réussir avec exitCode 0');
        assert.ok(fs.existsSync(outputFile), 'Le fichier de rapport JSON de sortie doit exister');

        const surefireAfter = scanDirSignatures(surefireDir);
        const guardianAfter = scanDirSignatures(guardianDir);

        assert.deepEqual(surefireAfter, surefireBefore, 'Le répertoire Surefire ne doit subir aucune altération');
        assert.deepEqual(guardianAfter, guardianBefore, 'Le répertoire Guardian ne doit subir aucune altération');
      } finally {
        cleanup();
      }
    });

    it('36. Le collecteur écrit uniquement dans le chemin --output temporaire', () => {
      const { surefireDir, guardianDir, outputDir, outputFile, cleanup } = createTestWorkspace('tc36');
      try {
        const res = runCandidateCollector({ surefireDir, guardianDir, outputFile });
        assert.equal(res.exitCode, 0);
        assert.ok(fs.existsSync(outputFile));
        const filesInOutputDir = fs.readdirSync(outputDir);
        assert.deepEqual(filesInOutputDir, [path.basename(outputFile)]);
      } finally {
        cleanup();
      }
    });

    it('37. Comportement en cas d\'échec de renommage atomique : sortie en erreur et nettoyage du fichier temporaire', () => {
      const { surefireDir, guardianDir, ws, cleanup } = createTestWorkspace('tc37');
      try {
        // Sous Windows, tenter de renommer un fichier vers le chemin d'un répertoire existant déclenche un échec de renommage
        const outputConflictDir = path.join(ws, 'conflict-output-target');
        fs.mkdirSync(outputConflictDir, { recursive: true });

        const res = runCandidateCollector({
          surefireDir,
          guardianDir,
          outputFile: outputConflictDir,
        });

        // 1. Le collecteur doit échouer avec code d'erreur 1
        assert.equal(res.exitCode, 1, 'Le collecteur doit retourner le code 1 lors d\'un échec de renommage');
        assert.match(res.stderr, /Failed to write output/, 'stderr doit expliciter l\'échec de writeJsonAtomic');

        // 2. Vérification de l'absence de résidu .testops-report-tmp-* dans le répertoire parent
        const parentDir = path.dirname(outputConflictDir);
        const residualTmpFiles = fs.readdirSync(parentDir).filter(f => f.startsWith('.testops-report-tmp-'));
        assert.deepEqual(
          residualTmpFiles,
          [],
          'Aucun fichier temporaire .testops-report-tmp-* ne doit subsister après un échec'
        );

        // Limitation documentée :
        // Ce test démontre que le bloc catch de writeJsonAtomic exécute fs.unlinkSync(tmpFile) lorsque fs.renameSync
        // échoue sur une collision avec un répertoire. Il ne démontre pas l'atomicité matérielle face à une panne de courant
        // ou un crash brutal du processus système (SIGKILL).
      } finally {
        cleanup();
      }
    });
  });
});
