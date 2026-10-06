import { useEffect, useState } from 'react';
import type { AuthorIdentity, AuthorMap, RawAuthor } from '../../shared/metrics';
import { getRawAuthors, updateAuthorMap } from '../api';

interface AuthorMergePanelProps {
  repoId: string;
  onMerged(): Promise<void>;
  onError(message: string): void;
}

export function AuthorMergePanel({ repoId, onMerged, onError }: AuthorMergePanelProps) {
  const [open, setOpen] = useState(false);
  const [rawAuthors, setRawAuthors] = useState<RawAuthor[]>([]);
  const [baseMap, setBaseMap] = useState<AuthorMap>({});
  const [pending, setPending] = useState<AuthorMap>({});
  const [saving, setSaving] = useState(false);

  // onError is a stable callback prop; intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    getRawAuthors(repoId)
      .then(({ rawAuthors: ra, authorMap: am }) => {
        setRawAuthors(ra);
        setBaseMap(am);
        setPending({ ...am });
      })
      .catch((err: unknown) => onError(err instanceof Error ? err.message : 'Could not load authors.'));
  }, [open, repoId]);

  async function save() {
    setSaving(true);
    try {
      // Only send the manual (non-mailmap) overrides — PUT handler merges with mailmap itself
      await updateAuthorMap(repoId, pending);
      await onMerged();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to update author map.');
    } finally {
      setSaving(false);
    }
  }

  function mapAuthor(rawId: string, canonicalId: string) {
    const next = { ...pending };
    if (canonicalId === '') {
      delete next[rawId];
    } else {
      const target = rawAuthors.find((a) => a.id === canonicalId);
      if (!target) return;
      const canonical: AuthorIdentity = { id: target.id, name: target.name, email: target.email };
      next[rawId] = canonical;
    }
    setPending(next);
  }

  const hasChanges = JSON.stringify(pending) !== JSON.stringify(baseMap);

  return (
    <section className="panel filter-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Author identity</span>
          <h2>Merge authors</h2>
        </div>
        <button type="button" className="toggle-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Collapse ▲' : 'Expand ▼'}
        </button>
      </div>

      {open && (
        <div className="filter-body">
          {rawAuthors.length === 0 ? (
            <p className="empty-copy">Loading authors…</p>
          ) : (
            <>
              <p className="helper-text">
                Map duplicate identities to a single canonical author. The repository .mailmap is applied
                automatically; manual overrides take precedence.
              </p>
              <div className="merge-author-list">
                {rawAuthors.map((author) => (
                  <div key={author.id} className="merge-author-row">
                    <div className="merge-author-info">
                      <strong>{author.name}</strong>
                      <small>
                        {author.email} &middot; {author.commitCount} commits
                      </small>
                    </div>
                    <select
                      value={pending[author.id]?.id ?? ''}
                      onChange={(e) => mapAuthor(author.id, e.target.value)}
                      aria-label={`Map ${author.name} to canonical author`}
                    >
                      <option value="">Use as-is</option>
                      {rawAuthors
                        .filter((a) => a.id !== author.id)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} &lt;{a.email}&gt;
                          </option>
                        ))}
                    </select>
                  </div>
                ))}
              </div>
              {hasChanges && (
                <div className="filter-actions">
                  <button type="button" className="primary-button" onClick={() => void save()} disabled={saving}>
                    {saving ? (
                      <>
                        <span className="spinner" />
                        Saving…
                      </>
                    ) : (
                      'Apply author merges'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
