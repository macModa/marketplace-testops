
function parseQualityGuardianReports(dirPath) {
  if (!fs.existsSync(dirPath)) return null;

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  if (files.length === 0) return null;

  const prioritized = [
    'quality-report.json',
    'quality-report-after.json',
    'quality-report-initial.json',
  ];

  let chosenFile = prioritized.find(file => files.includes(file));

  if (!chosenFile) {
    chosenFile = files[0];
  }

  const fullPath = path.join(dirPath, chosenFile);

  try {
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const fileStat = fs.statSync(fullPath);

    const findings = Array.isArray(parsed.findings)
      ? parsed.findings
      : [];

    const errorCount = findings.filter(
      finding => finding.severity === 'ERROR'
    ).length;

    const warningCount = findings.filter(
      finding => finding.severity === 'WARNING'
    ).length;

    const infoCount = findings.filter(
      finding => finding.severity === 'INFO'
    ).length;

    // A finding is a diagnostic result, not a passed test.
    const testCases = findings.map((finding, index) => ({
      id: `qg-finding-${index + 1}`,
      name: `${finding.rule || 'RULE'} in ${
        finding.file || 'unknown'
      } (L${finding.line ?? '?'})`,
      className: finding.file || 'QualityGuardian',
      status: finding.severity === 'ERROR' ? 'failed' : 'unknown',
      durationMs: 0,
      errorMessage:
        finding.message || `Detected rule breach: ${finding.rule || 'unknown'}`,
      severity: finding.severity || 'WARNING',
      rule: finding.rule,
      file: finding.file,
      line: finding.line,
    }));

    const findingCount = findings.length;

    return {
      id: `quality-guardian-${chosenFile}`,
      source: 'python',
      suiteName: `Quality Guardian (${chosenFile})`,
      status: errorCount > 0 ? 'failed' : 'passed',
      executedAt: fileStat.mtime.toISOString(),
      durationMs: 0,
      testsCount: findingCount === 0 ? 1 : findingCount,
      passedCount: findingCount === 0 ? 1 : 0,
      failedCount: errorCount,
      errorCount: 0,
      skippedCount: 0,
      testCases,
      provenance: `Quality Guardian JSON: ${chosenFile}`,
      meta: {
        findingCount,
        errorCount,
        warningCount,
        infoCount,
        allFindings: findings,
      },
    };
  } catch (err) {
    console.warn(
      `[WARN] Failed to parse Quality Guardian report: ${err.message}`
    );
    return null;
  }
}
