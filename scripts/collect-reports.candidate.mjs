/**
 * collect-reports.candidate.mjs
 *
 * Marketplace TestOps Collector — Schema v2.0.0
 *
 * SEPARATION OF CONCERNS
 * ──────────────────────
 * suites[]      → Real test executions only (Maven Surefire / JUnit XML)
 * diagnostics   → Quality Guardian static-analysis snapshots (NOT tests)
 * executions[]  → Proven CI/CD runs only (empty until real proof is available)
 * summary       → Computed exclusively from suites[] (Java source only)
 *
 * INVARIANTS
 * ──────────
 * • A QG finding is NEVER converted into a test case or a failed test.
 * • A YAML workflow file is NEVER converted into a passed CI execution.
 * • No duration is invented: durationMs comes from XML only.
 * • The latest snapshot is determined by filesystem mtime, never by filename.
 * • Missing/inaccessible sources are represented explicitly, never silently
 *   replaced by invented data.
 * • The output file is written atomically via a temp file + rename.
 *
 * SAFE TO RUN
 * ───────────
 * By default this script writes to a *candidate* output path, not to the
 * live public/data/testops-report.json. Use --output to override.
 *
 * Usage:
 *   node scripts/collect-reports.candidate.mjs
 *   node scripts/collect-reports.candidate.mjs --output public/data/testops-report.json
 *   node scripts/collect-reports.candidate.mjs --surefire /custom/path --guardian /custom/path
 */

// ─────────────────────────────────────────────────────────────────────────────
// Imports — all explicit, no implicit globals
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// ESM __dirname equivalent
// ─────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Path resolution
//
// Layout on disk:
//   6in1/
//   ├── marketplace/                ← sibling repo (Surefire + Guardian sources)
//   │   ├── target/surefire-reports/
//   │   └── ai-lab/month-01-quality-guardian/reports/
//   └── marketplace-testops/
//       └── frontend/               ← this script lives here
//           └── scripts/collect-reports.candidate.mjs
// ─────────────────────────────────────────────────────────────────────────────

const FRONTEND_ROOT    = path.resolve(__dirname, '..');
const TESTOPS_ROOT     = path.resolve(FRONTEND_ROOT, '..');
const WORKSPACE_ROOT   = path.resolve(TESTOPS_ROOT, '..');
const MARKETPLACE_ROOT = path.resolve(WORKSPACE_ROOT, 'marketplace');

// Default source paths — overridable via CLI args
const DEFAULT_SUREFIRE_DIR  = path.resolve(MARKETPLACE_ROOT, 'target', 'surefire-reports');
const DEFAULT_GUARDIAN_DIR  = path.resolve(MARKETPLACE_ROOT, 'ai-lab', 'month-01-quality-guardian', 'reports');

// Default output path: candidate file, NOT the live report
const DEFAULT_OUTPUT_FILE   = path.resolve(FRONTEND_ROOT, 'public', 'data', 'testops-report.candidate.json');

