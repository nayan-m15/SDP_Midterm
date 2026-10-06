import { rm } from 'node:fs/promises';
import type { RepositoryAnalysis } from '../../shared/metrics';
import { AppError } from '../errors';

export interface ActiveRepository {
  containerPath: string;
  repositoryPath: string;
  analysis: RepositoryAnalysis;
}

export class RepositoryStore {
  private active?: ActiveRepository;
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

  async replace(next: ActiveRepository): Promise<void> {
    const previous = this.active;
    this.active = next;
    if (previous?.containerPath && previous.containerPath !== next.containerPath) {
      await rm(previous.containerPath, { recursive: true, force: true }).catch((error) => {
        console.error('Could not remove the previous repository workspace.', error);
      });
    }
  }

  get(): ActiveRepository {
    if (!this.active) {
      throw new AppError(404, 'NO_ACTIVE_REPOSITORY', 'Import a repository before requesting metrics.');
    }
    return this.active;
  }

  async clear(): Promise<void> {
    const previous = this.active;
    this.active = undefined;
    this.importing = false;
    if (previous) await rm(previous.containerPath, { recursive: true, force: true });
  }
}
