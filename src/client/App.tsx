import { useEffect, useState } from 'react';
import type { RepositoryAnalysis } from '../shared/metrics';
import { getAnalysis } from './api';
import { AuthorMetrics } from './components/AuthorMetrics';
import { CommitDetails } from './components/CommitDetails';
import { ErrorBanner } from './components/ErrorBanner';
import { IngestionPanel } from './components/IngestionPanel';
import { MetricsTable } from './components/MetricsTable';
import { RepositorySummary } from './components/RepositorySummary';

export function App() {
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tableView, setTableView] = useState<'files' | 'directories'>('files');

  async function refreshAnalysis() {
    setAnalysis(await getAnalysis());
  }

  useEffect(() => {
    getAnalysis().then(setAnalysis).catch(() => undefined);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="RAT home">
          <span className="brand-mark">R</span>
          <span><strong>RAT</strong><small>Repo Analysis Tool</small></span>
        </a>
        <div className="status-pill"><span /> Local analysis</div>
      </header>

      <main id="top">
        <section className="hero">
          <span className="eyebrow">Repository intelligence</span>
          <h1>See where your code<br /><em>really changes.</em></h1>
          <p>Measure growth, churn, volatility, and ownership across an entire Git history.</p>
        </section>

        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
        <IngestionPanel
          busy={busy}
          onBusyChange={setBusy}
          onImported={refreshAnalysis}
          onError={setError}
        />

        {analysis ? (
          <div className="dashboard">
            <RepositorySummary analysis={analysis} />
            <AuthorMetrics authors={analysis.authors} />
            <div className="table-tabs" role="tablist" aria-label="Metric object type">
              <button className={tableView === 'files' ? 'active' : ''} onClick={() => setTableView('files')} role="tab">Files</button>
              <button className={tableView === 'directories' ? 'active' : ''} onClick={() => setTableView('directories')} role="tab">Directories</button>
            </div>
            <MetricsTable
              title={tableView === 'files' ? 'File metrics' : 'Directory metrics'}
              items={tableView === 'files' ? analysis.files : analysis.directories}
            />
            <CommitDetails commits={analysis.commits} onError={setError} />
          </div>
        ) : (
          <section className="empty-state">
            <div className="empty-graphic"><span /><span /><span /></div>
            <h2>Your repository story starts here</h2>
            <p>Import a Git repository to calculate metrics across files, directories, authors, and commits.</p>
          </section>
        )}
      </main>

      <footer>
        <span>RAT · COMS3011A</span>
        <span>Non-merge commits · Git-native rename detection</span>
      </footer>
    </div>
  );
}
