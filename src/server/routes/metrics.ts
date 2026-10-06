import { Router } from 'express';
import { z } from 'zod';
import type { FilterParams } from '../../shared/metrics';
import { AppError } from '../errors';
import { applyAuthorMap, extractRawAuthors, mergeAuthorMaps, parseMailmap } from '../services/authorMerge';
import { calculateMetrics, filterCommits } from '../services/metricsService';
import type { RepositoryStore } from '../state/repositoryStore';

const filterSchema = z
  .object({
    startTs: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .optional(),
    endTs: z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .optional(),
    authorIds: z.string().optional(),
    paths: z.string().optional(),
    hashes: z.string().optional(),
  })
  .strict();

const authorMapSchema = z.object({
  map: z.record(z.object({ id: z.string(), name: z.string(), email: z.string() })),
});

export function createMetricsRouter(store: RepositoryStore): Router {
  const router = Router();

  router.get('/:repoId/analysis', (request, response, next) => {
    try {
      const repo = store.getById(request.params.repoId);
      const parsed = filterSchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, 'INVALID_FILTER', 'Invalid filter parameters.');
      }
      const { startTs, endTs, authorIds: authorIdsStr, paths: pathsStr, hashes: hashesStr } = parsed.data;
      const hasFilter = startTs !== undefined || endTs !== undefined || authorIdsStr || pathsStr || hashesStr;
      if (!hasFilter) {
        response.json(repo.analysis);
        return;
      }
      const filter: FilterParams = {
        startTs,
        endTs,
        authorIds: authorIdsStr ? authorIdsStr.split(',').filter(Boolean) : undefined,
        paths: pathsStr ? pathsStr.split(',').filter(Boolean) : undefined,
        hashes: hashesStr ? hashesStr.split(',').filter(Boolean) : undefined,
      };
      const mergedCommits = applyAuthorMap(repo.commits, repo.authorMap);
      const filtered = filterCommits(mergedCommits, filter);
      const filteredAnalysis = calculateMetrics(filtered, repo.analysis.repository);
      response.json(filteredAnalysis);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:repoId/commits/:hash/metrics', (request, response, next) => {
    try {
      const repo = store.getById(request.params.repoId);
      const commit = repo.analysis.commits.find((item) => item.hash === request.params.hash);
      if (!commit) {
        throw new AppError(404, 'COMMIT_NOT_FOUND', 'That commit is not in the analyzed history.');
      }
      response.json(commit);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:repoId/authors', (request, response, next) => {
    try {
      const repo = store.getById(request.params.repoId);
      const rawAuthors = extractRawAuthors(repo.commits);
      response.json({ rawAuthors, authorMap: repo.authorMap });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:repoId/author-map', async (request, response, next) => {
    try {
      const repo = store.getById(request.params.repoId);
      const repoId = request.params.repoId;
      const parsed = authorMapSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, 'INVALID_REQUEST', 'Provide a valid author map object.');
      }
      const mailmap = await parseMailmap(repo.repositoryPath);
      const newAuthorMap = mergeAuthorMaps(mailmap, parsed.data.map);
      store.setAuthorMap(repoId, newAuthorMap);
      const mergedCommits = applyAuthorMap(repo.commits, newAuthorMap);
      const newAnalysis = calculateMetrics(mergedCommits, repo.analysis.repository);
      store.setAnalysis(repoId, newAnalysis);
      response.json(newAnalysis);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
