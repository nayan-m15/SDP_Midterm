import { rm } from 'node:fs/promises';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { RepositoryMetadata } from '../../shared/metrics';
import { config } from '../config';
import { AppError } from '../errors';
import { extractHistory } from '../services/historyService';
import {
  prepareClone,
  prepareUpload,
  type PreparedRepository,
} from '../services/ingestionService';
import { calculateMetrics } from '../services/metricsService';
import type { RepositoryStore } from '../state/repositoryStore';

const cloneSchema = z.object({
  url: z.string().trim().min(1),
  ref: z.string().trim().min(1).max(200).optional(),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadLimitBytes, files: 1 },
});

async function analyzePrepared(
  prepared: PreparedRepository,
  ref: string,
  store: RepositoryStore,
): Promise<RepositoryMetadata> {
  const history = await extractHistory(prepared.repositoryPath, ref);
  const metadata: RepositoryMetadata = {
    name: prepared.name,
    source: prepared.source,
    ref,
    resolvedCommit: history.resolvedCommit,
  };
  const analysis = calculateMetrics(history.commits, metadata);
  await store.replace({
    containerPath: prepared.containerPath,
    repositoryPath: prepared.repositoryPath,
    analysis,
  });
  return metadata;
}

export function createRepositoryRouter(store: RepositoryStore): Router {
  const router = Router();

  router.post('/clone', async (request, response, next) => {
    let prepared: PreparedRepository | undefined;
    let importStarted = false;
    try {
      const input = cloneSchema.parse(request.body);
      store.beginImport();
      importStarted = true;
      prepared = await prepareClone(input.url);
      const repository = await analyzePrepared(prepared, input.ref ?? 'HEAD', store);
      prepared = undefined;
      response.status(201).json({ repository });
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
      const ref = typeof request.body.ref === 'string' && request.body.ref.trim()
        ? request.body.ref.trim()
        : 'HEAD';
      if (ref.length > 200) throw new AppError(400, 'INVALID_REF', 'The Git reference is too long.');
      prepared = await prepareUpload(request.file.buffer, request.file.originalname);
      const repository = await analyzePrepared(prepared, ref, store);
      prepared = undefined;
      response.status(201).json({ repository });
    } catch (error) {
      next(error);
    } finally {
      if (prepared) await rm(prepared.containerPath, { recursive: true, force: true });
      if (importStarted) store.endImport();
    }
  });

  return router;
}
