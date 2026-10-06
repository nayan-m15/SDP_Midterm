import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { RepositoryAnalysis } from '../../src/shared/metrics';
import { createApp } from '../../src/server/app';
import { RepositoryStore } from '../../src/server/state/repositoryStore';
import { createGitFixture, zipDirectory } from '../helpers/createGitFixture';

function analysis(): RepositoryAnalysis {
  const metrics = {
    added: 1, removed: 0, growth: 1, churn: 1,
    modifications: 1, modificationFrequency: 1, churnRate: 1,
  };
  return {
    repository: { name: 'sample', source: 'upload', ref: 'HEAD', resolvedCommit: 'a'.repeat(40) },
    commitCount: 1,
    repositoryMetrics: metrics,
    files: [],
    directories: [{ path: '.', kind: 'directory', metrics, authors: [] }],
    authors: [],
    commits: [{
      hash: 'a'.repeat(40), parents: [],
      author: { id: 'A <a@example.com>', name: 'A', email: 'a@example.com' },
      committerTimestamp: 1,
      root: { path: '.', kind: 'directory', added: 1, removed: 0, growth: 1, churn: 1 },
      files: [], directories: [],
    }],
  };
}

describe('API', () => {
  it('reports health and a missing active repository safely', async () => {
    const app = createApp();
    await request(app).get('/api/health').expect(200, { status: 'ok' });
    const response = await request(app).get('/api/analysis').expect(404);
    expect(response.body.error).toEqual({
      code: 'NO_ACTIVE_REPOSITORY',
      message: 'Import a repository before requesting metrics.',
    });
  });

  it('returns cached analysis and commit metrics', async () => {
    const store = new RepositoryStore();
    await store.replace({ containerPath: '', repositoryPath: '', analysis: analysis() });
    const app = createApp(store);

    const analysisResponse = await request(app).get('/api/analysis').expect(200);
    expect(analysisResponse.body.repository.name).toBe('sample');
    await request(app).get(`/api/commits/${'a'.repeat(40)}/metrics`).expect(200);
    await request(app).get(`/api/commits/${'b'.repeat(40)}/metrics`).expect(404);
  });

  it('imports a ZIP and exposes its calculated analysis', async () => {
    const fixture = await createGitFixture();
    const store = new RepositoryStore();
    try {
      const archive = await zipDirectory(fixture.repositoryPath);
      const app = createApp(store);
      await request(app)
        .post('/api/repositories/upload')
        .attach('repository', archive, { filename: 'sample.zip', contentType: 'application/zip' })
        .expect(201);
      const response = await request(app).get('/api/analysis').expect(200);
      expect(response.body.commitCount).toBe(5);
      expect(response.body.repositoryMetrics).toMatchObject({
        added: 6, removed: 4, growth: 2, churn: 10, modifications: 3,
      });
    } finally {
      await store.clear();
      await fixture.cleanup();
    }
  });

  it('validates clone requests', async () => {
    const response = await request(createApp())
      .post('/api/repositories/clone')
      .send({ url: '' })
      .expect(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });
});
