
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractAllTestCases,
  fetchTestOpsReport,
  filterTestCases,
  formatDuration,
} from './reportService';
import { DEMO_TESTOPS_REPORT } from '../data/demo-data';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('formatDuration', () => {
  it('returns N/A when duration is undefined', () => {
    expect(formatDuration(undefined)).toBe('N/A');
  });

  it('formats milliseconds below one second', () => {
    expect(formatDuration(450)).toBe('450 ms');
  });

  it('formats seconds with two decimal places', () => {
    expect(formatDuration(2500)).toBe('2.50 s');
  });

  it('returns N/A for NaN', () => {
    expect(formatDuration(Number.NaN)).toBe('N/A');
  });
});

describe('extractAllTestCases', () => {
  it('extracts test cases from all suites', () => {
    const result = extractAllTestCases(DEMO_TESTOPS_REPORT);

    expect(result).toHaveLength(12);
    expect(result[0].suiteName).toBe(
      'com.marketplace.service.ProductServiceTest',
    );
    expect(result[0].source).toBe('java');
  });
});

describe('filterTestCases', () => {
  const testCases = extractAllTestCases(DEMO_TESTOPS_REPORT);

  it('filters by source', () => {
    const result = filterTestCases(testCases, 'java', 'all', '');

    expect(result).toHaveLength(7);
    expect(result.every((testCase) => testCase.source === 'java')).toBe(true);
  });

  it('filters failed test cases', () => {
    const result = filterTestCases(testCases, 'all', 'failed', '');

    expect(result).toHaveLength(2);
    expect(result.every((testCase) => testCase.status === 'failed')).toBe(true);
  });

  it('searches test names without case sensitivity', () => {
    const result = filterTestCases(testCases, 'all', 'all', 'PROMOCODE');

    expect(result).toHaveLength(2);
  });

  it('combines source and status filters', () => {
    const result = filterTestCases(testCases, 'java', 'failed', '');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe(
      'applyPromoCode_whenValid_recalculatesSubtotal',
    );
  });
});

describe('fetchTestOpsReport', () => {
  it('returns demo data when explicitly requested', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchTestOpsReport(true);

    expect(result.report).toBe(DEMO_TESTOPS_REPORT);
    expect(result.isDemo).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to demo data when the report returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }),
    );

    const result = await fetchTestOpsReport();

    expect(result.report).toBe(DEMO_TESTOPS_REPORT);
    expect(result.isDemo).toBe(true);
    expect(result.isEmpty).toBe(true);
    expect(result.error).toContain('404');
  });

  it('falls back to demo data when the network request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network unavailable')),
    );

    const result = await fetchTestOpsReport();

    expect(result.isDemo).toBe(true);
    expect(result.error).toBe('Network unavailable');
  });
});
