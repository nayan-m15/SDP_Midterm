import { afterEach, describe, expect, it } from 'vitest';
import type { GitFixture } from '../helpers/createGitFixture';
import { createGitFixture } from '../helpers/createGitFixture';
import { extractHistory } from '../../src/server/services/historyService';

const fixtures: GitFixture[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

describe('extractHistory', () => {
  it('extracts root, edits, rename, deletion, authors, and binary markers', async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const result = await extractHistory(fixture.repositoryPath);

    expect(result.commits).toHaveLength(5);
    expect(result.resolvedCommit).toBe(fixture.hashes[3]);
    expect(result.commits[0].author.name).toBe('Alice');
    expect(result.commits[1].author.email).toBe('bob@example.com');

    const initialBinary = result.commits[0].deltas.find((item) => item.path === 'asset.bin');
    expect(initialBinary).toMatchObject({ binary: true, added: 0, removed: 0 });
    expect(result.commits[2].deltas[0]).toMatchObject({
      previousPath: 'src/nested/b.txt', path: 'src/nested/c.txt', added: 0, removed: 0,
    });
    expect(result.commits[4].deltas).toContainEqual(expect.objectContaining({
      path: 'src/a.txt', added: 0, removed: 3,
    }));
    expect(result.commits.every((commit) => commit.parents.length < 2)).toBe(true);
  });

  it('honors an explicit historical reference', async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const result = await extractHistory(fixture.repositoryPath, fixture.hashes[1]);
    expect(result.commits).toHaveLength(2);
    expect(result.resolvedCommit).toBe(fixture.hashes[1]);
  });
});
