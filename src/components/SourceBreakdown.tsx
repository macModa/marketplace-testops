import React from 'react';
import type { TestSuite, TestCase, TestSource } from '../types/testops';
import { formatDuration, formatRelativeDate } from '../services/reportService';

interface SourceBreakdownProps {
  suites: TestSuite[];
  onSelectTestCase: (tc: TestCase & { suiteName: string; source: TestSource }) => void;
}

export const SourceBreakdown: React.FC<SourceBreakdownProps> = ({
  suites,
  onSelectTestCase,
}) => {
  const javaSuites = suites.filter((s) => s.source === 'java');
  const pythonSuites = suites.filter((s) => s.source === 'python');
  const workflowSuites = suites.filter((s) => s.source === 'github-actions');

  return (
    <section className="sources-container">
      {/* 1. Java / Surefire Section */}
      <article className="panel source-panel">
        <div className="panel-heading">
          <div className="panel-title-group">
            <span className="source-pill java">JAVA</span>
            <div>
              <h2>Suites JUnit 5 / Maven Surefire</h2>
              <p>Rapports d&apos;exécution issus de target/surefire-reports</p>
            </div>
          </div>
          <span className="panel-stat-pill">
            {javaSuites.length} {javaSuites.length > 1 ? 'suites' : 'suite'}
          </span>
        </div>

        {javaSuites.length === 0 ? (
          <div className="empty-panel-notice">
            Aucun rapport Surefire détecté dans target/surefire-reports. Lancez les tests Maven pour générer les rapports.
          </div>
        ) : (
          <div className="suites-list">
            {javaSuites.map((suite) => (
              <div key={suite.id} className="suite-card">
                <div className="suite-header">
                  <div>
                    <strong>{suite.suiteName}</strong>
                    <div className="suite-meta">
                      <span>Exécuté le {formatRelativeDate(suite.executedAt)}</span>
                      <span>•</span>
                      <span>Durée : {formatDuration(suite.durationMs)}</span>
                    </div>
                  </div>
                  <span className={`status-badge ${suite.status}`}>
                    {suite.status === 'passed' ? '✓ RÉUSSI' : '✗ ÉCHEC'}
                  </span>
                </div>

                <div className="testcases-mini-list">
                  {suite.testCases.map((tc) => (
                    <button
                      type="button"
                      key={tc.id}
                      className={`tc-item-btn ${tc.status}`}
                      onClick={() =>
                        onSelectTestCase({
                          ...tc,
                          suiteName: suite.suiteName,
                          source: 'java',
                        })
                      }
                      title="Cliquer pour inspecter les détails"
                    >
                      <span className="tc-status-dot" />
                      <span className="tc-name">{tc.name}</span>
                      <span className="tc-time">{formatDuration(tc.durationMs)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      {/* 2. Python / Quality Guardian Section */}
      <article className="panel source-panel">
        <div className="panel-heading">
          <div className="panel-title-group">
            <span className="source-pill python">PYTHON</span>
            <div>
              <h2>Quality Guardian (AI Lab)</h2>
              <p>Audit statique de sécurité & détection Zero-Leak de secrets</p>
            </div>
          </div>
          <span className="panel-stat-pill">
            {pythonSuites.length} {pythonSuites.length > 1 ? 'rapports' : 'rapport'}
          </span>
        </div>

        {pythonSuites.length === 0 ? (
          <div className="empty-panel-notice">
            Aucun rapport Quality Guardian détecté dans ai-lab/month-01-quality-guardian/reports/.
          </div>
        ) : (
          <div className="suites-list">
            {pythonSuites.map((suite) => (
              <div key={suite.id} className="suite-card">
                <div className="suite-header">
                  <div>
                    <strong>{suite.suiteName}</strong>
                    <div className="suite-meta">
                      <span>Généré le {formatRelativeDate(suite.executedAt)}</span>
                      <span>•</span>
                      <span>Source : {suite.provenance}</span>
                    </div>
                  </div>
                  <span
                    className={`status-badge ${
                      suite.failedCount > 0 ? 'failed' : 'passed'
                    }`}
                  >
                    {suite.failedCount > 0
                      ? `${suite.failedCount} ANOMALIE${suite.failedCount > 1 ? 'S' : ''}`
                      : '✓ 0 ANOMALIE'}
                  </span>
                </div>

                <div className="testcases-mini-list">
                  {suite.testCases.map((tc) => (
                    <button
                      type="button"
                      key={tc.id}
                      className={`tc-item-btn ${tc.status}`}
                      onClick={() =>
                        onSelectTestCase({
                          ...tc,
                          suiteName: suite.suiteName,
                          source: 'python',
                        })
                      }
                      title="Cliquer pour inspecter l'anomalie de sécurité"
                    >
                      <span className="tc-status-dot" />
                      <span className="tc-name">
                        <strong className="rule-tag">[{tc.rule || 'FINDING'}]</strong> {tc.name}
                      </span>
                      {tc.severity && (
                        <span className={`severity-tag ${tc.severity.toLowerCase()}`}>
                          {tc.severity}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      {/* 3. GitHub Actions CI Section */}
      <article className="panel source-panel">
        <div className="panel-heading">
          <div className="panel-title-group">
            <span className="source-pill github">CI/CD</span>
            <div>
              <h2>Workflows GitHub Actions</h2>
              <p>Pipelines automatisés déclarés dans le workspace</p>
            </div>
          </div>
          <span className="panel-stat-pill">
            {workflowSuites.length} {workflowSuites.length > 1 ? 'workflows' : 'workflow'}
          </span>
        </div>

        {workflowSuites.length === 0 ? (
          <div className="empty-panel-notice">Aucun workflow GitHub Actions détecté.</div>
        ) : (
          <div className="suites-list">
            {workflowSuites.map((suite) => (
              <div key={suite.id} className="suite-card">
                <div className="suite-header">
                  <div>
                    <strong>{suite.suiteName}</strong>
                    <div className="suite-meta">
                      <span>Déclaré dans {suite.provenance}</span>
                      <span>•</span>
                      <span>Vérifié le {formatRelativeDate(suite.executedAt)}</span>
                    </div>
                  </div>
                  <span className="status-badge passed">✓ ACTIF</span>
                </div>

                <div className="testcases-mini-list">
                  {suite.testCases.map((tc) => (
                    <button
                      type="button"
                      key={tc.id}
                      className="tc-item-btn passed"
                      onClick={() =>
                        onSelectTestCase({
                          ...tc,
                          suiteName: suite.suiteName,
                          source: 'github-actions',
                        })
                      }
                    >
                      <span className="tc-status-dot" />
                      <span className="tc-name">{tc.name}</span>
                      <span className="tc-time">{formatDuration(tc.durationMs)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
};
