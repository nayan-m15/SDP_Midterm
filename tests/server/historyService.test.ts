import { afterEach, describe, expect, it } from 'vitest';
import type { GitFixture } from '../helpers/createGitFixture';
import {
  createChangedRenameFixture,
  createGitFixture,
  createUnicodePathFixture,
} from '../helpers/createGitFixture';
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

  it('correctly parses a changed rename with line edits', async () => {
    const fixture = await createChangedRenameFixture();
    fixtures.push(fixture);
    const result = await extractHistory(fixture.repositoryPath);
    // 2 non-merge commits: initial + changed rename
    expect(result.commits).toHaveLength(2);
    const renameCommit = result.commits[1];
    expect(renameCommit.deltas).toHaveLength(1);
    const delta = renameCommit.deltas[0];
    // Should be detected as a rename from alpha.txt to beta.txt with 1 added line
    expect(delta.path).toBe('beta.txt');
    expect(delta.previousPath).toBe('alpha.txt');
    expect(delta.added).toBe(1);
    expect(delta.removed).toBe(0);
    expect(delta.binary).toBe(false);
  });

  it('extracts history containing a non-ASCII file path without error', async () => {
    const fixture = await createUnicodePathFixture();
    fixtures.push(fixture);
    const result = await extractHistory(fixture.repositoryPath);
    expect(result.commits).toHaveLength(1);
    const paths = result.commits[0].deltas.map((d) => d.path);
    expect(paths).toContain('données.txt');
    expect(paths).toContain('README.md');
  });
});
