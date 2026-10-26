import React, { useEffect } from 'react';
import type { TestCase, TestSource } from '../types/testops';
import { formatDuration } from '../services/reportService';

interface TestDetailModalProps {
  testCase: (TestCase & { suiteName: string; source: TestSource }) | null;
  onClose: () => void;
}

export const TestDetailModal: React.FC<TestDetailModalProps> = ({ testCase, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!testCase) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-category">
              <span className={`source-pill ${testCase.source}`}>{testCase.source.toUpperCase()}</span>
              <span>{testCase.suiteName}</span>
            </div>
            <h3 className="modal-title">{testCase.name}</h3>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Fermer la modale">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-meta-grid">
            <div className="meta-box">
              <span className="label">Statut</span>
              <span className={`status-badge ${testCase.status}`}>
                {testCase.status.toUpperCase()}
              </span>
            </div>

            <div className="meta-box">
              <span className="label">Durée</span>
              <strong>{formatDuration(testCase.durationMs)}</strong>
            </div>

            {testCase.rule && (
              <div className="meta-box">
                <span className="label">Règle de sécurité</span>
                <code>{testCase.rule}</code>
              </div>
            )}

            {testCase.severity && (
              <div className="meta-box">
                <span className="label">Sévérité</span>
                <span className={`severity-tag ${testCase.severity.toLowerCase()}`}>
                  {testCase.severity}
                </span>
              </div>
            )}

            {testCase.file && (
              <div className="meta-box full-width">
                <span className="label">Fichier ciblé</span>
                <code>
                  {testCase.file} {testCase.line ? `(Ligne ${testCase.line})` : ''}
                </code>
              </div>
            )}

            {testCase.className && !testCase.file && (
              <div className="meta-box full-width">
                <span className="label">Classe de test</span>
                <code>{testCase.className}</code>
              </div>
            )}
          </div>

          {testCase.errorMessage && (
            <div className="error-box">
              <h4>Message diagnostique</h4>
              <p className="error-text">{testCase.errorMessage}</p>
            </div>
          )}

          {testCase.stackTrace && (
            <div className="stacktrace-box">
              <h4>Trace d&apos;exécution complète (Stack Trace)</h4>
              <pre className="code-block">
                <code>{testCase.stackTrace}</code>
              </pre>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
