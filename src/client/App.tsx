import { useEffect, useRef, useState } from 'react';
import type {
  CommitSummary,
  FilterParams,
  RepositoryAnalysis,
  RepositoryListItem,
  TimeGranularity,
  TimeSeriesResponse,
} from '../shared/metrics';
import { getAnalysis, getCommitPage, getTimeSeries, listRepositories } from './api';
import { ActivityTimeline } from './components/ActivityTimeline';
import { AuthorMergePanel } from './components/AuthorMergePanel';
import { AuthorMetrics } from './components/AuthorMetrics';
import { AuthorTrendChart } from './components/AuthorTrendChart';
import { ChurnGrowthScatter } from './components/ChurnGrowthScatter';
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
  const [timeSeries, setTimeSeries] = useState<TimeSeriesResponse | null>(null);
  const [granularity, setGranularity] = useState<TimeGranularity | 'auto'>('auto');
  const [timeSeriesLoading, setTimeSeriesLoading] = useState(false);
  const [filter, setFilter] = useState<FilterParams>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tableView, setTableView] = useState<'files' | 'directories'>('files');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [commitPage, setCommitPage] = useState(0);
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
    setAnalysisLoading(true);
    try {
      const result = await getAnalysis(repoId, currentFilter);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analysis.');
      setAnalysis(null);
    } finally {
      setAnalysisLoading(false);
    }
  }

  async function loadTimeSeries(
    repoId: string,
    currentFilter: FilterParams = {},
    currentGranularity: TimeGranularity | 'auto' = granularity,
  ) {
    setTimeSeriesLoading(true);
    try {
      const result = await getTimeSeries(repoId, currentFilter, currentGranularity);
      setTimeSeries(result);
    } catch {
      // The timeline is a supplementary view — a failure here should not block the rest of the dashboard.
      setTimeSeries(null);
    } finally {
      setTimeSeriesLoading(false);
    }
  }

  async function loadDashboard(repoId: string, currentFilter: FilterParams = {}) {
    await Promise.all([loadAnalysis(repoId, currentFilter), loadTimeSeries(repoId, currentFilter)]);
  }

  function handleGranularityChange(value: TimeGranularity | 'auto') {
    setGranularity(value);
    if (activeRepoId) void loadTimeSeries(activeRepoId, filter, value);
  }

  useEffect(() => {
    void refreshRepos().then((repos) => {
      if (repos.length > 0) {
        const id = repos[0].id;
        setActiveRepoId(id);
        void loadDashboard(id, {});
      }
    });
  }, []);

  async function handleImported(repoId: string) {
    const repos = await refreshRepos();
    setRepositories(repos);
    setActiveRepoId(repoId);
    setFilter({});
    setCommitPage(0);
    setAnalysis(null);
    setTimeSeries(null);
    await loadDashboard(repoId, {});
  }

  function handleSelectRepo(id: string) {
    if (id === activeRepoId) return;
    if (filterDebounce.current) clearTimeout(filterDebounce.current);
    setActiveRepoId(id);
    setFilter({});
    setCommitPage(0);
    setAnalysis(null);
    setTimeSeries(null);
    void loadDashboard(id, {});
  }

  async function handleDeleteRepo(id: string) {
    const wasActive = id === activeRepoId;
    const repos = await refreshRepos();
    if (wasActive) {
      const first = repos[0];
      if (first) {
        setActiveRepoId(first.id);
        setFilter({});
        setCommitPage(0);
        await loadDashboard(first.id, {});
      } else {
        setActiveRepoId(null);
        setAnalysis(null);
        setTimeSeries(null);
      }
    }
  }

  function handleFilterChange(newFilter: FilterParams) {
    setFilter(newFilter);
    setCommitPage(0);
    if (!activeRepoId) return;
    if (filterDebounce.current) clearTimeout(filterDebounce.current);
    filterDebounce.current = setTimeout(() => {
      void loadDashboard(activeRepoId, newFilter);
    }, 400);
  }

  async function handleLoadMoreCommits(): Promise<CommitSummary[]> {
    if (!activeRepoId) return [];
    const nextPage = commitPage + 1;
    setCommitPage(nextPage);
    try {
      const result = await getCommitPage(activeRepoId, filter, nextPage);
      return result.items;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load commits.');
      return [];
    }
  }

  const activeRepo = repositories.find((r) => r.id === activeRepoId);
  const totalCommits = activeRepo?.commitCount ?? analysis?.commitCount ?? 0;

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

        <div className="workspace-layout">
          <aside className="analysis-sidebar" aria-label="Analysis controls">
            {repositories.length > 0 ? (
              <RepositoryList
                repositories={repositories}
                activeId={activeRepoId}
                onSelect={handleSelectRepo}
                onDeleted={(id) => void handleDeleteRepo(id)}
                onError={setError}
              />
            ) : (
              <section className="panel repo-list-panel" aria-label="Imported repositories">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">Repositories</span>
                    <h2>Imported repositories</h2>
                  </div>
                  <span className="count-badge">0</span>
                </div>
                <p className="empty-copy sidebar-empty-copy">Import a repository to pin it here.</p>
              </section>
            )}


            {analysis && activeRepoId ? (
              <>
                <FilterPanel
                  authors={analysis.authors}
                  commits={analysis.commits}
                  filter={filter}
                  commitCount={analysis.commitCount}
                  totalCommits={totalCommits}
                  onFilterChange={handleFilterChange}
                />
                <AuthorMergePanel
                  repoId={activeRepoId}
                  onMerged={async () => { await loadDashboard(activeRepoId, filter); }}
                  onError={setError}
                />
              </>
            ) : (
              <section className="panel sidebar-placeholder">
                <span className="eyebrow">Analysis scope</span>
                <h2>Waiting for analysis</h2>
                <p>Select or import a repository to filter commits and manage author identities.</p>
              </section>
            )}
          </aside>

          <div className="workspace-main">
            <IngestionPanel busy={busy} onBusyChange={setBusy} onImported={handleImported} onError={setError} />

            {analysis && activeRepoId ? (
              <div className={`dashboard${analysisLoading ? ' loading' : ''}`}>
                <RepositorySummary analysis={analysis} />
                <AuthorMetrics authors={analysis.authors} />
                <ActivityTimeline
                  data={timeSeries}
                  granularity={granularity}
                  loading={timeSeriesLoading}
                  onGranularityChange={handleGranularityChange}
                />
                <AuthorTrendChart data={timeSeries} />
                <ChurnGrowthScatter files={analysis.files} />
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
                <CommitDetails
                  repoId={activeRepoId}
                  commits={analysis.commits}
                  totalCommits={analysis.commitCount}
                  onLoadMore={handleLoadMoreCommits}
                  onError={setError}
                />
              </div>
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
          </div>
        </div>
      </main>

      <footer>
        <span>RAT · COMS3011A</span>
        <span>Non-merge commits · Git-native rename detection</span>
      </footer>
    </div>
  );
}
