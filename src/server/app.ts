import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { AppError } from './errors';
import { errorHandler } from './middleware/errorHandler';
import { createMetricsRouter } from './routes/metrics';
import { createRepositoryRouter } from './routes/repositories';
import { RepositoryStore } from './state/repositoryStore';

export function createApp(store = new RepositoryStore()) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  app.use('/api/repositories', createRepositoryRouter(store));
  app.use('/api/repositories', createMetricsRouter(store));

  app.use('/api', (_request, _response, next) => {
    next(new AppError(404, 'NOT_FOUND', 'The requested API endpoint does not exist.'));
  });

  const clientDirectory = path.resolve('dist/client');
  if (existsSync(clientDirectory)) {
    app.use(express.static(clientDirectory));
    app.get('*', (_request, response) => response.sendFile(path.join(clientDirectory, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
