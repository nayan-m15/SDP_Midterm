import { useEffect, useRef, useState } from 'react';
import type { FilterParams, RepositoryAnalysis, RepositoryListItem } from '../shared/metrics';
import { getAnalysis, listRepositories } from './api';
import { AuthorMergePanel } from './components/AuthorMergePanel';
import { AuthorMetrics } from './components/AuthorMetrics';
import { CommitDetails } from './components/CommitDetails';
import { ErrorBanner } from './components/ErrorBanner';
import { FilterPanel } from './components/FilterPanel';
import { IngestionPanel } from './components/IngestionPanel';
import { MetricsTable } from './components/MetricsTable';
import { RepositoryList } from './components/RepositoryList';
import { RepositorySummary } from './components/RepositorySummary';

export function App() {
  const [repositories, setRepositories] = useState<RepositoryListItem[]>([]);
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(null);
  const [filter, setFilter] = useState<FilterParams>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tableView, setTableView] = useState<'files' | 'directories'>('files');
  const filterDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refreshRepos(): Promise<RepositoryListItem[]> {
    try {
      const repos = await listRepositories();
      setRepositories(repos);
      return repos;
    } catch {
      return [];
    }
  }

  async function loadAnalysis(repoId: string, currentFilter: FilterParams = {}) {
    try {
      const result = await getAnalysis(repoId, currentFilter);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analysis.');
      setAnalysis(null);
    }
  }

  useEffect(() => {
    void refreshRepos().then((repos) => {
      if (repos.length > 0) {
        const id = repos[0].id;
        setActiveRepoId(id);
        void loadAnalysis(id, {});
      }
    });
  }, []);

  async function handleImported(repoId: string) {
    const repos = await refreshRepos();
    setRepositories(repos);
    setActiveRepoId(repoId);
    setFilter({});
    setAnalysis(null);
    await loadAnalysis(repoId, {});
  }

  function handleSelectRepo(id: string) {
    if (id === activeRepoId) return;
    if (filterDebounce.current) clearTimeout(filterDebounce.current);
    setActiveRepoId(id);
    setFilter({});
    setAnalysis(null);
    void loadAnalysis(id, {});
  }

  async function handleDeleteRepo(id: string) {
    const wasActive = id === activeRepoId;
    const repos = await refreshRepos();
    if (wasActive) {
      const first = repos[0];
      if (first) {
        setActiveRepoId(first.id);
        setFilter({});
        await loadAnalysis(first.id, {});
      } else {
        setActiveRepoId(null);
        setAnalysis(null);
      }
    }
  }

  function handleFilterChange(newFilter: FilterParams) {
    setFilter(newFilter);
    if (!activeRepoId) return;
    if (filterDebounce.current) clearTimeout(filterDebounce.current);
    filterDebounce.current = setTimeout(() => {
      void loadAnalysis(activeRepoId, newFilter);
    }, 400);
  }

  const repoCount = repositories.length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="RAT home">
          <span className="brand-mark">R</span>
          <span>
            <strong>RAT</strong>
            <small>Repo Analysis Tool</small>
          </span>
        </a>
        <div className="status-pill">
          <span />
          {repoCount > 0 ? `${repoCount} repo${repoCount === 1 ? '' : 's'} imported` : 'No repositories'}
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <span className="eyebrow">Repository intelligence</span>
          <h1>
            See where your code
            <br />
            <em>really changes.</em>
          </h1>
          <p>Measure growth, churn, volatility, and ownership across an entire Git history.</p>
        </section>

        {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

        <IngestionPanel busy={busy} onBusyChange={setBusy} onImported={handleImported} onError={setError} />

        {repositories.length > 0 && (
          <RepositoryList
            repositories={repositories}
            activeId={activeRepoId}
            onSelect={handleSelectRepo}
            onDeleted={(id) => void handleDeleteRepo(id)}
            onError={setError}
          />
        )}

        {analysis && activeRepoId ? (
          <>
            <FilterPanel
              authors={analysis.authors}
              commits={analysis.commits}
              filter={filter}
              onFilterChange={handleFilterChange}
            />
            <AuthorMergePanel
              repoId={activeRepoId}
              onMerged={async () => { await loadAnalysis(activeRepoId, filter); }}
              onError={setError}
            />
            <div className="dashboard">
              <RepositorySummary analysis={analysis} />
              <AuthorMetrics authors={analysis.authors} />
              <div className="table-tabs" role="tablist" aria-label="Metric object type">
                <button
                  className={tableView === 'files' ? 'active' : ''}
                  onClick={() => setTableView('files')}
                  role="tab"
                >
                  Files
                </button>
                <button
                  className={tableView === 'directories' ? 'active' : ''}
                  onClick={() => setTableView('directories')}
                  role="tab"
                >
                  Directories
                </button>
              </div>
              <MetricsTable
                title={tableView === 'files' ? 'File metrics' : 'Directory metrics'}
                items={tableView === 'files' ? analysis.files : analysis.directories}
              />
              <CommitDetails repoId={activeRepoId} commits={analysis.commits} onError={setError} />
            </div>
          </>
        ) : activeRepoId ? (
          <section className="empty-state">
            <div className="empty-graphic">
              <span />
              <span />
              <span />
            </div>
            <h2>Loading analysis…</h2>
          </section>
        ) : (
          <section className="empty-state">
            <div className="empty-graphic">
              <span />
              <span />
              <span />
            </div>
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
