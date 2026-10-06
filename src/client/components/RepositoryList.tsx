import type { RepositoryListItem } from '../../shared/metrics';
import { deleteRepository } from '../api';

interface RepositoryListProps {
  repositories: RepositoryListItem[];
  activeId: string | null;
  onSelect(id: string): void;
  onDeleted(id: string): void;
  onError(message: string): void;
}

export function RepositoryList({
  repositories,
  activeId,
  onSelect,
  onDeleted,
  onError,
}: RepositoryListProps) {
  if (repositories.length === 0) return null;

  async function remove(event: React.MouseEvent, id: string) {
    event.stopPropagation();
    try {
      await deleteRepository(id);
      onDeleted(id);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to remove repository.');
    }
  }

  return (
    <section className="panel repo-list-panel" aria-label="Imported repositories">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Repositories</span>
          <h2>Imported repositories</h2>
        </div>
        <span className="count-badge">{repositories.length}</span>
      </div>
      <ul className="repo-items" role="listbox" aria-label="Select a repository">
        {repositories.map((repo) => (
          <li key={repo.id} className={`repo-item${repo.id === activeId ? ' active' : ''}`}>
            <button
              type="button"
              role="option"
              aria-selected={repo.id === activeId}
              onClick={() => onSelect(repo.id)}
            >
              <span className="repo-name">{repo.name}</span>
              <span className="repo-meta">
                <code>{repo.resolvedCommit.slice(0, 8)}</code>
                <small>
                  {repo.commitCount.toLocaleString()} commits &middot; {repo.ref} &middot; {repo.source}
                </small>
              </span>
            </button>
            <button
              type="button"
              className="repo-delete"
              aria-label={`Remove ${repo.name}`}
              onClick={(e) => void remove(e, repo.id)}
            >
              &times;
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