// ─────────────────────────────────────────────────────────────────────────────
// CLI argument parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse simple --key value flags from process.argv.
 * @returns {Record<string, string>}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      result[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source availability classification
//
// 'available'    → directory exists and is readable
// 'missing'      → path does not exist (expected in CI without local build)
// 'inaccessible' → path exists but cannot be read (permissions or sandbox)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} dirPath
 * @returns {'available'|'missing'|'inaccessible'}
 */
function classifyDirectory(dirPath) {
  try {
    fs.accessSync(dirPath, fs.constants.R_OK);
    return 'available';
  } catch (err) {
    if (err.code === 'ENOENT') return 'missing';
    return 'inaccessible'; // EACCES or other
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Git metadata
// ─────────────────────────────────────────────────────────────────────────────

const GIT_UNKNOWN = {
  commitSha:     'unknown',
  author:        'unknown',
  commitDate:    'unknown',
  commitMessage: 'unknown',
};

/**
 * Attempt to read git metadata from a repository root.
 * Returns GIT_UNKNOWN on any failure — never throws.
 *
 * @param {string} repoPath
 * @returns {{ commitSha: string, author: string, commitDate: string, commitMessage: string }}
 */
function readGitMetadata(repoPath) {
  try {
    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) {
      console.log(`[INFO] No .git directory found at ${repoPath}. Git metadata unavailable.`);
      return GIT_UNKNOWN;
    }

    const raw = execSync('git log -1 --format=%h|%an|%ci|%s', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();

    if (!raw) return GIT_UNKNOWN;

    // format: hash|author|date|subject
    // Subject may itself contain | so we split only the first 3 pipes
    const idx1 = raw.indexOf('|');
    const idx2 = raw.indexOf('|', idx1 + 1);
    const idx3 = raw.indexOf('|', idx2 + 1);

    if (idx1 < 0 || idx2 < 0 || idx3 < 0) return GIT_UNKNOWN;

    return {
      commitSha:     raw.slice(0, idx1).trim(),
      author:        raw.slice(idx1 + 1, idx2).trim(),
      commitDate:    raw.slice(idx2 + 1, idx3).trim(),
      commitMessage: raw.slice(idx3 + 1).trim(),
    };
  } catch {
    console.log('[INFO] git log failed. Git metadata will be reported as unknown.');
    return GIT_UNKNOWN;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Surefire XML parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the value of a named XML attribute from a partial element string.
 * e.g. parseXmlAttribute('name="Foo" time="1.23"', 'time') → '1.23'
 *
 * @param {string} elementStr
 * @param {string} attrName
 * @returns {string|null}
 */
function parseXmlAttribute(elementStr, attrName) {
  // Escapes attrName so it is safe inside a RegExp
  const escaped = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*=\\s*["']([^"']*)["']`, 'i');
  const m = elementStr.match(re);
  return m ? m[1] : null;
}

/**
 * Parse a single Maven Surefire XML file into a TestSuite object.
 *
 * Rules:
 * - durationMs comes from the XML `time` attribute only. Never invented.
 * - executedAt comes from filesystem mtime — noted in provenance.
 * - Only `source: 'java'` is emitted — never 'python' or 'github-actions'.
 * - testsCount invariant is validated; mismatch produces a warning.
 *
 * @param {string} filePath  Absolute path to the XML file
 * @returns {object|null}    TestSuite or null on unrecoverable parse error
 */
function parseSurefireXml(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.warn(`[WARN] Cannot read Surefire file ${filePath}: ${err.message}`);
    return null;
  }

  try {
    const suiteMatch = content.match(/<testsuite\b([^>]*)>/i);
    if (!suiteMatch) {
      console.warn(`[WARN] No <testsuite> element found in ${path.basename(filePath)} ? skipped.`);
      return null;
    }

    const suiteAttrs = suiteMatch[1];
    const name = parseXmlAttribute(suiteAttrs, 'name') || path.basename(filePath, '.xml');

    const parseCount = (attribute) => {
      const raw = parseXmlAttribute(suiteAttrs, attribute) ?? '0';
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
        throw new Error(`Invalid non-negative integer "${raw}" for ${attribute}`);
      }
      return Number(raw);
    };

    const parseDuration = (raw, label) => {
      if (raw === null || raw === undefined || raw === '') raw = '0';
      if (!/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) {
        throw new Error(`Invalid non-negative duration "${raw}" for ${label}`);
      }
      return Number(raw);
    };

    const tests = parseCount('tests');
    const failures = parseCount('failures');
    const errors = parseCount('errors');
    const skipped = parseCount('skipped');
    const timeSec = parseDuration(parseXmlAttribute(suiteAttrs, 'time'), 'suite time');

    if (failures + errors + skipped > tests) {
      throw new Error(`Inconsistent counts: failures + errors + skipped exceed tests (${tests})`);
    }

    const passed = tests - failures - errors - skipped;
    const testCases = [];
    const tcRegex = /<testcase\b([^>]*?)(\/>([\s\S]*?)|>([\s\S]*?)<\/testcase>)/gi;
    let m;

    while ((m = tcRegex.exec(content)) !== null) {
      const tcAttrs = m[1];
      const tcBody = m[4] || '';
      const tcName = parseXmlAttribute(tcAttrs, 'name') || 'Unnamed Test';
      const tcClass = parseXmlAttribute(tcAttrs, 'classname') || name;
      const tcTime = parseDuration(parseXmlAttribute(tcAttrs, 'time'), `testcase ${tcName} time`);

      let tcStatus = 'passed';
      let tcErrorMessage;
      let tcStackTrace;

      const failureM = tcBody.match(/<failure\b([^>]*)>([\s\S]*?)<\/failure>/i);
      const errorM = tcBody.match(/<error\b([^>]*)>([\s\S]*?)<\/error>/i);
      const skippedM = tcBody.match(/<skipped\b([^>]*?)(\/>([\s\S]*?)|>([\s\S]*?)<\/skipped>)/i);

      if (failureM) {
        tcStatus = 'failed';
        tcErrorMessage = parseXmlAttribute(failureM[1], 'message') || 'Assertion failed';
        tcStackTrace = failureM[2]?.trim() || undefined;
      } else if (errorM) {
        tcStatus = 'error';
        tcErrorMessage = parseXmlAttribute(errorM[1], 'message') || 'Execution error';
        tcStackTrace = errorM[2]?.trim() || undefined;
      } else if (skippedM) {
        tcStatus = 'skipped';
        tcErrorMessage = parseXmlAttribute(skippedM[1], 'message') || 'Test skipped';
      }

      const tc = {
        id: `${tcClass}#${tcName}`,
        name: tcName,
        className: tcClass,
        status: tcStatus,
        durationMs: Math.round(tcTime * 1000),
      };
      if (tcErrorMessage !== undefined) tc.errorMessage = tcErrorMessage;
      if (tcStackTrace !== undefined) tc.stackTrace = tcStackTrace;
      testCases.push(tc);
    }

    const overallStatus =
      failures > 0 || errors > 0 ? 'failed' :
      tests === 0 ? 'unknown' :
      skipped === tests ? 'skipped' :
      'passed';

    const fileStat = fs.statSync(filePath);
    return {
      id: `surefire-${path.basename(filePath, '.xml')}`,
      source: 'java',
      suiteName: name,
      status: overallStatus,
      executedAt: fileStat.mtime.toISOString(),
      durationMs: Math.round(timeSec * 1000),
      testsCount: tests,
      passedCount: passed,
      failedCount: failures,
      errorCount: errors,
      skippedCount: skipped,
      testCases,
      provenance: `Surefire XML: ${path.basename(filePath)}`,
    };
  } catch (err) {
    console.warn(`[WARN] Failed to parse ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}
/**
 * Collect all Surefire TEST-*.xml files from a directory.
 *
 * @param {string} surefireDir
 * @returns {{ suites: object[], status: 'available'|'missing'|'inaccessible', message: string }}
 */
function collectSurefireReports(surefireDir) {
  const availability = classifyDirectory(surefireDir);

  if (availability === 'missing') {
    const msg = `Surefire reports directory not found: ${surefireDir}. Run 'mvn test' first.`;
    console.log(`[INFO] ${msg}`);
    return { suites: [], status: 'missing', message: msg };
  }

  if (availability === 'inaccessible') {
    const msg = `Surefire reports directory is not readable (permission denied): ${surefireDir}.`;
    console.warn(`[WARN] ${msg}`);
    return { suites: [], status: 'inaccessible', message: msg };
  }

  let xmlFiles;
  try {
    xmlFiles = fs.readdirSync(surefireDir)
      .filter(f => f.startsWith('TEST-') && f.endsWith('.xml'));
  } catch (err) {
    const msg = `Failed to list Surefire directory: ${err.message}`;
    console.warn(`[WARN] ${msg}`);
    return { suites: [], status: 'inaccessible', message: msg };
  }

  if (xmlFiles.length === 0) {
    const msg = `No TEST-*.xml files found in ${surefireDir}.`;
    console.log(`[INFO] ${msg}`);
    return { suites: [], status: 'available', message: msg };
  }

  console.log(`[INFO] Found ${xmlFiles.length} Surefire XML file(s) in ${surefireDir}.`);

  const suites = [];
  for (const xmlFile of xmlFiles) {
    const suite = parseSurefireXml(path.join(surefireDir, xmlFile));
    if (suite) {
      suites.push(suite);
      console.log(
        `  ✓ ${suite.suiteName}: ${suite.testsCount} test(s), ` +
        `${suite.passedCount} passed, ${suite.failedCount} failed, ` +
        `${suite.errorCount} error(s), status=${suite.status}`
      );
    }
  }

  return {
    suites,
    status: 'available',
    message: `${suites.length} suite(s) collected from Surefire reports.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Quality Guardian snapshot parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate and normalize a raw finding object from a QG JSON report.
 * Returns null if the finding is too malformed to be useful.
 *
 * Rules:
 * - severity is constrained to 'INFO'|'WARNING'|'ERROR'
 * - line may be null (file-level findings) — preserved as-is
 * - No 'status' field — findings are not tests
 *
 * @param {unknown} raw
 * @returns {object|null}  DiagnosticFinding or null
 */
function normalizeFinding(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const rule     = typeof raw.rule     === 'string' ? raw.rule.trim()    : null;
  const message  = typeof raw.message  === 'string' ? raw.message.trim() : null;
  const file     = typeof raw.file     === 'string' ? raw.file.trim()    : null;

  // Require at minimum rule + message + file
  if (!rule || !message || !file) {
    console.warn('[WARN] QG finding missing required fields (rule/message/file) — skipped.');
    return null;
  }

  const VALID_SEVERITIES = ['INFO', 'WARNING', 'ERROR'];
  const severity =
    typeof raw.severity === 'string' && VALID_SEVERITIES.includes(raw.severity.toUpperCase())
      ? raw.severity.toUpperCase()
      : 'WARNING'; // conservative default if missing or unrecognized

  if (typeof raw.severity === 'string' && !VALID_SEVERITIES.includes(raw.severity.toUpperCase())) {
    console.warn(`[WARN] Unknown severity "${raw.severity}" in finding ${rule} — defaulted to WARNING.`);
  }

  // line: number | null | undefined → number | undefined (null preserved for file-level findings)
  let line;
  if (raw.line === null) {
    line = null;
  } else if (typeof raw.line === 'number' && Number.isFinite(raw.line)) {
    line = raw.line;
  }
  // else undefined (field absent)

  const finding = { rule, severity, message, file };
  if (line !== undefined) finding.line = line;

  return finding;
}

/**
 * Parse a single Quality Guardian JSON file into a DiagnosticSnapshot.
 *
 * Rules:
 * - fileMtimeISO always comes from fs.stat.mtime
 * - fileMtimeSource is always 'filesystem' — never implies scan execution time
 * - findings are DiagnosticFinding objects, not TestCase objects
 * - No durationMs — never invented
 *
 * @param {string} filePath  Absolute path to the JSON file
 * @returns {object|null}    DiagnosticSnapshot or null on failure
 */
function parseGuardianSnapshot(filePath) {
  const fileName = path.basename(filePath);

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.warn(`[WARN] Cannot read QG report ${fileName}: ${err.message} — skipped.`);
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[WARN] Invalid JSON in QG report ${fileName}: ${err.message} — skipped.`);
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    console.warn(`[WARN] QG report ${fileName} is not a JSON object — skipped.`);
    return null;
  }

  // Get filesystem mtime — the only reliable date we have
  let fileStat;
  try {
    fileStat = fs.statSync(filePath);
  } catch (err) {
    console.warn(`[WARN] Cannot stat QG report ${fileName}: ${err.message} — skipped.`);
    return null;
  }

  const fileMtimeISO = fileStat.mtime.toISOString();

  // Parse findings array
  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings = rawFindings
    .map(f => normalizeFinding(f))
    .filter(f => f !== null);

  if (rawFindings.length > 0 && findings.length < rawFindings.length) {
    console.warn(
      `[WARN] ${fileName}: ${rawFindings.length - findings.length} finding(s) ` +
      `skipped due to missing required fields.`
    );
  }

  // Count by severity
  const findingCount  = findings.length;
  const errorCount    = findings.filter(f => f.severity === 'ERROR').length;
  const warningCount  = findings.filter(f => f.severity === 'WARNING').length;
  const infoCount     = findings.filter(f => f.severity === 'INFO').length;

  // Extract optional metadata from the report itself
  const snapshot = {
    id:              `qg-${fileName}`,
    sourceFile:      fileName,
    findings,
    findingCount,
    errorCount,
    warningCount,
    infoCount,
    fileMtimeISO,
    fileMtimeSource: 'filesystem',
    provenance:      `Quality Guardian JSON: ${fileName}`,
  };

  // Optional fields — only included if present in the source JSON
  if (typeof parsed.scanned_target === 'string') {
    snapshot.scannedTarget = parsed.scanned_target;
  }
  if (typeof parsed.generated_at === 'string') {
    snapshot.reportGeneratedAt = parsed.generated_at;
  }

  return snapshot;
}

/**
 * Collect all QG JSON reports from a directory and return a QualityDiagnostic.
 *
 * Rules:
 * - All JSON files are parsed individually — one failure does not abort others
 * - Snapshots are sorted by fileMtimeISO ascending (oldest first)
 * - latestSnapshotIndex = index of max(fileMtimeISO) — never by filename
 * - latestSnapshot = snapshots[latestSnapshotIndex] ?? null
 *
 * @param {string} guardianDir
 * @returns {object}  QualityDiagnostic
 */
function collectGuardianDiagnostics(guardianDir) {
  const availability = classifyDirectory(guardianDir);

  if (availability === 'missing') {
    const reason = `Quality Guardian reports directory not found: ${guardianDir}.`;
    console.log(`[INFO] ${reason}`);
    return {
      available:          false,
      unavailableReason:  reason,
      snapshots:          [],
      latestSnapshotIndex: -1,
      latestSnapshot:     null,
    };
  }

  if (availability === 'inaccessible') {
    const reason = `Quality Guardian reports directory is not readable (permission denied): ${guardianDir}.`;
    console.warn(`[WARN] ${reason}`);
    return {
      available:          false,
      unavailableReason:  reason,
      snapshots:          [],
      latestSnapshotIndex: -1,
      latestSnapshot:     null,
    };
  }

  let jsonFiles;
  try {
    jsonFiles = fs.readdirSync(guardianDir).filter(f => f.endsWith('.json'));
  } catch (err) {
    const reason = `Failed to list Quality Guardian directory: ${err.message}`;
    console.warn(`[WARN] ${reason}`);
    return {
      available:          false,
      unavailableReason:  reason,
      snapshots:          [],
      latestSnapshotIndex: -1,
      latestSnapshot:     null,
    };
  }

  if (jsonFiles.length === 0) {
    const reason = `No JSON files found in Quality Guardian reports directory: ${guardianDir}.`;
    console.log(`[INFO] ${reason}`);
    return {
      available:          false,
      unavailableReason:  reason,
      snapshots:          [],
      latestSnapshotIndex: -1,
      latestSnapshot:     null,
    };
  }

  console.log(`[INFO] Found ${jsonFiles.length} JSON file(s) in Guardian reports directory.`);

  const snapshots = [];
  for (const jsonFile of jsonFiles) {
    const snapshot = parseGuardianSnapshot(path.join(guardianDir, jsonFile));
    if (snapshot) {
      snapshots.push(snapshot);
      console.log(
        `  ✓ ${snapshot.sourceFile}: ${snapshot.findingCount} finding(s) ` +
        `(${snapshot.warningCount} warning(s), ${snapshot.errorCount} error(s)), ` +
        `mtime=${snapshot.fileMtimeISO}`
      );
    }
  }

  if (snapshots.length === 0) {
    const reason = 'All Quality Guardian JSON files failed to parse. Check [WARN] messages above.';
    console.warn(`[WARN] ${reason}`);
    return {
      available:          false,
      unavailableReason:  reason,
      snapshots:          [],
      latestSnapshotIndex: -1,
      latestSnapshot:     null,
    };
  }

  // Sort ascending by fileMtimeISO (ISO strings compare lexicographically)
  snapshots.sort((a, b) => (a.fileMtimeISO < b.fileMtimeISO ? -1 : a.fileMtimeISO > b.fileMtimeISO ? 1 : 0));

  // Latest = last after sort (max mtime) — NEVER determined by filename
  const latestSnapshotIndex = snapshots.length - 1;
  const latestSnapshot = snapshots[latestSnapshotIndex];

  console.log(
    `[INFO] Latest QG snapshot: "${latestSnapshot.sourceFile}" ` +
    `(mtime ${latestSnapshot.fileMtimeISO}), ` +
    `${latestSnapshot.findingCount} finding(s).`
  );

  return {
    available:          true,
    snapshots,
    latestSnapshotIndex,
    latestSnapshot,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CI/CD executions
//
// No real proof source is implemented locally.
// The function returns [] unconditionally until a real source is wired up.
// YAML files are deliberately NOT inspected.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collect proven CI/CD executions.
 *
 * Currently: no local proof source available → always returns [].
 * Future sources: GitHub Actions API, downloaded artifacts, CI result files.
 *
 * @returns {object[]}  WorkflowExecution[]
 */
function collectExecutions() {
  console.log(
    '[INFO] No CI/CD execution proof source configured. ' +
    'executions[] will be empty. ' +
    'Workflow YAML files are not considered proof of execution.'
  );
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute TestSummary from real test suites only.
 *
 * Rules:
 * - Only suites with source === 'java' are counted (extensible later)
 * - QG findings and CI executions NEVER contribute to any metric
 * - successRate is 0 when totalTests === 0 (never NaN, never null)
 * - durationMs comes from XML attributes only
 *
 * @param {object[]} suites  Array of TestSuite (all source === 'java')
 * @returns {object}  TestSummary
 */
function computeSummary(suites) {
  // Guard: suites should already be Java-only, but double-check to be safe
  const javaSuites = suites.filter(s => s.source === 'java');
  if (javaSuites.length !== suites.length) {
    console.warn(
      '[WARN] computeSummary received non-java suites — they will be excluded from summary.'
    );
  }

  const totalSuites  = javaSuites.length;
  const totalTests   = javaSuites.reduce((acc, s) => acc + s.testsCount,   0);
  const passed       = javaSuites.reduce((acc, s) => acc + s.passedCount,  0);
  const failed       = javaSuites.reduce((acc, s) => acc + s.failedCount,  0);
  const errors       = javaSuites.reduce((acc, s) => acc + s.errorCount,   0);
  const skipped      = javaSuites.reduce((acc, s) => acc + s.skippedCount, 0);
  const durationMs   = javaSuites.reduce((acc, s) => acc + s.durationMs,   0);
  const successRate  = totalTests > 0
    ? parseFloat(((passed / totalTests) * 100).toFixed(1))
    : 0;

  return { totalSuites, totalTests, passed, failed, errors, skipped, successRate, durationMs };
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate the final payload before writing.
 * Throws a descriptive Error if any invariant is violated.
 *
 * @param {object} payload
 */
function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload is not an object.');
  }
  if (payload.schemaVersion !== '2.0.0') {
    throw new Error(`Expected schemaVersion "2.0.0", got "${payload.schemaVersion}".`);
  }
  if (!Array.isArray(payload.suites)) {
    throw new Error('payload.suites must be an array.');
  }

  // All suites must be real tests (java source)
  for (const suite of payload.suites) {
    if (suite.source !== 'java') {
      throw new Error(
        `Suite "${suite.id}" has source="${suite.source}". ` +
        'Only source="java" is allowed in suites[]. ' +
        'QG and CI data must go into diagnostics and executions respectively.'
      );
    }
    // Verify testsCount consistency (warn but don't throw — XML is authoritative)
    const computed = suite.passedCount + suite.failedCount + suite.errorCount + suite.skippedCount;
    if (suite.testsCount !== computed) {
      console.warn(
        `[WARN] Suite "${suite.id}": testsCount=${suite.testsCount} ≠ ` +
        `passed+failed+error+skipped=${computed}.`
      );
    }
  }

  // Summary must match suites
  const expectedTotalTests = payload.suites.reduce((acc, s) => acc + s.testsCount, 0);
  if (payload.summary.totalTests !== expectedTotalTests) {
    throw new Error(
      `summary.totalTests=${payload.summary.totalTests} does not match ` +
      `sum of suite testsCount=${expectedTotalTests}.`
    );
  }

  // diagnostics: if present, must have required fields
  if (payload.diagnostics !== undefined) {
    const d = payload.diagnostics;
    if (typeof d.available !== 'boolean') {
      throw new Error('diagnostics.available must be a boolean.');
    }
    if (!Array.isArray(d.snapshots)) {
      throw new Error('diagnostics.snapshots must be an array.');
    }
    if (d.available && d.snapshots.length === 0) {
      throw new Error('diagnostics.available is true but snapshots is empty.');
    }
    if (d.available && typeof d.latestSnapshotIndex !== 'number') {
      throw new Error('diagnostics.latestSnapshotIndex must be a number when available=true.');
    }
    // Verify latestSnapshot is consistent with snapshots array
    if (d.available && d.latestSnapshot !== null) {
      const indexedSnapshot = d.snapshots[d.latestSnapshotIndex];
      if (!indexedSnapshot || indexedSnapshot.id !== d.latestSnapshot.id) {
        throw new Error(
          'diagnostics.latestSnapshot does not match snapshots[latestSnapshotIndex].'
        );
      }
    }
  }

  // executions: must be an array
  if (!Array.isArray(payload.executions)) {
    throw new Error('payload.executions must be an array.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Atomic write
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write JSON to a file atomically: write to a temp file, then rename.
 * This prevents partial writes corrupting the live report.
 *
 * @param {string} outputFile  Destination path
 * @param {object} payload     Data to serialize
 */
function writeJsonAtomic(outputFile, payload) {
  const outputDir = path.dirname(outputFile);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`[INFO] Created output directory: ${outputDir}`);
  }

  // Validate before serialization
  validatePayload(payload);

  const json = JSON.stringify(payload, null, 2);

  // Write to a temp file in the same directory (same filesystem = atomic rename)
  const tmpFile = path.join(outputDir, `.testops-report-tmp-${Date.now()}.json`);

  try {
    fs.writeFileSync(tmpFile, json, 'utf-8');
    fs.renameSync(tmpFile, outputFile);
    console.log(`\n[OK] Report written atomically to: ${outputFile}`);
  } catch (err) {
    // Clean up temp file on failure
    try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup error */ }
    throw new Error(`Failed to write output: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main collector
// ─────────────────────────────────────────────────────────────────────────────

function runCollector() {
  const args = parseArgs();

  const surefireDir  = args.surefire || DEFAULT_SUREFIRE_DIR;
  const guardianDir  = args.guardian || DEFAULT_GUARDIAN_DIR;
  const outputFile   = args.output   || DEFAULT_OUTPUT_FILE;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Marketplace TestOps Collector — Schema v2.0.0       ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Frontend root  : ${FRONTEND_ROOT}`);
  console.log(`  Marketplace    : ${MARKETPLACE_ROOT}`);
  console.log(`  Surefire dir   : ${surefireDir}`);
  console.log(`  Guardian dir   : ${guardianDir}`);
  console.log(`  Output file    : ${outputFile}`);
  console.log('');

  // ── 1. Git metadata ────────────────────────────────────────────────────────
  console.log('── Step 1/4: Git metadata ──────────────────────────────');
  const git = readGitMetadata(MARKETPLACE_ROOT);
  if (git.commitSha !== 'unknown') {
    console.log(`  Commit: ${git.commitSha} by ${git.author}`);
    console.log(`  Date  : ${git.commitDate}`);
    console.log(`  Msg   : ${git.commitMessage}`);
  }

  // ── 2. Surefire reports ────────────────────────────────────────────────────
  console.log('');
  console.log('── Step 2/4: Maven Surefire reports ────────────────────');
  const surefireResult = collectSurefireReports(surefireDir);
  const suites = surefireResult.suites; // source === 'java' only

  // ── 3. Quality Guardian diagnostics ───────────────────────────────────────
  console.log('');
  console.log('── Step 3/4: Quality Guardian diagnostics ──────────────');
  const diagnostics = collectGuardianDiagnostics(guardianDir);

  // ── 4. CI/CD executions ────────────────────────────────────────────────────
  console.log('');
  console.log('── Step 4/4: CI/CD executions ──────────────────────────');
  const executions = collectExecutions();

  // ── Summary computation (Java suites only) ─────────────────────────────────
  const summary = computeSummary(suites);

  // ── Payload assembly ───────────────────────────────────────────────────────
  const payload = {
    schemaVersion: '2.0.0',
    generatedAt:   new Date().toISOString(),
    environment:   'local',
    repository:    'marketplace',
    git,
    summary,
    suites,
    diagnostics,
    executions,
  };

  // ── Output ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log('── Writing output ──────────────────────────────────────');
  writeJsonAtomic(outputFile, payload);

  // ── Final report ───────────────────────────────────────────────────────────
  console.log('');
  console.log('── Summary ─────────────────────────────────────────────');
  console.log(`  Schema          : ${payload.schemaVersion}`);
  console.log(`  Generated at    : ${payload.generatedAt}`);
  console.log(`  Test suites     : ${summary.totalSuites} (Java/Surefire only)`);
  console.log(`  Total tests     : ${summary.totalTests}`);
  console.log(`  Passed          : ${summary.passed}`);
  console.log(`  Failed          : ${summary.failed}`);
  console.log(`  Errors          : ${summary.errors}`);
  console.log(`  Skipped         : ${summary.skipped}`);
  console.log(`  Success rate    : ${summary.successRate}%`);
  console.log(`  Duration (ms)   : ${summary.durationMs}`);
  console.log(`  QG snapshots    : ${diagnostics.snapshots.length} ` +
    `(available=${diagnostics.available})`);
  if (diagnostics.available && diagnostics.latestSnapshot) {
    const ls = diagnostics.latestSnapshot;
    console.log(
      `  QG latest       : "${ls.sourceFile}", ` +
      `${ls.findingCount} finding(s), mtime=${ls.fileMtimeISO} [source: filesystem]`
    );
  }
  console.log(`  CI executions   : ${executions.length} (no real proof available)`);
  console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

runCollector();
