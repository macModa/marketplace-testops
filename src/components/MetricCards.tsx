import React from 'react';
import type { TestSummary, TestSuite } from '../types/testops';
import { formatDuration } from '../services/reportService';

interface MetricCardsProps {
  summary: TestSummary;
  suites: TestSuite[];
}

export const MetricCards: React.FC<MetricCardsProps> = ({ summary, suites }) => {
  const javaSuites = suites.filter((s) => s.source === 'java');
  const pythonSuites = suites.filter((s) => s.source === 'python');

  const javaTests = javaSuites.reduce((acc, s) => acc + s.testsCount, 0);
  const javaPassed = javaSuites.reduce((acc, s) => acc + s.passedCount, 0);
  const javaFailed = javaSuites.reduce((acc, s) => acc + s.failedCount, 0);

  const pythonFindings = pythonSuites.reduce((acc, s) => acc + s.failedCount, 0);
  const pythonSuitesCount = pythonSuites.length;

  return (
    <section className="metrics-grid" aria-label="Indicateurs clés">
      <article className="metric-card">
        <div className="metric-top">
          <span className="metric-title">Tests exécutés</span>
          <span className="metric-badge blue">Total</span>
        </div>
        <div className="metric-value">{summary.totalTests}</div>
        <div className="metric-foot">
          <span>{javaTests} Java</span> • <span>{pythonSuitesCount} Audit Python</span>
        </div>
      </article>

      <article className="metric-card">
        <div className="metric-top">
          <span className="metric-title">Taux de réussite</span>
          <span className="metric-badge green">✓</span>
        </div>
        <div className="metric-value">
          {summary.totalTests > 0 ? (
            <>
              {summary.successRate}
              <span className="unit">%</span>
            </>
          ) : (
            <span className="empty-val">N/A</span>
          )}
        </div>
        <div className="metric-foot">
          {summary.totalTests > 0 ? (
            <span>
              {summary.passed} réussis sur {summary.totalTests} total
            </span>
          ) : (
            <span>Aucune donnée de test</span>
          )}
        </div>
      </article>

      <article className={`metric-card ${summary.failed > 0 ? 'alert' : ''}`}>
        <div className="metric-top">
          <span className="metric-title">Tests / Audits en échec</span>
          <span className={`metric-badge ${summary.failed > 0 ? 'red' : 'neutral'}`}>!</span>
        </div>
        <div className="metric-value">{summary.failed}</div>
        <div className="metric-foot">
          {summary.failed > 0 ? (
            <span className="negative">
              {javaFailed} Java • {pythonFindings} anomalies Python
            </span>
          ) : (
            <span className="positive">0 régression détectée</span>
          )}
        </div>
      </article>

      <article className="metric-card">
        <div className="metric-top">
          <span className="metric-title">Ignorés / Erreurs</span>
          <span className="metric-badge gray">∅</span>
        </div>
        <div className="metric-value">
          {summary.skipped + summary.errors}
        </div>
        <div className="metric-foot">
          <span>{summary.skipped} ignorés</span> • <span>{summary.errors} erreurs bloquantes</span>
        </div>
      </article>

      <article className="metric-card">
        <div className="metric-top">
          <span className="metric-title">Durée cumulée</span>
          <span className="metric-badge purple">⏱</span>
        </div>
        <div className="metric-value">{formatDuration(summary.durationMs)}</div>
        <div className="metric-foot">
          <span>Java : {javaPassed}/{javaTests} validés</span>
        </div>
      </article>
    </section>
  );
};
