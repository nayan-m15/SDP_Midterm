import type {
  ApiErrorResponse,
  AuthorIdentity,
  AuthorMap,
  CommitSummary,
  FilterParams,
  RawAuthor,
  RepositoryAnalysis,
  RepositoryListItem,
  RepositoryMetadata,
} from '../shared/metrics';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const body = (await response.json()) as ApiErrorResponse;
      message = body.error?.message ?? message;
    } catch {
      // Keep the status-based fallback for non-JSON responses.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export interface ImportResult {
  id: string;
  repository: RepositoryMetadata;
}

export async function cloneRepository(url: string, ref: string): Promise<ImportResult> {
  return request('/api/repositories/clone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...(ref ? { ref } : {}) }),
  });
}

export async function uploadRepository(file: File, ref: string): Promise<ImportResult> {
  const body = new FormData();
  body.append('repository', file);
  if (ref) body.append('ref', ref);
  return request('/api/repositories/upload', { method: 'POST', body });
}

export function listRepositories(): Promise<RepositoryListItem[]> {
  return request('/api/repositories');
}

export async function deleteRepository(repoId: string): Promise<void> {
  await request(`/api/repositories/${encodeURIComponent(repoId)}`, { method: 'DELETE' });
}

export function getAnalysis(repoId: string, filter?: FilterParams): Promise<RepositoryAnalysis> {
  const params = new URLSearchParams();
  if (filter?.startTs !== undefined) params.set('startTs', String(filter.startTs));
  if (filter?.endTs !== undefined) params.set('endTs', String(filter.endTs));
  if (filter?.authorIds?.length) params.set('authorIds', filter.authorIds.join(','));
  if (filter?.paths?.length) params.set('paths', filter.paths.join(','));
  if (filter?.hashes?.length) params.set('hashes', filter.hashes.join(','));
  const qs = params.toString();
  return request(`/api/repositories/${encodeURIComponent(repoId)}/analysis${qs ? `?${qs}` : ''}`);
}

export function getCommitMetrics(repoId: string, hash: string): Promise<CommitSummary> {
  return request(`/api/repositories/${encodeURIComponent(repoId)}/commits/${encodeURIComponent(hash)}/metrics`);
}

export function getRawAuthors(repoId: string): Promise<{ rawAuthors: RawAuthor[]; authorMap: AuthorMap }> {
  return request(`/api/repositories/${encodeURIComponent(repoId)}/authors`);
}

export function updateAuthorMap(repoId: string, map: Record<string, AuthorIdentity>): Promise<RepositoryAnalysis> {
  return request(`/api/repositories/${encodeURIComponent(repoId)}/author-map`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ map }),
  });
}
