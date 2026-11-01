import React, { useState } from 'react';
import type { CloudFinding, CloudHealthResponse } from '../services/cloudGuardianService';
import {
  fetchCloudHealth,
  triggerCloudDemoScan,
  CLOUD_API_BASE_URL,
} from '../services/cloudGuardianService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HealthStatus = 'idle' | 'checking' | 'online' | 'offline';
type ScanStatus = 'idle' | 'scanning' | 'done' | 'error';

interface ScanResult {
  scanned_target: string;
  finding_count: number;
  findings: CloudFinding[];
  notes: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface HealthIndicatorProps {
  status: HealthStatus;
  healthData: CloudHealthResponse | null;
  errorMsg: string | null;
  isTimeout: boolean;
  onRetry: () => void;
}

const HealthIndicator: React.FC<HealthIndicatorProps> = ({
  status,
  healthData,
  errorMsg,
  isTimeout,
  onRetry,
}) => {
  const dotClass =
    status === 'online'
      ? 'cloud-health-dot online'
      : status === 'offline'
      ? 'cloud-health-dot offline'
      : status === 'checking'
      ? 'cloud-health-dot checking'
      : 'cloud-health-dot idle';

  const label =
    status === 'online'
      ? `En ligne — v${healthData?.version ?? '?'}`
      : status === 'offline'
      ? 'Hors ligne'
      : status === 'checking'
      ? 'Vérification…'
      : 'Non vérifié';

  return (
    <div className="cloud-health-row">
      <span className={dotClass} aria-hidden="true" />
      <span className="cloud-health-label">{label}</span>

      {(status === 'idle' || status === 'offline') && (
        <button
          type="button"
          className="secondary-btn cloud-retry-btn"
          onClick={onRetry}
          aria-label="Vérifier la disponibilité du service cloud"
        >
          ↻ Vérifier
        </button>
      )}

      {status === 'online' && (
        <button
          type="button"
          className="secondary-btn cloud-retry-btn"
          onClick={onRetry}
          aria-label="Revérifier la disponibilité du service cloud"
        >
          ↻ Revérifier
        </button>
      )}

      {errorMsg && status === 'offline' && (
        <span className="cloud-health-error" role="alert">
          {isTimeout ? '⏱ ' : '⚠ '}
          {errorMsg}
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// FindingCard
// ---------------------------------------------------------------------------

interface FindingCardProps {
  finding: CloudFinding;
  index: number;
  note?: string;
}

const FindingCard: React.FC<FindingCardProps> = ({ finding, index, note }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className={`cloud-finding-card ${finding.severity.toLowerCase()}`}
      aria-label={`Résultat ${index + 1} : ${finding.rule}`}
    >
      <div className="cloud-finding-header">
        <div className="cloud-finding-meta">
          <span className={`severity-tag ${finding.severity.toLowerCase()}`}>
            {finding.severity}
          </span>
          <code className="cloud-finding-rule">{finding.rule}</code>
        </div>
        <button
          type="button"
          className="secondary-btn cloud-expand-btn"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Réduire' : 'Développer les détails'}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      <div className="cloud-finding-location">
        <span className="class-name-tag">
          {finding.file}
          {finding.line != null ? `:${finding.line}` : ''}
        </span>
      </div>

      <p className="cloud-finding-message">{finding.message}</p>

      {expanded && note && (
        <div className="cloud-finding-note">
          <span className="cloud-note-label">ℹ Note :</span>
          <span>{note}</span>
        </div>
      )}
    </article>
  );
};

// ---------------------------------------------------------------------------
// Main CloudScanPanel component
// ---------------------------------------------------------------------------

export const CloudScanPanel: React.FC = () => {
  // Health state
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('idle');
  const [healthData, setHealthData] = useState<CloudHealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthIsTimeout, setHealthIsTimeout] = useState(false);

  // Scan state
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanIsTimeout, setScanIsTimeout] = useState(false);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleCheckHealth = async () => {
    setHealthStatus('checking');
    setHealthError(null);
    setHealthIsTimeout(false);

    const result = await fetchCloudHealth();

    if (result.ok) {
      setHealthData(result.data);
      setHealthStatus('online');
    } else {
      setHealthData(null);
      setHealthStatus('offline');
      setHealthError(result.error);
      setHealthIsTimeout(result.isTimeout);
    }
  };

  const handleScan = async () => {
    if (scanStatus === 'scanning') return;

    setScanStatus('scanning');
    setScanResult(null);
    setScanError(null);
    setScanIsTimeout(false);

    const result = await triggerCloudDemoScan();

    if (result.ok) {
      setScanResult(result.data);
      setScanStatus('done');
    } else {
      setScanError(result.error);
      setScanIsTimeout(result.isTimeout);
      setScanStatus('error');
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="cloud-scan-panel panel" aria-label="Quality Guardian Cloud Scan">
      {/* ------------------------------------------------------------------ */}
      {/* Panel header                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="panel-heading">
        <div>
          <div className="panel-title-group">
            <span className="source-pill python">CLOUD</span>
            <h2>Quality Guardian — Analyse cloud</h2>
          </div>
          <p>
            Exécute une analyse statique sur le projet de démonstration interne
            du serveur.{' '}
            <strong>
              Ce scan ne cible pas votre dépôt local — il s&apos;agit d&apos;un
              projet de démonstration figé côté serveur.
            </strong>
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Disclaimer banner                                                    */}
      {/* ------------------------------------------------------------------ */}
      <aside className="status-banner info cloud-disclaimer" role="note">
        <div className="banner-icon">☁</div>
        <div className="banner-body">
          <strong>Analyse de démonstration serveur</strong>
          <p>
            Ce panneau se connecte au service Quality Guardian déployé sur{' '}
            <span className="class-name-tag">qualityguardian.onrender.com</span>
            . Le scan analyse un projet de démonstration interne figé et ne
            touche ni ne lit aucun fichier de votre espace de travail.
          </p>
          <p>
            Service URL :{' '}
            <span className="class-name-tag">{CLOUD_API_BASE_URL}</span>
          </p>
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Health check section                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="cloud-section">
        <h3 className="cloud-section-title">Disponibilité du service</h3>
        <HealthIndicator
          status={healthStatus}
          healthData={healthData}
          errorMsg={healthError}
          isTimeout={healthIsTimeout}
          onRetry={handleCheckHealth}
        />
        {healthStatus === 'checking' && (
          <p className="cloud-hint">
            ⏳ Vérification en cours… Le service peut prendre 30–60 secondes à
            se réveiller après une période d&apos;inactivité (démarrage à froid Render).
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Scan trigger section                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="cloud-section">
        <h3 className="cloud-section-title">Déclencher une analyse</h3>
        <div className="cloud-scan-actions">
          <button
            type="button"
            className="primary-btn cloud-scan-btn"
            onClick={handleScan}
            disabled={scanStatus === 'scanning'}
            aria-busy={scanStatus === 'scanning'}
          >
            {scanStatus === 'scanning'
              ? '⟳ Analyse en cours…'
              : '▶ Lancer l\u2019analyse de démo'}
          </button>

          {(scanStatus === 'error' || scanStatus === 'done') && (
            <button
              type="button"
              className="secondary-btn"
              onClick={handleScan}
            >
              ↻ Relancer
            </button>
          )}
        </div>

        {/* Loading hint */}
        {scanStatus === 'scanning' && (
          <aside className="status-banner info cloud-loading-banner" role="status">
            <div className="banner-icon">⏳</div>
            <div className="banner-body">
              <strong>Analyse en cours…</strong>
              <p>
                Le service Quality Guardian analyse le projet de démonstration.
                Si le service était inactif, le démarrage à froid peut prendre
                jusqu&apos;à 60 secondes — merci de patienter.
              </p>
            </div>
          </aside>
        )}

        {/* Scan error */}
        {scanStatus === 'error' && scanError && (
          <aside className="status-banner error" role="alert">
            <div className="banner-icon">{scanIsTimeout ? '⏱' : '⚠'}</div>
            <div className="banner-body">
              <strong>
                {scanIsTimeout
                  ? 'Délai d\u2019attente dépassé'
                  : 'Erreur lors de l\u2019analyse'}
              </strong>
              <p>{scanError}</p>
              {scanIsTimeout && (
                <p>
                  Le service Render peut être en démarrage à froid. Attendez
                  quelques instants, vérifiez la disponibilité du service
                  ci-dessus, puis relancez l&apos;analyse.
                </p>
              )}
              <div className="banner-action">
                <button
                  type="button"
                  className="banner-btn"
                  onClick={handleScan}
                >
                  ↻ Réessayer
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Scan results                                                          */}
      {/* ------------------------------------------------------------------ */}
      {scanStatus === 'done' && scanResult && (
        <div className="cloud-section">
          <div className="cloud-results-header">
            <h3 className="cloud-section-title">
              Résultats du scan
            </h3>
            <span className="panel-stat-pill">
              {scanResult.finding_count}{' '}
              {scanResult.finding_count === 1 ? 'résultat' : 'résultats'}
            </span>
          </div>

          <p className="cloud-results-meta">
            Projet scanné :{' '}
            <span className="class-name-tag">{scanResult.scanned_target}</span>
            &nbsp;— Ces résultats proviennent du projet de démonstration
            interne du serveur et ne reflètent pas l&apos;état de votre
            dépôt local.
          </p>

          {scanResult.finding_count === 0 ? (
            <div className="empty-panel-notice">
              ✓ Aucun résultat détecté sur le projet de démonstration.
            </div>
          ) : (
            <div className="cloud-findings-list">
              {scanResult.findings.map((finding, index) => (
                <FindingCard
                  key={`${finding.rule}-${finding.file}-${index}`}
                  finding={finding}
                  index={index}
                  note={scanResult.notes[finding.rule]}
                />
              ))}
            </div>
          )}

          {/* Notes section */}
          {Object.keys(scanResult.notes).length > 0 && (
            <details className="cloud-notes-details">
              <summary className="cloud-notes-summary">
                ℹ Notes explicatives du scanner
              </summary>
              <div className="cloud-notes-body">
                {Object.entries(scanResult.notes).map(([rule, note]) => (
                  <div key={rule} className="cloud-note-entry">
                    <code className="cloud-finding-rule">{rule}</code>
                    <p>{note}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
};
