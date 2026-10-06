import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  applyAuthorMap,
  extractRawAuthors,
  mergeAuthorMaps,
  parseMailmap,
} from '../../src/server/services/authorMerge';
import type { HistoryCommit } from '../../src/shared/metrics';
import { createApp } from '../../src/server/app';
import { RepositoryStore } from '../../src/server/state/repositoryStore';
import { createGitFixture, zipDirectory } from '../helpers/createGitFixture';

const alice = { id: 'Alice <alice@example.com>', name: 'Alice', email: 'alice@example.com' };
const bob = { id: 'Bob <bob@example.com>', name: 'Bob', email: 'bob@example.com' };

function makeCommit(hash: string, author = alice): HistoryCommit {
  return { hash, parents: [], author, committerTimestamp: 1, deltas: [] };
}

const tmps: string[] = [];
afterEach(async () => {
  await Promise.all(tmps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('parseMailmap', () => {
  it('maps by email-only form: <canonical@email> <other@email>', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'rat-mm-'));
    tmps.push(dir);
    await writeFile(path.join(dir, '.mailmap'), '<alice@example.com> <al@old.com>\n');
    const map = await parseMailmap(dir);
    expect(map['<al@old.com>']).toMatchObject({ email: 'alice@example.com' });
  });

  it('maps by name+email form: Canonical Name <canonical@email> Old Name <other@email>', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'rat-mm-'));
    tmps.push(dir);
    await writeFile(
      path.join(dir, '.mailmap'),
      'Alice Smith <alice@example.com> A. Smith <al@old.com>\n',
    );
    const map = await parseMailmap(dir);
    expect(map['A. Smith <al@old.com>']).toMatchObject({ name: 'Alice Smith', email: 'alice@example.com' });
  });

  it('maps canonical name only form: Canonical Name <canonical@email> <other@email>', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'rat-mm-'));
    tmps.push(dir);
    await writeFile(path.join(dir, '.mailmap'), 'Alice Smith <alice@example.com> <al@old.com>\n');
    const map = await parseMailmap(dir);
    expect(map['<al@old.com>']).toMatchObject({ name: 'Alice Smith', email: 'alice@example.com' });
  });

  it('ignores comment lines and returns empty map when no .mailmap exists', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'rat-mm-'));
    tmps.push(dir);
    const noFile = await parseMailmap(dir);
    expect(noFile).toEqual({});

    await writeFile(path.join(dir, '.mailmap'), '# This is a comment\n\n');
    const withComments = await parseMailmap(dir);
    expect(withComments).toEqual({});
  });
});

describe('applyAuthorMap', () => {
  it('replaces author identity by exact name+email match', () => {
    const commits = [makeCommit('aaa', bob)];
    const map = { [bob.id]: alice };
    const result = applyAuthorMap(commits, map);
    expect(result[0].author).toEqual(alice);
  });

  it('replaces author identity by email-only match', () => {
    const commits = [makeCommit('aaa', bob)];
    const map = { '<bob@example.com>': alice };
    const result = applyAuthorMap(commits, map);
    expect(result[0].author).toEqual(alice);
  });

  it('exact match takes priority over email-only match', () => {
    const canonical1 = { id: 'C1 <c1@x.com>', name: 'C1', email: 'c1@x.com' };
    const canonical2 = { id: 'C2 <c2@x.com>', name: 'C2', email: 'c2@x.com' };
    const commits = [makeCommit('aaa', bob)];
    const map = { [bob.id]: canonical1, '<bob@example.com>': canonical2 };
    const result = applyAuthorMap(commits, map);
    expect(result[0].author).toEqual(canonical1);
  });

  it('returns commits unchanged when map is empty', () => {
    const commits = [makeCommit('aaa', bob)];
    expect(applyAuthorMap(commits, {})).toBe(commits);
  });
});

describe('mergeAuthorMaps', () => {
  it('overlays override map on top of base (override wins on same key)', () => {
    const base = { '<old@example.com>': alice };
    const override = { '<old@example.com>': bob };
    const merged = mergeAuthorMaps(base, override);
    expect(merged['<old@example.com>']).toEqual(bob);
  });

  it('retains base entries not overridden', () => {
    const base = { '<a@example.com>': alice };
    const override = { '<b@example.com>': bob };
    const merged = mergeAuthorMaps(base, override);
    expect(merged['<a@example.com>']).toEqual(alice);
    expect(merged['<b@example.com>']).toEqual(bob);
  });
});

describe('extractRawAuthors', () => {
  it('counts commits per author and sorts by count descending', () => {
    const commits = [makeCommit('a', alice), makeCommit('b', alice), makeCommit('c', bob)];
    const result = extractRawAuthors(commits);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ ...alice, commitCount: 2 });
    expect(result[1]).toMatchObject({ ...bob, commitCount: 1 });
  });
});

describe('author-map API round-trip', () => {
  it('PUT /author-map recalculates analysis with merged authors', async () => {
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

      // Get the current raw authors
      const authorsResponse = await request(app).get(`/api/repositories/${id}/authors`).expect(200);
      const { rawAuthors } = authorsResponse.body as {
        rawAuthors: Array<{ id: string; name: string; email: string }>;
      };
      expect(rawAuthors.length).toBeGreaterThanOrEqual(2);

      // Map Bob → Alice so there is only one canonical author
      const bobAuthor = rawAuthors.find((a) => a.name === 'Bob');
      const aliceAuthor = rawAuthors.find((a) => a.name === 'Alice');
      expect(bobAuthor).toBeDefined();
      expect(aliceAuthor).toBeDefined();

      const manualMap: Record<string, { id: string; name: string; email: string }> = {
        [bobAuthor!.id]: aliceAuthor!,
      };
      const mergedAnalysis = await request(app)
        .put(`/api/repositories/${id}/author-map`)
        .send({ map: manualMap })
        .expect(200);

      // After merge, all churn should be attributed to Alice
      const mergedAuthors = mergedAnalysis.body.authors as Array<{ author: { name: string }; ownership: number }>;
      expect(mergedAuthors.every((a) => a.author.name === 'Alice')).toBe(true);
      const totalOwnership = mergedAuthors.reduce((sum, a) => sum + a.ownership, 0);
      expect(totalOwnership).toBeCloseTo(1, 5);
    } finally {
      await store.clear();
      await fixture.cleanup();
    }
  });
});
