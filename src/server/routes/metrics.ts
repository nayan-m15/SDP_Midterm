import { Router } from 'express';
import { z } from 'zod';
import type { FilterParams } from '../../shared/metrics';
import { AppError } from '../errors';
import { applyAuthorMap, extractRawAuthors, mergeAuthorMaps, parseMailmap } from '../services/authorMerge';
import { calculateMetricsAsync, commitToSummary, filterCommits } from '../services/metricsService';
import type { RepositoryStore } from '../state/repositoryStore';

const paginationFields = {
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  pageSize: z.string().regex(/^\d+$/).transform(Number).optional(),
};

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
    ...paginationFields,
  })
  .strict();

const authorMapSchema = z.object({
  map: z.record(z.object({ id: z.string(), name: z.string(), email: z.string() })),
});

function parseFilter(data: z.infer<typeof filterSchema>): FilterParams {
  return {
    startTs: data.startTs,
    endTs: data.endTs,
    authorIds: data.authorIds ? data.authorIds.split(',').filter(Boolean) : undefined,
    paths: data.paths ? data.paths.split(',').filter(Boolean) : undefined,
    hashes: data.hashes ? data.hashes.split(',').filter(Boolean) : undefined,
  };
}

export function createMetricsRouter(store: RepositoryStore): Router {
  const router = Router();

  router.get('/:repoId/analysis', async (request, response, next) => {
    try {
      const repo = store.getById(request.params.repoId);
      const parsed = filterSchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, 'INVALID_FILTER', 'Invalid filter parameters.');
      }

      const pg = parsed.data.page ?? 0;
      const ps = Math.min(parsed.data.pageSize ?? 200, 500);

      const { startTs, endTs, authorIds: authorIdsStr, paths: pathsStr, hashes: hashesStr } = parsed.data;
      const hasFilter = startTs !== undefined || endTs !== undefined || authorIdsStr || pathsStr || hashesStr;

      let analysis = repo.analysis;
      if (hasFilter) {
        const filter = parseFilter(parsed.data);
        const mergedCommits = applyAuthorMap(repo.commits, repo.authorMap);
        const filtered = filterCommits(mergedCommits, filter);
        analysis = await calculateMetricsAsync(filtered, repo.analysis.repository);
      }

      response.json({ ...analysis, commits: analysis.commits.slice(pg * ps, (pg + 1) * ps) });
    } catch (error) {
      next(error);
    }
  });

  // Paginated commits endpoint — does NOT re-run full metric aggregation.
  router.get('/:repoId/commits', (request, response, next) => {
    try {
      const repo = store.getById(request.params.repoId);
      const parsed = filterSchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, 'INVALID_FILTER', 'Invalid filter parameters.');
      }

      const pg = parsed.data.page ?? 0;
      const ps = Math.min(parsed.data.pageSize ?? 200, 500);

      const { startTs, endTs, authorIds: authorIdsStr, paths: pathsStr, hashes: hashesStr } = parsed.data;
      const hasFilter = startTs !== undefined || endTs !== undefined || authorIdsStr || pathsStr || hashesStr;

      const mergedCommits = applyAuthorMap(repo.commits, repo.authorMap);
      const allCommits = hasFilter ? filterCommits(mergedCommits, parseFilter(parsed.data)) : mergedCommits;
      const summaries = allCommits.map(commitToSummary).reverse();

      response.json({
        items: summaries.slice(pg * ps, (pg + 1) * ps),
        total: summaries.length,
        page: pg,
        pageSize: ps,
      });
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
      const newAnalysis = await calculateMetricsAsync(mergedCommits, repo.analysis.repository);
      store.setAnalysis(repoId, newAnalysis);
      response.json(newAnalysis);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
