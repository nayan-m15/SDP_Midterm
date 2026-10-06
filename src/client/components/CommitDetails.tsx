import { useState } from 'react';
import type { CommitSummary } from '../../shared/metrics';
import { getCommitMetrics } from '../api';

export function CommitDetails({ repoId, commits, onError }: { repoId: string; commits: CommitSummary[]; onError(message: string): void }) {
  const [selected, setSelected] = useState<CommitSummary | null>(null);
  const [loadingHash, setLoadingHash] = useState<string | null>(null);

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
        <div className="commit-list">
          {commits.slice(0, 20).map((commit) => (
            <button type="button" key={commit.hash} onClick={() => selectCommit(commit.hash)}>
              <code>{commit.hash.slice(0, 8)}</code>
              <span>{commit.author.name}</span>
              <small>{new Date(commit.committerTimestamp * 1000).toLocaleDateString()}</small>
              <b>{loadingHash === commit.hash ? '…' : commit.root.churn.toLocaleString()}</b>
            </button>
          ))}
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
