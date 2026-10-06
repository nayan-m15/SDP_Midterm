import { useEffect, useState } from 'react';
import type { AuthorMetric, CommitSummary, FilterParams } from '../../shared/metrics';

interface FilterPanelProps {
  authors: AuthorMetric[];
  commits: CommitSummary[];
  filter: FilterParams;
  commitCount?: number;    // filtered commit count (after applying current filter)
  totalCommits?: number;  // unfiltered total
  onFilterChange(filter: FilterParams): void;
}

function tsToDateString(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function dateStringToTs(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

export function FilterPanel({ authors, commits, filter, commitCount, totalCommits, onFilterChange }: FilterPanelProps) {
  const [fromDate, setFromDate] = useState(filter.startTs ? tsToDateString(filter.startTs) : '');
  const [toDate, setToDate] = useState(filter.endTs ? tsToDateString(filter.endTs) : '');
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>(filter.authorIds ?? []);
  const [pathInput, setPathInput] = useState(filter.paths?.join(', ') ?? '');
  const [selectedHashes, setSelectedHashes] = useState<string[]>(filter.hashes ?? []);
  const [commitSearch, setCommitSearch] = useState('');

  const activeFilterCount = [
    filter.startTs,
    filter.endTs,
    filter.authorIds?.length,
    filter.paths?.length,
    filter.hashes?.length,
  ].filter(Boolean).length;
  const isActive = activeFilterCount > 0;

  useEffect(() => {
    setFromDate(filter.startTs ? tsToDateString(filter.startTs) : '');
    setToDate(filter.endTs ? tsToDateString(filter.endTs) : '');
    setSelectedAuthors(filter.authorIds ?? []);
    setPathInput(filter.paths?.join(', ') ?? '');
    setSelectedHashes(filter.hashes ?? []);
    setCommitSearch('');
  }, [filter]);

  function apply() {
    const newFilter: FilterParams = {};
    if (fromDate) newFilter.startTs = dateStringToTs(fromDate);
    if (toDate) newFilter.endTs = dateStringToTs(toDate);
    if (selectedAuthors.length > 0) newFilter.authorIds = selectedAuthors;
    if (pathInput.trim()) newFilter.paths = pathInput.split(',').map((p) => p.trim()).filter(Boolean);
    if (selectedHashes.length > 0) newFilter.hashes = selectedHashes;
    onFilterChange(newFilter);
  }

  function reset() {
    setFromDate('');
    setToDate('');
    setSelectedAuthors([]);
    setPathInput('');
    setSelectedHashes([]);
    onFilterChange({});
  }

  function toggleAuthor(id: string) {
    setSelectedAuthors((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  function toggleHash(hash: string) {
    setSelectedHashes((prev) => (prev.includes(hash) ? prev.filter((h) => h !== hash) : [...prev, hash]));
  }

  return (
    <section className="panel filter-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Analysis scope</span>
          <h2>
            Filter commits{' '}
            {isActive && <span className="filter-active-badge">Active</span>}
          </h2>
        </div>
      </div>

      <div className="filter-body">
        <div className={`reset-filter-bar${isActive ? ' active' : ''}`} aria-label="Reset filters">
          <div>
            <span className="eyebrow">Reset filters</span>
            <strong>
              {isActive
                ? `${activeFilterCount} scope filter${activeFilterCount === 1 ? '' : 's'} active`
                : 'Full history selected'}
            </strong>
            <small>
              {totalCommits !== undefined
                ? isActive
                  ? `${(commitCount ?? 0).toLocaleString()} / ${totalCommits.toLocaleString()} commits in scope`
                  : `${totalCommits.toLocaleString()} commits`
                : isActive
                  ? 'Clear the active analysis scope.'
                  : 'Metrics include every analyzed commit.'}
            </small>
          </div>
          <button type="button" className="secondary-button" onClick={reset} disabled={!isActive}>
            Reset
          </button>
        </div>

        <div className="filter-row">
          <div className="field">
            <span>From date (inclusive)</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="field">
            <span>To date (exclusive)</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="field filter-path-field">
            <span>File or directory path (comma-separated)</span>
            <input
              type="text"
              placeholder="e.g. src/main.c, lib/"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
            />
          </div>
        </div>

        {authors.length > 0 && (
          <div className="filter-section">
            <strong>Filter by author</strong>
            <div className="filter-checkboxes">
              {authors.map((a) => (
                <label key={a.author.id} className="filter-check">
                  <input
                    type="checkbox"
                    checked={selectedAuthors.includes(a.author.id)}
                    onChange={() => toggleAuthor(a.author.id)}
                  />
                  {a.author.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {commits.length > 0 && (
          <div className="filter-section">
            <strong>Select specific commits ({selectedHashes.length} selected)</strong>
            <input
              type="search"
              className="commit-search"
              placeholder="Search by hash or author…"
              value={commitSearch}
              onChange={(e) => setCommitSearch(e.target.value)}
            />
            <div className="filter-commit-list">
              {commits
                .filter(
                  (c) =>
                    !commitSearch ||
                    c.hash.startsWith(commitSearch.toLowerCase()) ||
                    c.author.name.toLowerCase().includes(commitSearch.toLowerCase()),
                )
                .slice(0, 50)
                .map((c) => (
                  <label key={c.hash} className="filter-check filter-check-commit">
                    <input
                      type="checkbox"
                      checked={selectedHashes.includes(c.hash)}
                      onChange={() => toggleHash(c.hash)}
                    />
                    <code>{c.hash.slice(0, 8)}</code>
                    <span>{c.author.name}</span>
                    <small>{new Date(c.committerTimestamp * 1000).toLocaleDateString()}</small>
                  </label>
                ))}
            </div>
          </div>
        )}

        <div className="filter-actions">
          <button type="button" className="primary-button" onClick={apply}>
            Apply filter
          </button>
        </div>
      </div>
    </section>
  );
}
