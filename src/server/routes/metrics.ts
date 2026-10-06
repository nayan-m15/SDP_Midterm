import { Router } from 'express';
import { AppError } from '../errors';
import type { RepositoryStore } from '../state/repositoryStore';

export function createMetricsRouter(store: RepositoryStore): Router {
  const router = Router();

  router.get('/analysis', (_request, response, next) => {
    try {
      response.json(store.get().analysis);
    } catch (error) {
      next(error);
    }
  });

  router.get('/commits/:hash/metrics', (request, response, next) => {
    try {
      const analysis = store.get().analysis;
      const commit = analysis.commits.find((item) => item.hash === request.params.hash);
      if (!commit) {
        throw new AppError(404, 'COMMIT_NOT_FOUND', 'That commit is not in the analyzed history.');
      }
      response.json(commit);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
