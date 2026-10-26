export type TestStatus = 'passed' | 'failed' | 'error' | 'skipped' | 'unknown';
export type TestSource = 'java' | 'python' | 'github-actions' | 'custom';

export interface TestCase {
  id: string;
  name: string;
  className?: string;
  status: TestStatus;
  durationMs?: number;
  errorMessage?: string;
  stackTrace?: string;
  severity?: 'INFO' | 'WARNING' | 'ERROR';
  rule?: string;
  file?: string;
  line?: number;
}

export interface TestSuite {
  id: string;
  source: TestSource;
  suiteName: string;
  status: TestStatus;
  executedAt: string;
  durationMs: number;
  testsCount: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  skippedCount: number;
  testCases: TestCase[];
  provenance: string;
  meta?: Record<string, unknown>;
}

export interface GitMetadata {
  commitSha: string;
  author: string;
  commitDate: string;
  commitMessage: string;
}

export interface TestSummary {
  totalSuites: number;
  totalTests: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  successRate: number;
  durationMs: number;
}

export interface TestOpsReport {
  schemaVersion: string;
  generatedAt: string;
  environment: 'local' | 'ci' | 'demo';
  repository: string;
  git: GitMetadata;
  summary: TestSummary;
  suites: TestSuite[];
}

export interface LoadState {
  isLoading: boolean;
  error: string | null;
  data: TestOpsReport | null;
  isDemo: boolean;
  sourceType: 'real' | 'demo' | 'empty';
}
