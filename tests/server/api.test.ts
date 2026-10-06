import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { RepositoryAnalysis } from '../../src/shared/metrics';
import { createApp } from '../../src/server/app';
import { RepositoryStore } from '../../src/server/state/repositoryStore';
import { createGitFixture, zipDirectory } from '../helpers/createGitFixture';

const TEST_REPO_ID = 'aaaaaaaa-0000-0000-0000-000000000000';

function makeAnalysis(): RepositoryAnalysis {
  const metrics = {
    added: 1, removed: 0, growth: 1, churn: 1,
    modifications: 1, modificationFrequency: 1, churnRate: 1,
  };
  return {
    repository: { id: TEST_REPO_ID, name: 'sample', source: 'upload', ref: 'HEAD', resolvedCommit: 'a'.repeat(40) },
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
  it('reports health and 404 for unknown repository', async () => {
    const app = createApp();
    await request(app).get('/api/health').expect(200, { status: 'ok' });
    const response = await request(app).get(`/api/repositories/${TEST_REPO_ID}/analysis`).expect(404);
    expect(response.body.error).toMatchObject({ code: 'REPOSITORY_NOT_FOUND' });
  });

  it('lists repositories and returns empty array when none imported', async () => {
    const app = createApp();
    const response = await request(app).get('/api/repositories').expect(200);
    expect(response.body).toEqual([]);
  });

  it('returns cached analysis and commit metrics for a known repository', async () => {
    const store = new RepositoryStore();
    store.add({
      containerPath: '',
      repositoryPath: '',
      analysis: makeAnalysis(),
      commits: [],
      authorMap: {},
    });
    const app = createApp(store);

    const analysisResponse = await request(app)
      .get(`/api/repositories/${TEST_REPO_ID}/analysis`)
      .expect(200);
    expect(analysisResponse.body.repository.name).toBe('sample');

    await request(app)
      .get(`/api/repositories/${TEST_REPO_ID}/commits/${'a'.repeat(40)}/metrics`)
      .expect(200);

    await request(app)
      .get(`/api/repositories/${TEST_REPO_ID}/commits/${'b'.repeat(40)}/metrics`)
      .expect(404);
  });

  it('imports a ZIP, exposes calculated analysis under the returned repo ID, and lists it', async () => {
    const fixture = await createGitFixture();
    const store = new RepositoryStore();
    try {
      const archive = await zipDirectory(fixture.repositoryPath);
      const app = createApp(store);

      const importResponse = await request(app)
        .post('/api/repositories/upload')
        .attach('repository', archive, { filename: 'sample.zip', contentType: 'application/zip' })
        .expect(201);
      const { id } = importResponse.body as { id: string };
      expect(id).toBeTruthy();

      const analysisResponse = await request(app)
        .get(`/api/repositories/${id}/analysis`)
        .expect(200);
      expect(analysisResponse.body.commitCount).toBe(5);
      expect(analysisResponse.body.repositoryMetrics).toMatchObject({
        added: 6, removed: 4, growth: 2, churn: 10, modifications: 3,
      });

      const listResponse = await request(app).get('/api/repositories').expect(200);
      expect(Array.isArray(listResponse.body)).toBe(true);
      expect(listResponse.body).toHaveLength(1);
      expect(listResponse.body[0].id).toBe(id);
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

  it('deletes a repository and removes it from the list', async () => {
    const store = new RepositoryStore();
    store.add({
      containerPath: '',
      repositoryPath: '',
      analysis: makeAnalysis(),
      commits: [],
      authorMap: {},
    });
    const app = createApp(store);

    await request(app).get(`/api/repositories/${TEST_REPO_ID}/analysis`).expect(200);
    await request(app).delete(`/api/repositories/${TEST_REPO_ID}`).expect(204);
    await request(app).get(`/api/repositories/${TEST_REPO_ID}/analysis`).expect(404);
    const listResponse = await request(app).get('/api/repositories').expect(200);
    expect(listResponse.body).toEqual([]);
  });

  it('rejects a second import while one is in progress (import lock)', async () => {
    const store = new RepositoryStore();
    store.beginImport();
    const app = createApp(store);
    const response = await request(app)
      .post('/api/repositories/upload')
      .attach('repository', Buffer.alloc(10), { filename: 'x.zip', contentType: 'application/zip' })
      .expect(409);
    expect(response.body.error.code).toBe('IMPORT_IN_PROGRESS');
    store.endImport();
  });

  it('returns a filtered analysis when filter params are provided', async () => {
    const fixture = await createGitFixture();
    const store = new RepositoryStore();
    try {
      const archive = await zipDirectory(fixture.repositoryPath);
      const app = createApp(store);

      const importResponse = await request(app)
        .post('/api/repositories/upload')
        .attach('repository', archive, { filename: 'sample.zip', contentType: 'application/zip' })
        .expect(201);
      const { id } = importResponse.body as { id: string };

      // Filter to a single commit by hash
      const fullAnalysis = await request(app).get(`/api/repositories/${id}/analysis`).expect(200);
      const firstHash: string = (fullAnalysis.body.commits as Array<{ hash: string }>).at(-1)!.hash;

      const filtered = await request(app)
        .get(`/api/repositories/${id}/analysis?hashes=${firstHash}`)
        .expect(200);
      expect(filtered.body.commitCount).toBe(1);
    } finally {
      await store.clear();
      await fixture.cleanup();
    }
  });

  it('returns a bucketed time series for commit activity', async () => {
    const fixture = await createGitFixture();
    const store = new RepositoryStore();
    try {
      const archive = await zipDirectory(fixture.repositoryPath);
      const app = createApp(store);

      const importResponse = await request(app)
        .post('/api/repositories/upload')
        .attach('repository', archive, { filename: 'sample.zip', contentType: 'application/zip' })
        .expect(201);
      const { id } = importResponse.body as { id: string };

      const response = await request(app)
        .get(`/api/repositories/${id}/timeseries`)
        .expect(200);
      expect(['day', 'week', 'month']).toContain(response.body.granularity);
      expect(Array.isArray(response.body.buckets)).toBe(true);
      expect(Array.isArray(response.body.authors)).toBe(true);
      const totalCommits = (response.body.buckets as Array<{ commits: number }>)
        .reduce((sum, bucket) => sum + bucket.commits, 0);
      expect(totalCommits).toBe(5);
    } finally {
      await store.clear();
      await fixture.cleanup();
    }
  });

  it('rejects invalid granularity values for the time series endpoint', async () => {
    const store = new RepositoryStore();
    store.add({
      containerPath: '',
      repositoryPath: '',
      analysis: makeAnalysis(),
      commits: [],
      authorMap: {},
    });
    const app = createApp(store);

    const response = await request(app)
      .get(`/api/repositories/${TEST_REPO_ID}/timeseries?granularity=yearly`)
      .expect(400);
    expect(response.body.error.code).toBe('INVALID_FILTER');
  });

  it('does not expose git stderr or host paths in error responses', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/repositories/clone')
      .send({ url: 'https://localhost/nonexistent-repo-xyz.git' })
      .expect((res) => res.status >= 400);
    const bodyStr = JSON.stringify(response.body);
    // Must not contain file system path separators or raw git output keywords
    expect(bodyStr).not.toMatch(/\/home\//);
    expect(bodyStr).not.toMatch(/\/tmp\//);
    expect(bodyStr).not.toMatch(/fatal:/);
    expect(bodyStr).not.toMatch(/error:/);
    expect(response.body.error).toHaveProperty('code');
    expect(response.body.error).toHaveProperty('message');
  });
});
