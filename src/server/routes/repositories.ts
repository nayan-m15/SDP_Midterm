import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { RepositoryMetadata } from '../../shared/metrics';
import { config } from '../config';
import { AppError } from '../errors';
import { extractHistory } from '../services/historyService';
import { prepareClone, prepareUpload, type PreparedRepository } from '../services/ingestionService';
import { calculateMetrics } from '../services/metricsService';
import { applyAuthorMap, parseMailmap } from '../services/authorMerge';
import type { RepositoryStore } from '../state/repositoryStore';

const cloneSchema = z.object({
  url: z.string().trim().min(1),
  ref: z.string().trim().min(1).max(200).optional(),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadLimitBytes, files: 1 },
});

async function importRepository(
  prepared: PreparedRepository,
  ref: string,
  store: RepositoryStore,
): Promise<{ id: string; repository: RepositoryMetadata }> {
  const id = randomUUID();
  const { resolvedCommit, commits: rawCommits } = await extractHistory(prepared.repositoryPath, ref);
  const metadata: RepositoryMetadata = {
    id,
    name: prepared.name,
    source: prepared.source,
    ref,
    resolvedCommit,
  };
  const authorMap = await parseMailmap(prepared.repositoryPath);
  const mergedCommits = applyAuthorMap(rawCommits, authorMap);
  const analysis = calculateMetrics(mergedCommits, metadata);
  store.add({
    containerPath: prepared.containerPath,
    repositoryPath: prepared.repositoryPath,
    analysis,
    commits: rawCommits,
    authorMap,
  });
  return { id, repository: metadata };
}

export function createRepositoryRouter(store: RepositoryStore): Router {
  const router = Router();

  router.get('/', (_request, response) => {
    response.json(store.list());
  });

  router.delete('/:repoId', async (request, response, next) => {
    try {
      await store.remove(request.params.repoId);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post('/clone', async (request, response, next) => {
    let prepared: PreparedRepository | undefined;
    let importStarted = false;
    try {
      const input = cloneSchema.parse(request.body);
      store.beginImport();
      importStarted = true;
      prepared = await prepareClone(input.url);
      const result = await importRepository(prepared, input.ref ?? 'HEAD', store);
      prepared = undefined;
      response.status(201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new AppError(400, 'INVALID_REQUEST', 'Provide a valid repository URL and reference.'));
      } else {
        next(error);
      }
    } finally {
      if (prepared) await rm(prepared.containerPath, { recursive: true, force: true });
      if (importStarted) store.endImport();
    }
  });

  router.post('/upload', upload.single('repository'), async (request, response, next) => {
    let prepared: PreparedRepository | undefined;
    let importStarted = false;
    try {
      store.beginImport();
      importStarted = true;
      if (!request.file) {
        throw new AppError(400, 'MISSING_UPLOAD', 'Choose a repository ZIP to upload.');
      }
      const ref =
        typeof request.body.ref === 'string' && request.body.ref.trim() ? request.body.ref.trim() : 'HEAD';
      if (ref.length > 200) throw new AppError(400, 'INVALID_REF', 'The Git reference is too long.');
      prepared = await prepareUpload(request.file.buffer, request.file.originalname);
      const result = await importRepository(prepared, ref, store);
      prepared = undefined;
      response.status(201).json(result);
    } catch (error) {
      next(error);
    } finally {
      if (prepared) await rm(prepared.containerPath, { recursive: true, force: true });
      if (importStarted) store.endImport();
    }
  });

  return router;
}
