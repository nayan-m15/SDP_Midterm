import { useState, type FormEvent } from 'react';
import { cloneRepository, uploadRepository } from '../api';

type ImportMode = 'clone' | 'upload';

interface IngestionPanelProps {
  busy: boolean;
  onBusyChange(value: boolean): void;
  onImported(repoId: string): Promise<void>;
  onError(message: string): void;
}

export function IngestionPanel({
  busy,
  onBusyChange,
  onImported,
  onError,
}: IngestionPanelProps) {
  const [mode, setMode] = useState<ImportMode>('clone');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [ref, setRef] = useState('HEAD');

  async function submit(event: FormEvent) {
    event.preventDefault();
    onBusyChange(true);
    try {
      const result = mode === 'clone'
        ? await cloneRepository(url, ref.trim())
        : await uploadRepository(
            file ?? (() => { throw new Error('Choose a repository ZIP to upload.'); })(),
            ref.trim(),
          );
      await onImported(result.id);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Repository import failed.');
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <section className="ingestion-panel" aria-labelledby="import-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Start an analysis</span>
          <h2 id="import-title">Import repository</h2>
        </div>
        <div className="mode-switch" aria-label="Repository source">
          <button
            type="button"
            className={mode === 'clone' ? 'active' : ''}
            onClick={() => setMode('clone')}
            disabled={busy}
          >
            Remote URL
          </button>
          <button
            type="button"
            className={mode === 'upload' ? 'active' : ''}
            onClick={() => setMode('upload')}
            disabled={busy}
          >
            ZIP upload
          </button>
        </div>
      </div>

      <form onSubmit={submit} className="import-form">
        {mode === 'clone' ? (
          <label className="field field-wide" key="clone-source">
            <span>Git repository URL</span>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://github.com/owner/repository.git"
              required
              disabled={busy}
            />
          </label>
        ) : (
          <label className="field field-wide file-field" key="upload-source">
            <span>Repository ZIP</span>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              required
              disabled={busy}
            />
          </label>
        )}
        <label className="field ref-field">
          <span>Reference</span>
          <input
            value={ref}
            onChange={(event) => setRef(event.target.value)}
            placeholder="HEAD"
            maxLength={200}
            disabled={busy}
          />
        </label>
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? <><span className="spinner" /> Analyzing history…</> : 'Analyze repository'}
        </button>
      </form>
      <p className="helper-text">
        Full history is analyzed for Git working-tree ZIPs. Source-code ZIPs are analyzed as a single snapshot commit.
      </p>
    </section>
  );
}
