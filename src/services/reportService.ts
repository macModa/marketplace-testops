import type { TestOpsReport, TestCase, TestSource, TestStatus } from '../types/testops';
import { DEMO_TESTOPS_REPORT } from '../data/demo-data';

export interface FetchResult {
  report: TestOpsReport;
  isDemo: boolean;
  isEmpty: boolean;
  error?: string;
}

export async function fetchTestOpsReport(forceDemo: boolean = false): Promise<FetchResult> {
  if (forceDemo) {
    return {
      report: DEMO_TESTOPS_REPORT,
      isDemo: true,
      isEmpty: false,
    };
  }

  try {
    const response = await fetch('/data/testops-report.json', {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          report: DEMO_TESTOPS_REPORT,
          isDemo: true,
          isEmpty: true,
          error: 'Aucun rapport local trouvé (404). Exécutez "npm run collect" pour générer les données réelles.',
        };
      }
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    // Basic structure validation to prevent UI crashes on corrupt data
    if (!json || typeof json !== 'object' || !Array.isArray(json.suites)) {
      throw new Error('Format de rapport invalide: le fichier JSON ne contient pas la propriété suites requise.');
    }

    const isActuallyEmpty = json.suites.length === 0;

    return {
      report: json as TestOpsReport,
      isDemo: false,
      isEmpty: isActuallyEmpty,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue lors du chargement des données.';
    return {
      report: DEMO_TESTOPS_REPORT,
      isDemo: true,
      isEmpty: true,
      error: message,
    };
  }
}

export function formatDuration(durationMs?: number): string {
  if (durationMs === undefined || durationMs === null || isNaN(durationMs)) {
    return 'N/A';
  }
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  return `${(durationMs / 1000).toFixed(2)} s`;
}

export function formatRelativeDate(isoDateString?: string): string {
  if (!isoDateString) return 'Inconnue';
  try {
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) return isoDateString;
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoDateString;
  }
}

export function extractAllTestCases(report: TestOpsReport): (TestCase & { suiteName: string; source: TestSource })[] {
  const all: (TestCase & { suiteName: string; source: TestSource })[] = [];
  for (const suite of report.suites) {
    for (const tc of suite.testCases) {
      all.push({
        ...tc,
        suiteName: suite.suiteName,
        source: suite.source,
      });
    }
  }
  return all;
}

export function filterTestCases(
  testCases: (TestCase & { suiteName: string; source: TestSource })[],
  sourceFilter: 'all' | TestSource,
  statusFilter: 'all' | TestStatus,
  searchQuery: string
): (TestCase & { suiteName: string; source: TestSource })[] {
  return testCases.filter((tc) => {
    if (sourceFilter !== 'all' && tc.source !== sourceFilter) return false;
    if (statusFilter !== 'all' && tc.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = tc.name.toLowerCase().includes(q);
      const matchSuite = tc.suiteName.toLowerCase().includes(q);
      const matchClass = tc.className?.toLowerCase().includes(q) || false;
      const matchError = tc.errorMessage?.toLowerCase().includes(q) || false;
      if (!matchName && !matchSuite && !matchClass && !matchError) return false;
    }
    return true;
  });
}
