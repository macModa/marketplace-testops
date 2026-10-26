
import './App.css'

const runs = [
  { id: '#1042', name: 'Marketplace API — Integration Tests', branch: 'main', status: 'Passed', tests: '42/42', duration: '18.4 s', time: 'Il y a 4 min' },
  { id: '#1041', name: 'Marketplace API — Unit Tests', branch: 'feature/product-dto', status: 'Failed', tests: '38/42', duration: '12.1 s', time: 'Il y a 28 min' },
  { id: '#1040', name: 'Build & Quality Checks', branch: 'main', status: 'Passed', tests: '65/65', duration: '24.7 s', time: 'Il y a 1 h' },
  { id: '#1039', name: 'Authentication API Tests', branch: 'develop', status: 'Running', tests: '12/20', duration: 'En cours', time: 'Il y a 2 h' },
]

function App() {
  return (
    <main className="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">T</div>
          <div>
            <strong>TestOps</strong>
            <span>Engineering Platform</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav>
          <a className="nav-item active" href="#overview">▦ <span>Overview</span></a>
          <a className="nav-item" href="#workflows">⑂ <span>GitHub Workflows</span></a>
          <a className="nav-item" href="#api-tests">⌘ <span>API Tests</span></a>
          <a className="nav-item" href="#history">◷ <span>Run History</span></a>
        </nav>

        <div className="sidebar-bottom">
          <span className="online-dot" />
          <span>Demo environment</span>
          <span className="demo-badge">DEMO</span>
        </div>
      </aside>

      <section className="main-content" id="overview">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Workspace / <strong>Overview</strong></div>
            <h1>Testing overview</h1>
            <p className="subtitle">Monitor your CI/CD pipelines and API quality.</p>
          </div>
          <div className="topbar-right">
            <span className="live-indicator"><span className="online-dot" /> Demo data</span>
            <div className="avatar">HJ</div>
          </div>
        </header>

        <div className="notice">
          <span>ⓘ</span>
          <div>
            <strong>Demo mode is active</strong>
            <p>These sample results are illustrative. No GitHub workflows or API tests have been executed.</p>
          </div>
        </div>

        <section className="metrics">
          <article className="metric-card">
            <div className="metric-top"><span>Total runs</span><span className="metric-icon blue">↗</span></div>
            <div className="metric-value">128</div>
            <div className="metric-foot">Across all demo workflows</div>
          </article>
          <article className="metric-card">
            <div className="metric-top"><span>Success rate</span><span className="metric-icon green">✓</span></div>
            <div className="metric-value">94.2<span className="unit">%</span></div>
            <div className="metric-foot"><span className="positive">+2.4%</span> vs previous period</div>
          </article>
          <article className="metric-card">
            <div className="metric-top"><span>Failed runs</span><span className="metric-icon red">!</span></div>
            <div className="metric-value">7</div>
            <div className="metric-foot">Require investigation</div>
          </article>
          <article className="metric-card">
            <div className="metric-top"><span>Avg. duration</span><span className="metric-icon purple">◷</span></div>
            <div className="metric-value">21.6<span className="unit">s</span></div>
            <div className="metric-foot">Across demo test runs</div>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel chart-panel">
            <div className="panel-heading">
              <div><h2>Execution activity</h2><p>Illustrative runs over the last 7 days</p></div>
              <span className="small-badge">Last 7 days</span>
            </div>
            <div className="chart">
              {[45, 68, 52, 83, 61, 94, 73].map((height, index) => (
                <div className="chart-column" key={index}>
                  <div className="bar-stack">
                    <div className="bar-success" style={{ height: `${height}%` }} />
                    <div className="bar-failed" style={{ height: `${100 - height}%` }} />
                  </div>
                  <span>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]}</span>
                </div>
              ))}
            </div>
            <div className="chart-legend">
              <span><i className="legend-success" /> Passed</span>
              <span><i className="legend-failed" /> Failed</span>
            </div>
          </article>

          <article className="panel quality-panel" id="api-tests">
            <div className="panel-heading">
              <div><h2>API quality</h2><p>Demo test summary</p></div>
              <span className="quality-score">A−</span>
            </div>
            <div className="quality-row"><span>Unit tests</span><strong>96%</strong></div>
            <div className="progress"><div style={{ width: '96%' }} /></div>
            <div className="quality-row"><span>Integration tests</span><strong>88%</strong></div>
            <div className="progress"><div style={{ width: '88%' }} /></div>
            <div className="quality-row"><span>API endpoint checks</span><strong>92%</strong></div>
            <div className="progress"><div style={{ width: '92%' }} /></div>
            <p className="quality-note">Illustrative scores, not measured coverage.</p>
          </article>
        </section>

        <section className="panel runs-panel" id="history">
          <div className="panel-heading">
            <div><h2>Recent test runs</h2><p>Latest workflow and API test activity</p></div>
            <button className="secondary-button" onClick={() => window.location.reload()}>↻ Refresh demo</button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>RUN</th><th>WORKFLOW</th><th>BRANCH</th><th>RESULTS</th><th>DURATION</th><th>STATUS</th></tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="run-id">{run.id}<small>{run.time}</small></td>
                    <td className="workflow-name">{run.name}</td>
                    <td><span className="branch">{run.branch}</span></td>
                    <td>{run.tests}</td>
                    <td>{run.duration}</td>
                    <td><span className={`status status-${run.status.toLowerCase()}`}><i />{run.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">Showing 4 sample runs <span>Source: local demo data</span></div>
        </section>

        <footer>TestOps Dashboard <span>•</span> MVP prototype <span>•</span> Not connected to production systems</footer>
      </section>
    </main>
  )
}

export default App
