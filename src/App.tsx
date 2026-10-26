import { useState, useEffect, useCallback } from 'react';
import './App.css';
import type { TestCase, TestOpsReport, TestSource } from './types/testops';
import { fetchTestOpsReport } from './services/reportService';
import { Header } from './components/Header';
import { MetricCards } from './components/MetricCards';
import { SourceBreakdown } from './components/SourceBreakdown';
import { TestRunsTable } from './components/TestRunsTable';
import { TestDetailModal } from './components/TestDetailModal';
import { StatusBanner } from './components/StatusBanner';

export function App() {
  const [report, setReport] = useState<TestOpsReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const [isEmpty, setIsEmpty] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTestCase, setSelectedTestCase] = useState<
    (TestCase & { suiteName: string; source: TestSource }) | null
  >(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'sources' | 'history'>('overview');

  const refreshData = useCallback(async (forceDemo: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchTestOpsReport(forceDemo);
      setReport(result.report);
      setIsDemo(result.isDemo);
      setIsEmpty(result.isEmpty);
      if (result.error) {
        setError(result.error);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur imprévue');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    fetchTestOpsReport(false).then((result) => {
      if (ignore) return;
      setReport(result.report);
      setIsDemo(result.isDemo);
      setIsEmpty(result.isEmpty);
      if (result.error) {
        setError(result.error);
      }
      setIsLoading(false);
    }).catch((err: unknown) => {
      if (ignore) return;
      setError(err instanceof Error ? err.message : 'Erreur imprévue');
      setIsLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, []);

  const handleToggleDemo = () => {
    const nextDemoState = !isDemo;
    setIsDemo(nextDemoState);
    refreshData(nextDemoState);
  };

  return (
    <main className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">T</div>
          <div>
            <strong>Marketplace TestOps</strong>
            <span>Harness & Quality Eng.</span>
          </div>
        </div>

        <div className="nav-label">ESPACE DE TRAVAIL</div>
        <nav aria-label="Navigation principale">
          <button
            type="button"
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            ▦ <span>Vue d&apos;ensemble</span>
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'sources' ? 'active' : ''}`}
            onClick={() => setActiveTab('sources')}
          >
            ⑂ <span>Sources & Suites</span>
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            ◷ <span>Registre des tests</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <span className={`online-dot ${isDemo ? 'warning' : 'active'}`} />
          <span>{isDemo ? 'Données démo' : 'Rapports réels'}</span>
          <span className={`demo-badge ${isDemo ? 'warning' : 'real'}`}>
            {isDemo ? 'DÉMO' : 'LOCAL'}
          </span>
        </div>
      </aside>

      <section className="main-content">
        {report && (
          <Header
            generatedAt={report.generatedAt}
            git={report.git}
            isDemo={isDemo}
            isLoading={isLoading}
            onRefresh={() => refreshData(isDemo)}
            onToggleDemo={handleToggleDemo}
          />
        )}

        <StatusBanner
          isDemo={isDemo}
          isEmpty={isEmpty}
          error={error}
          onRefresh={() => refreshData(isDemo)}
        />

        {report && (
          <>
            <div style={{ display: activeTab === 'overview' ? 'block' : 'none' }}>
              <MetricCards summary={report.summary} suites={report.suites} />
              <div className="section-spacer" />
              <SourceBreakdown
                suites={report.suites}
                onSelectTestCase={(tc) => setSelectedTestCase(tc)}
              />
              <div className="section-spacer" />
              <TestRunsTable
                suites={report.suites}
                onSelectTestCase={(tc) => setSelectedTestCase(tc)}
              />
            </div>

            <div style={{ display: activeTab === 'sources' ? 'block' : 'none' }}>
              <SourceBreakdown
                suites={report.suites}
                onSelectTestCase={(tc) => setSelectedTestCase(tc)}
              />
            </div>

            <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
              <TestRunsTable
                suites={report.suites}
                onSelectTestCase={(tc) => setSelectedTestCase(tc)}
              />
            </div>
          </>
        )}

        <footer>
          Marketplace TestOps Dashboard • Développé pour portfolio QA Automation & Harness Engineering •
          Sources : Maven Surefire XML, Quality Guardian JSON, GitHub Actions CI
        </footer>
      </section>

      <TestDetailModal
        testCase={selectedTestCase}
        onClose={() => setSelectedTestCase(null)}
      />
    </main>
  );
}

export default App;
