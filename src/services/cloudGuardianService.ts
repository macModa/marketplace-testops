
/**
 * cloudGuardianService.ts
 *
 * Typed native-fetch client for the deployed Quality Guardian FastAPI service.
 *
 * Safety invariants:
 * - Credentials and cookies are never sent.
 * - No custom headers other than Content-Type on POST.
 * - HTTP error response bodies are never exposed to the UI.
 * - Secret values are never intentionally logged or forwarded.
 * - WARNING/ERROR severity labels are preserved as-is.
 * - Cloud findings are NOT counted toward local test summary metrics.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Timeout in milliseconds for all cloud API requests. */
const REQUEST_TIMEOUT_MS = 20_000;

const configuredBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  'https://qualityguardian.onrender.com';

export const CLOUD_API_BASE_URL = configuredBaseUrl.replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// Response shape types
// ---------------------------------------------------------------------------

export interface CloudHealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
}

export interface CloudInfoResponse {
  scanner: string;
  api_version: string;
  demo_project: string;
  capabilities: string[];
  supported_extensions: string[];
  ignored_directories: string[];
}

/**
 * A single static-analysis finding returned by the Quality Guardian scanner.
 *
 * - rule: rule identifier (e.g. SECRET_ASSIGNMENT, REQUIRED_FILE)
 * - severity: WARNING or ERROR, preserved as-is
 * - message: human-readable diagnostic
 * - file: relative file path in the scanned project
 * - line: line number, or null if not applicable
 */
export interface CloudFinding {
  rule: string;
  severity: 'WARNING' | 'ERROR';
  message: string;
  file: string;
  line: number | null;
}

export interface CloudScanResponse {
  scanned_target: string;
  finding_count: number;
  findings: CloudFinding[];
  notes: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Result wrappers
// ---------------------------------------------------------------------------

type CloudResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; isTimeout: boolean };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Perform a fetch with an AbortController timeout.
 *
 * Credentials are explicitly omitted and cannot be overridden by callers.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      credentials: 'omit',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Classify errors without exposing internal exception details.
 */
function classifyError(
  err: unknown,
): { error: string; isTimeout: boolean } {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return {
      error:
        'La requête a expiré (délai de 20 s dépassé). ' +
        'Le service cloud sur Render est peut-être en démarrage à froid. ' +
        'Veuillez patienter quelques instants et réessayer.',
      isTimeout: true,
    };
  }

  if (err instanceof TypeError) {
    return {
      error:
        'Impossible de joindre le service cloud. Vérifiez votre connexion ' +
        'ou la disponibilité du service Quality Guardian.',
      isTimeout: false,
    };
  }

  return {
    error: 'Une erreur inattendue est survenue lors de la requête cloud.',
    isTimeout: false,
  };
}

/**
 * Parse an HTTP response as JSON.
 * HTTP error bodies are deliberately never read or exposed.
 */
async function parseJsonResponse<T>(
  response: Response,
  context: string,
): Promise<
  | { ok: true; data: T }
  | { ok: false; error: string; isTimeout: false }
> {
  if (!response.ok) {
    const statusText = response.statusText
      ? ` ${response.statusText}`
      : '';

    return {
      ok: false,
      error: `${context}: HTTP ${response.status}${statusText}.`,
      isTimeout: false,
    };
  }

  try {
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: `${context}: la réponse n'est pas un JSON valide.`,
      isTimeout: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * GET /health
 * Confirms that the Quality Guardian service is running.
 */
export async function fetchCloudHealth(): Promise<
  CloudResult<CloudHealthResponse>
> {
  const url = `${CLOUD_API_BASE_URL}/health`;

  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
    });

    return parseJsonResponse<CloudHealthResponse>(
      response,
      'GET /health',
    );
  } catch (err) {
    return { ok: false, ...classifyError(err) };
  }
}

/**
 * GET /api/info
 * Returns scanner metadata.
 */
export async function fetchCloudInfo(): Promise<
  CloudResult<CloudInfoResponse>
> {
  const url = `${CLOUD_API_BASE_URL}/api/info`;

  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
    });

    return parseJsonResponse<CloudInfoResponse>(
      response,
      'GET /api/info',
    );
  } catch (err) {
    return { ok: false, ...classifyError(err) };
  }
}

/**
 * POST /api/demo/scan
 *
 * Triggers a static analysis scan of the fixed server-side demo project.
 * This is NOT a scan of the user's local repository.
 *
 * The backend is responsible for ensuring that secret values are redacted
 * and that callers cannot choose arbitrary filesystem paths.
 */
export async function triggerCloudDemoScan(): Promise<
  CloudResult<CloudScanResponse>
> {
  const url = `${CLOUD_API_BASE_URL}/api/demo/scan`;

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return parseJsonResponse<CloudScanResponse>(
      response,
      'POST /api/demo/scan',
    );
  } catch (err) {
    return { ok: false, ...classifyError(err) };
  }
}
