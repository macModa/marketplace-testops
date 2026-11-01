/**
 * cloudGuardianService.test.ts
 *
 * Unit tests for the Quality Guardian cloud service client.
 *
 * Test categories:
 * - fetchCloudHealth  : liveness endpoint parsing and error handling.
 * - fetchCloudInfo    : scanner metadata endpoint.
 * - triggerCloudDemoScan : demo scan endpoint, finding normalization, and
 *                          secret-value guarantees.
 * - Timeout handling  : AbortController-based timeout.
 * - Network errors    : fetch TypeError (CORS / unreachable host).
 * - HTTP errors       : non-2xx responses.
 * - JSON errors       : malformed response bodies.
 *
 * Invariants verified:
 * - severity labels ('WARNING', 'ERROR') are preserved without remapping.
 * - finding_count equals findings array length.
 * - No 'value' field appears in any finding.
 * - credentials explicitement exclus (credentials: 'omit' sur chaque appel fetch).
 * - corps des réponses HTTP en erreur jamais lu (ni text() ni json() appelés).
 * - aucun contenu sensible exposé dans les messages d'erreur.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import {
  fetchCloudHealth,
  fetchCloudInfo,
  triggerCloudDemoScan,
} from './cloudGuardianService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(
  body: unknown,
  status = 200,
  statusText = 'OK',
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

function makeNetworkError(): Promise<Response> {
  return Promise.reject(new TypeError('Failed to fetch'));
}

function makeAbortError(): Promise<Response> {
  const err = new DOMException('The operation was aborted.', 'AbortError');
  return Promise.reject(err);
}

// ---------------------------------------------------------------------------
// Fixture data — mirrors the actual Quality Guardian API contract.
// ---------------------------------------------------------------------------

const HEALTH_FIXTURE = {
  status: 'ok',
  service: 'quality-guardian-api',
  version: '0.1.0',
  timestamp: '2026-11-01T12:00:00.000000+00:00',
};

const INFO_FIXTURE = {
  scanner: 'Quality Guardian Core',
  api_version: '0.1.0',
  demo_project: 'api/demo_project',
  capabilities: [
    'SECRET_ASSIGNMENT detection (password, secret, api_key, access_token)',
    'Zero-leak reporting — secret values are always withheld',
  ],
  supported_extensions: ['.java', '.py', '.properties', '.yml'],
  ignored_directories: ['.venv', 'node_modules', 'target'],
};

const SCAN_FIXTURE = {
  scanned_target: 'demo_project',
  finding_count: 2,
  findings: [
    {
      rule: 'REQUIRED_FILE',
      severity: 'WARNING',
      message: 'Required file missing: pom.xml',
      file: 'pom.xml',
      line: null,
    },
    {
      rule: 'SECRET_ASSIGNMENT',
      severity: 'WARNING',
      message: 'Potential hard-coded secret detected; value withheld.',
      file: 'config.properties',
      line: 4,
    },
  ],
  notes: {
    REQUIRED_FILE: 'The demo project is not a Spring Boot application.',
    SECRET_ASSIGNMENT: 'Synthetic non-functional key for detection demo.',
  },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let fetchSpy: MockInstance;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// fetchCloudHealth
// ---------------------------------------------------------------------------

describe('fetchCloudHealth', () => {
  it('returns ok:true with health data on a 200 response', async () => {
    fetchSpy.mockResolvedValue(makeResponse(HEALTH_FIXTURE));

    const result = await fetchCloudHealth();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.status).toBe('ok');
    expect(result.data.service).toBe('quality-guardian-api');
    expect(result.data.version).toBe('0.1.0');
    expect(result.data.timestamp).toContain('T');
  });

  it("enforces credentials: 'omit' on fetch", async () => {
    fetchSpy.mockResolvedValue(makeResponse(HEALTH_FIXTURE));

    await fetchCloudHealth();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/health'),
      expect.objectContaining({ credentials: 'omit' }),
    );
  });

  it('returns ok:false with a descriptive error on HTTP 503', async () => {
    fetchSpy.mockResolvedValue(makeResponse({ detail: 'Service Unavailable' }, 503, 'Service Unavailable'));

    const result = await fetchCloudHealth();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('503');
    expect(result.isTimeout).toBe(false);
  });

  it('returns ok:false with isTimeout:true on AbortError', async () => {
    fetchSpy.mockImplementation(() => makeAbortError());

    const result = await fetchCloudHealth();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.isTimeout).toBe(true);
    expect(result.error).toMatch(/expir|froid/i);
  });

  it('returns ok:false on a network TypeError', async () => {
    fetchSpy.mockImplementation(() => makeNetworkError());

    const result = await fetchCloudHealth();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.isTimeout).toBe(false);
    expect(result.error).toMatch(/joindre|connexion/i);
  });

  it('returns ok:false when the response body is not valid JSON', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
      text: vi.fn().mockResolvedValue('not json'),
    } as unknown as Response);

    const result = await fetchCloudHealth();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/JSON/i);
  });
});

// ---------------------------------------------------------------------------
// fetchCloudInfo
// ---------------------------------------------------------------------------

describe('fetchCloudInfo', () => {
  it('returns ok:true with scanner metadata on 200', async () => {
    fetchSpy.mockResolvedValue(makeResponse(INFO_FIXTURE));

    const result = await fetchCloudInfo();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.scanner).toContain('Quality Guardian');
    expect(Array.isArray(result.data.capabilities)).toBe(true);
    expect(result.data.capabilities.length).toBeGreaterThan(0);
    expect(result.data.supported_extensions).toContain('.java');
    expect(result.data.ignored_directories).toContain('.venv');
  });

  it("enforces credentials: 'omit' on fetch", async () => {
    fetchSpy.mockResolvedValue(makeResponse(INFO_FIXTURE));

    await fetchCloudInfo();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/info'),
      expect.objectContaining({ credentials: 'omit' }),
    );
  });

  it('mentions zero-leak in capabilities', async () => {
    fetchSpy.mockResolvedValue(makeResponse(INFO_FIXTURE));

    const result = await fetchCloudInfo();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const combined = result.data.capabilities.join(' ').toLowerCase();
    expect(combined).toMatch(/withheld|leak|zero/);
  });

  it('returns ok:false on HTTP 404', async () => {
    fetchSpy.mockResolvedValue(makeResponse({ detail: 'Not Found' }, 404, 'Not Found'));

    const result = await fetchCloudInfo();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('404');
  });
});

// ---------------------------------------------------------------------------
// triggerCloudDemoScan
// ---------------------------------------------------------------------------

describe('triggerCloudDemoScan', () => {
  it('returns ok:true with scan data on 200', async () => {
    fetchSpy.mockResolvedValue(makeResponse(SCAN_FIXTURE));

    const result = await triggerCloudDemoScan();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.scanned_target).toBe('demo_project');
    expect(result.data.finding_count).toBe(2);
    expect(result.data.findings).toHaveLength(2);
  });

  it("enforces credentials: 'omit' on fetch", async () => {
    fetchSpy.mockResolvedValue(makeResponse(SCAN_FIXTURE));

    await triggerCloudDemoScan();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/demo/scan'),
      expect.objectContaining({ credentials: 'omit' }),
    );
  });

  it('finding_count matches findings array length', async () => {
    fetchSpy.mockResolvedValue(makeResponse(SCAN_FIXTURE));

    const result = await triggerCloudDemoScan();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.finding_count).toBe(result.data.findings.length);
  });

  it('preserves severity labels without remapping to passed/failed', async () => {
    fetchSpy.mockResolvedValue(makeResponse(SCAN_FIXTURE));

    const result = await triggerCloudDemoScan();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const finding of result.data.findings) {
      expect(['WARNING', 'ERROR']).toContain(finding.severity);
      // Severity must NOT be converted to a TestStatus.
      expect(finding).not.toHaveProperty('status');
    }
  });

  it('each finding has the required fields: rule, severity, message, file', async () => {
    fetchSpy.mockResolvedValue(makeResponse(SCAN_FIXTURE));

    const result = await triggerCloudDemoScan();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const finding of result.data.findings) {
      expect(finding).toHaveProperty('rule');
      expect(finding).toHaveProperty('severity');
      expect(finding).toHaveProperty('message');
      expect(finding).toHaveProperty('file');
    }
  });

  it('no finding has a "value" field (zero-leak guarantee)', async () => {
    fetchSpy.mockResolvedValue(makeResponse(SCAN_FIXTURE));

    const result = await triggerCloudDemoScan();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const finding of result.data.findings) {
      expect(finding).not.toHaveProperty('value');
    }
  });

  it('SECRET_ASSIGNMENT finding message says value is withheld', async () => {
    fetchSpy.mockResolvedValue(makeResponse(SCAN_FIXTURE));

    const result = await triggerCloudDemoScan();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const secretFindings = result.data.findings.filter(
      (f) => f.rule === 'SECRET_ASSIGNMENT',
    );
    expect(secretFindings.length).toBeGreaterThan(0);
    expect(secretFindings[0].message.toLowerCase()).toContain('withheld');
  });

  it('notes object is present and non-empty', async () => {
    fetchSpy.mockResolvedValue(makeResponse(SCAN_FIXTURE));

    const result = await triggerCloudDemoScan();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(typeof result.data.notes).toBe('object');
    expect(Object.keys(result.data.notes).length).toBeGreaterThan(0);
  });

  it('returns ok:false with isTimeout:true on AbortError', async () => {
    fetchSpy.mockImplementation(() => makeAbortError());

    const result = await triggerCloudDemoScan();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.isTimeout).toBe(true);
  });

  it('returns ok:false on HTTP 500 without exposing error body', async () => {
    fetchSpy.mockResolvedValue(
      makeResponse({ detail: 'Internal Server Error' }, 500, 'Internal Server Error'),
    );

    const result = await triggerCloudDemoScan();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('500');
    expect(result.error).not.toContain('detail');
  });

  it('does not read or expose response body on HTTP 500 to prevent secret leakage', async () => {
    const jsonSpy = vi.fn().mockResolvedValue({ leak: 'SECRET_SHOULD_NOT_APPEAR' });
    const textSpy = vi.fn().mockResolvedValue('raw body containing SECRET_SHOULD_NOT_APPEAR');
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: jsonSpy,
      text: textSpy,
    } as unknown as Response;

    fetchSpy.mockResolvedValue(mockResponse);

    const result = await triggerCloudDemoScan();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('500');
    expect(result.error).not.toContain('SECRET_SHOULD_NOT_APPEAR');
    expect(textSpy).not.toHaveBeenCalled();
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('returns ok:false on a network failure', async () => {
    fetchSpy.mockImplementation(() => makeNetworkError());

    const result = await triggerCloudDemoScan();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.isTimeout).toBe(false);
  });
});
