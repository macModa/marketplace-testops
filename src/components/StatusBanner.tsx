import React from 'react';

interface StatusBannerProps {
  isDemo: boolean;
  isEmpty: boolean;
  error?: string | null;
  onRefresh: () => void;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({
  isDemo,
  isEmpty,
  error,
  onRefresh,
}) => {
  if (error) {
    return (
      <aside className="status-banner error" role="alert">
        <div className="banner-icon">⚠</div>
        <div className="banner-body">
          <strong>Erreur de source de données</strong>
          <p>{error}</p>
          <div className="banner-action">
            <button type="button" className="banner-btn" onClick={onRefresh}>
              ↻ Réessayer
            </button>
          </div>
        </div>
      </aside>
    );
  }

  if (isEmpty) {
    return (
      <aside className="status-banner warning" role="region" aria-label="Avertissement rapports absents">
        <div className="banner-icon">ℹ</div>
        <div className="banner-body">
          <strong>Aucun rapport d&apos;exécution local trouvé</strong>
          <p>
            Le dashboard est configuré pour lire <code>public/data/testops-report.json</code>. Pour collecter et normaliser vos rapports réels depuis le dépôt <code>marketplace</code>, exécutez dans votre terminal PowerShell :
          </p>
          <pre className="command-snippet">
            <code>cd C:\Users\dell\Desktop\6in1\marketplace-testops\frontend ; npm run collect</code>
          </pre>
          <div className="banner-action">
            <button type="button" className="banner-btn" onClick={onRefresh}>
              ↻ Vérifier la présence des données
            </button>
          </div>
        </div>
      </aside>
    );
  }

  if (isDemo) {
    return (
      <aside className="status-banner info" role="status">
        <div className="banner-icon">🧪</div>
        <div className="banner-body">
          <strong>Mode démonstration actif</strong>
          <p>
            Vous visualisez actuellement un échantillon d&apos;exemple d&apos;exécutions de test. Cliquez sur &ldquo;Charger données réelles&rdquo; dans l&apos;en-tête pour afficher les résultats locaux de votre workspace.
          </p>
        </div>
      </aside>
    );
  }

  return null;
};
