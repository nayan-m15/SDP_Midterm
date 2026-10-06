import { describe, expect, it } from 'vitest';
import type { HistoryCommit, RepositoryMetadata } from '../../src/shared/metrics';
import { calculateMetrics } from '../../src/server/services/metricsService';

const alice = { id: 'Alice <alice@example.com>', name: 'Alice', email: 'alice@example.com' };
const bob = { id: 'Bob <bob@example.com>', name: 'Bob', email: 'bob@example.com' };
const metadata: RepositoryMetadata = {
  id: 'test-repo-id',
  name: 'fixture', source: 'upload', ref: 'HEAD', resolvedCommit: 'f'.repeat(40),
};

function commit(hashCharacter: string, author = alice): HistoryCommit {
  return {
    hash: hashCharacter.repeat(40),
    parents: [],
    author,
    committerTimestamp: 1,
    deltas: [],
  };
}

describe('calculateMetrics', () => {
  it('calculates file, directory, set, and author metrics', () => {
    const commits = [commit('a'), commit('b', bob)];
    commits[0].deltas = [
      { path: 'src/a.txt', added: 3, removed: 0, binary: false },
      { path: 'image.bin', added: 0, removed: 0, binary: true },
    ];
    commits[1].deltas = [
      { path: 'src/a.txt', added: 1, removed: 2, binary: false },
      { path: 'src/deep/b.txt', added: 4, removed: 0, binary: false },
    ];

    const result = calculateMetrics(commits, metadata);
    expect(result.repositoryMetrics).toEqual({
      added: 8,
      removed: 2,
      growth: 6,
      churn: 10,
      modifications: 2,
      modificationFrequency: 1,
      churnRate: 5,
    });
    expect(result.files.find((item) => item.path === 'src/a.txt')?.metrics).toMatchObject({
      added: 4, removed: 2, growth: 2, churn: 6, modifications: 2,
      modificationFrequency: 1, churnRate: 3,
    });
    expect(result.files.find((item) => item.path === 'image.bin')).toBeUndefined();
    expect(result.directories.find((item) => item.path === 'src')?.metrics.churn).toBe(10);
    expect(result.directories.find((item) => item.path === 'src/deep')?.metrics.churn).toBe(4);
    expect(result.authors).toEqual([
      expect.objectContaining({ author: bob, churn: 7, modifications: 1, ownership: 0.7 }),
      expect.objectContaining({ author: alice, churn: 3, modifications: 1, ownership: 0.3 }),
    ]);
  });

  it('keeps rename history paths without attributing pure rename churn', () => {
    const renamed = commit('c');
    renamed.deltas = [{
      path: 'new/name.txt', previousPath: 'old/name.txt', added: 0, removed: 0, binary: false,
    }];
    const result = calculateMetrics([renamed], metadata);
    expect(result.files.map((item) => item.path)).toEqual(['new/name.txt', 'old/name.txt']);
    expect(result.repositoryMetrics.churn).toBe(0);
    expect(result.repositoryMetrics.modifications).toBe(0);
    expect(result.authors).toEqual([]);
  });

  it('returns zero metrics and zero denominators for an empty commit set', () => {
    const result = calculateMetrics([], metadata);
    expect(result.commitCount).toBe(0);
    expect(result.repositoryMetrics).toEqual({
      added: 0, removed: 0, growth: 0, churn: 0,
      modifications: 0, modificationFrequency: 0, churnRate: 0,
    });
    expect(result.files).toEqual([]);
    expect(result.authors).toEqual([]);
  });

  it('root directory metrics equal repositoryMetrics', () => {
    const commits = [commit('a'), commit('b', bob)];
    commits[0].deltas = [{ path: 'src/a.txt', added: 3, removed: 0, binary: false }];
    commits[1].deltas = [{ path: 'src/b.txt', added: 2, removed: 1, binary: false }];
    const result = calculateMetrics(commits, metadata);
    const root = result.directories.find((d) => d.path === '.');
    expect(root).toBeDefined();
    expect(root!.metrics).toEqual(result.repositoryMetrics);
  });
});
