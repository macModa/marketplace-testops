import React, { useState, useMemo } from 'react';
import type { TestCase, TestSource, TestStatus, TestSuite } from '../types/testops';
import { extractAllTestCases, filterTestCases, formatDuration } from '../services/reportService';

interface TestRunsTableProps {
  suites: TestSuite[];
  onSelectTestCase: (tc: TestCase & { suiteName: string; source: TestSource }) => void;
}

export const TestRunsTable: React.FC<TestRunsTableProps> = ({ suites, onSelectTestCase }) => {
  const [sourceFilter, setSourceFilter] = useState<'all' | TestSource>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TestStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const allTestCases = useMemo(() => {
    return extractAllTestCases({ suites } as { suites: TestSuite[] } as never);
  }, [suites]);

  const filteredTestCases = useMemo(() => {
    return filterTestCases(allTestCases, sourceFilter, statusFilter, searchQuery);
  }, [allTestCases, sourceFilter, statusFilter, searchQuery]);

  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <h2>Registre exhaustif des tests et audits</h2>
          <p>Détail de chaque cas de test, anomalie et vérification unitaire</p>
        </div>
        <span className="results-count">
          {filteredTestCases.length} sur {allTestCases.length} affichés
        </span>
      </div>

      <div className="table-controls">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Rechercher par nom de test, classe, erreur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Rechercher dans les tests"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search"
              onClick={() => setSearchQuery('')}
              aria-label="Effacer la recherche"
            >
              ✕
            </button>
          )}
        </div>

        <div className="filter-group">
          <div className="segmented-control" role="group" aria-label="Filtrer par source">
            <button
              type="button"
              className={`segment-btn ${sourceFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSourceFilter('all')}
            >
              Toutes sources
            </button>
            <button
              type="button"
              className={`segment-btn ${sourceFilter === 'java' ? 'active' : ''}`}
              onClick={() => setSourceFilter('java')}
            >
              Java Maven
            </button>
            <button
              type="button"
              className={`segment-btn ${sourceFilter === 'python' ? 'active' : ''}`}
              onClick={() => setSourceFilter('python')}
            >
              Python Guardian
            </button>
            <button
              type="button"
              className={`segment-btn ${sourceFilter === 'github-actions' ? 'active' : ''}`}
              onClick={() => setSourceFilter('github-actions')}
            >
              CI/CD
            </button>
          </div>

          <div className="segmented-control" role="group" aria-label="Filtrer par statut">
            <button
              type="button"
              className={`segment-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              Tous statuts
            </button>
            <button
              type="button"
              className={`segment-btn ${statusFilter === 'passed' ? 'active' : ''}`}
              onClick={() => setStatusFilter('passed')}
            >
              Réussis
            </button>
            <button
              type="button"
              className={`segment-btn ${statusFilter === 'failed' ? 'active' : ''}`}
              onClick={() => setStatusFilter('failed')}
            >
              En échec
            </button>
          </div>
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style={{ width: '100px' }}>SOURCE</th>
              <th>TEST / AUDIT</th>
              <th>SUITE / CLASSE</th>
              <th style={{ width: '110px' }}>DURÉE</th>
              <th style={{ width: '120px' }}>STATUT</th>
              <th style={{ width: '90px' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {filteredTestCases.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-table-cell">
                  Aucun test ne correspond aux filtres sélectionnés.
                </td>
              </tr>
            ) : (
              filteredTestCases.map((tc) => (
                <tr key={tc.id} className={tc.status === 'failed' ? 'row-failed' : ''}>
                  <td>
                    <span className={`source-pill ${tc.source}`}>
                      {tc.source === 'github-actions' ? 'CI/CD' : tc.source.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div className="test-name-cell">
                      <strong>{tc.name}</strong>
                      {tc.errorMessage && (
                        <span className="error-preview" title={tc.errorMessage}>
                          ↳ {tc.errorMessage}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="class-name-tag" title={tc.className || tc.suiteName}>
                      {tc.file ? `${tc.file}:${tc.line}` : tc.className || tc.suiteName}
                    </span>
                  </td>
                  <td>{formatDuration(tc.durationMs)}</td>
                  <td>
                    <span className={`status-badge ${tc.status}`}>
                      <i className="status-dot" />
                      {tc.status.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="inspect-btn"
                      onClick={() => onSelectTestCase(tc)}
                      title="Inspecter les détails de ce test"
                    >
                      Détails
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
