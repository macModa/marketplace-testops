import React from 'react';
import type { GitMetadata } from '../types/testops';
import { formatRelativeDate } from '../services/reportService';

interface HeaderProps {
  generatedAt: string;
  git: GitMetadata;
  isDemo: boolean;
  onRefresh: () => void;
  onToggleDemo: () => void;
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  generatedAt,
  git,
  isDemo,
  onRefresh,
  onToggleDemo,
  isLoading,
}) => {
  return (
    <header className="topbar">
      <div>
        <div className="breadcrumb">
          Marketplace TestOps / <strong>QA Automation & Harness Engineering</strong>
        </div>
        <h1>Test Execution & Quality Dashboard</h1>
        <p className="subtitle">
          Supervision des suites de tests Java Maven, audits Quality Guardian Python et pipelines CI/CD.
        </p>
      </div>

      <div className="topbar-right">
        <div className="badge-group">
          {isDemo ? (
            <span className="demo-badge-pill" title="Données fictives d'illustration">
              <span className="badge-dot warning" /> MODE DÉMO
            </span>
          ) : (
            <span className="live-badge-pill" title="Rapports réels locaux Surefire & Quality Guardian">
              <span className="badge-dot active" /> RAPPORTS RÉELS LOCAUX
            </span>
          )}

          <span className="commit-badge" title={git.commitMessage}>
            <span className="commit-icon">⌥</span> {git.commitSha || 'local'}
          </span>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={onToggleDemo}
            title={isDemo ? 'Basculer vers les rapports réels' : 'Basculer vers le mode démo'}
          >
            {isDemo ? 'Charger données réelles' : 'Voir mode démo'}
          </button>

          <button
            type="button"
            className="primary-btn"
            onClick={onRefresh}
            disabled={isLoading}
            title="Recharger le rapport sans recharger la page"
          >
            {isLoading ? '⟳ Chargement...' : '↻ Actualiser'}
          </button>
        </div>
      </div>

      <div className="metadata-bar">
        <span>
          <strong>Dernière actualisation :</strong> {formatRelativeDate(generatedAt)}
        </span>
        <span className="separator">•</span>
        <span>
          <strong>Commit :</strong> {git.commitSha} ({git.author}) — &ldquo;{git.commitMessage}&rdquo;
        </span>
      </div>
    </header>
  );
};
