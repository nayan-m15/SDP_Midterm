import type { ApiErrorResponse, CommitSummary, RepositoryAnalysis } from '../shared/metrics';

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

export async function cloneRepository(url: string, ref: string): Promise<void> {
  await request('/api/repositories/clone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...(ref ? { ref } : {}) }),
  });
}

export async function uploadRepository(file: File, ref: string): Promise<void> {
  const body = new FormData();
  body.append('repository', file);
  if (ref) body.append('ref', ref);
  await request('/api/repositories/upload', { method: 'POST', body });
}

export function getAnalysis(): Promise<RepositoryAnalysis> {
  return request('/api/analysis');
}

export function getCommitMetrics(hash: string): Promise<CommitSummary> {
  return request(`/api/commits/${encodeURIComponent(hash)}/metrics`);
}
