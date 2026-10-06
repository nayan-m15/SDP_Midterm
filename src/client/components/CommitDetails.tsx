import { useEffect, useState } from 'react';
import type { CommitSummary } from '../../shared/metrics';
import { getCommitMetrics } from '../api';

export function CommitDetails({
  repoId,
  commits,
  totalCommits,
  onLoadMore,
  onError,
}: {
  repoId: string;
  commits: CommitSummary[];
  totalCommits: number;
  onLoadMore?: () => Promise<CommitSummary[]>;
  onError(message: string): void;
}) {
  const [allCommits, setAllCommits] = useState<CommitSummary[]>(commits);
  const [selected, setSelected] = useState<CommitSummary | null>(null);
  const [loadingHash, setLoadingHash] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Reset whenever the parent passes a fresh page (filter / repo change).
  useEffect(() => { setAllCommits(commits); }, [commits]);

  async function selectCommit(hash: string) {
    setLoadingHash(hash);
    try {
      setSelected(await getCommitMetrics(repoId, hash));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not load commit metrics.');
    } finally {
      setLoadingHash(null);
    }
  }

  async function copyHash(hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(hash);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard not available (e.g. non-secure context)
    }
  }

  async function handleLoadMore() {
    if (!onLoadMore) return;
    setLoadingMore(true);
    const more = await onLoadMore();
    setAllCommits((prev) => [...prev, ...more]);
    setLoadingMore(false);
  }

  const hasMore = allCommits.length < totalCommits;

  return (
    <section className="panel commits-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">History</span>
          <h2>Recent analyzed commits</h2>
        </div>
        <span className="legend-note">Merge commits excluded</span>
      </div>
      <div className="commit-layout">
        <div>
          <div className="commit-list">
            {allCommits.map((commit) => (
              <button type="button" key={commit.hash} onClick={() => selectCommit(commit.hash)}>
                <span
                  className="hash-copy-btn"
                  role="button"
                  tabIndex={0}
                  title="Copy full hash"
                  onClick={(e) => { e.stopPropagation(); void copyHash(commit.hash); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void copyHash(commit.hash); } }}
                >
                  {copied === commit.hash
                    ? <span className="copied-badge">Copied!</span>
                    : <code>{commit.hash.slice(0, 8)}</code>}
                </span>
                <span>{commit.author.name}</span>
                <small>{new Date(commit.committerTimestamp * 1000).toLocaleDateString()}</small>
                <b>{loadingHash === commit.hash ? '…' : commit.root.churn.toLocaleString()}</b>
              </button>
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              className="load-more-btn"
              disabled={loadingMore}
              onClick={() => void handleLoadMore()}
            >
              {loadingMore ? 'Loading…' : `Load more (${(totalCommits - allCommits.length).toLocaleString()} remaining)`}
            </button>
          )}
        </div>
        <div className="commit-detail">
          {selected ? (
            <>
              <span className="eyebrow">Commit {selected.hash.slice(0, 12)}</span>
              <h3>{selected.root.churn.toLocaleString()} changed lines</h3>
              <p>{selected.root.added.toLocaleString()} added · {selected.root.removed.toLocaleString()} removed</p>
              <div className="changed-paths">
                {selected.files.slice(0, 12).map((file) => (
                  <div key={file.path}>
                    <code>{file.path}</code>
                    <span>+{file.added} −{file.removed}</span>
                  </div>
                ))}
                {selected.files.length === 0 && <span>No text-file line changes.</span>}
              </div>
            </>
          ) : (
            <div className="commit-placeholder">
              <strong>Select a commit</strong>
              <span>Inspect its file and directory line metrics.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
