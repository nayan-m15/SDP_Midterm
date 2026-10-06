import { rm } from 'node:fs/promises';
import type { AuthorMap, HistoryCommit, RepositoryAnalysis, RepositoryListItem } from '../../shared/metrics';
import { AppError } from '../errors';

export interface ActiveRepository {
  containerPath: string;
  repositoryPath: string;
  analysis: RepositoryAnalysis;
  commits: HistoryCommit[];
  authorMap: AuthorMap;
}

export class RepositoryStore {
  private repos = new Map<string, ActiveRepository>();
  private importing = false;

  beginImport(): void {
    if (this.importing) {
      throw new AppError(409, 'IMPORT_IN_PROGRESS', 'Another repository import is already in progress.');
    }
    this.importing = true;
  }

  endImport(): void {
    this.importing = false;
  }

  add(repo: ActiveRepository): void {
    this.repos.set(repo.analysis.repository.id, repo);
  }

  getById(id: string): ActiveRepository {
    const repo = this.repos.get(id);
    if (!repo) {
      throw new AppError(404, 'REPOSITORY_NOT_FOUND', 'The requested repository does not exist.');
    }
    return repo;
  }

  list(): RepositoryListItem[] {
    return [...this.repos.values()].map((repo) => ({
      id: repo.analysis.repository.id,
      name: repo.analysis.repository.name,
      source: repo.analysis.repository.source,
      ref: repo.analysis.repository.ref,
      resolvedCommit: repo.analysis.repository.resolvedCommit,
      commitCount: repo.analysis.commitCount,
    }));
  }

  async remove(id: string): Promise<void> {
    const repo = this.repos.get(id);
    if (!repo) {
      throw new AppError(404, 'REPOSITORY_NOT_FOUND', 'The requested repository does not exist.');
    }
    this.repos.delete(id);
    if (repo.containerPath) {
      await rm(repo.containerPath, { recursive: true, force: true }).catch((error) => {
        console.error('Could not remove repository workspace.', error);
      });
    }
  }

  setAuthorMap(id: string, map: AuthorMap): void {
    const repo = this.repos.get(id);
    if (!repo) throw new AppError(404, 'REPOSITORY_NOT_FOUND', 'The requested repository does not exist.');
    this.repos.set(id, { ...repo, authorMap: map });
  }

  setAnalysis(id: string, analysis: RepositoryAnalysis): void {
    const repo = this.repos.get(id);
    if (!repo) throw new AppError(404, 'REPOSITORY_NOT_FOUND', 'The requested repository does not exist.');
    this.repos.set(id, { ...repo, analysis });
  }

  async clear(): Promise<void> {
    const repos = [...this.repos.values()];
    this.repos.clear();
    this.importing = false;
    await Promise.all(
      repos
        .filter((repo) => repo.containerPath)
        .map((repo) => rm(repo.containerPath, { recursive: true, force: true }).catch(() => {})),
    );
  }
}
