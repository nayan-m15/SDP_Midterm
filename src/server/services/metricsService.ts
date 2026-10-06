import type {
  AggregateMetric,
  AuthorIdentity,
  AuthorMetric,
  BaseMetric,
  CommitObjectMetric,
  CommitSummary,
  FilterParams,
  HistoryCommit,
  ObjectAggregate,
  ObjectKind,
  RepositoryAnalysis,
  RepositoryMetadata,
} from '../../shared/metrics';
import { directoryAncestors } from '../utils/paths';

interface MutableAuthorMetric {
  author: AuthorIdentity;
  modifications: number;
  churn: number;
}

interface MutableAggregate extends BaseMetric {
  path: string;
  kind: ObjectKind;
  modifications: number;
  authors: Map<string, MutableAuthorMetric>;
}

const zeroBase = (): BaseMetric => ({ added: 0, removed: 0, growth: 0, churn: 0 });

function addBase(target: BaseMetric, source: BaseMetric): void {
  target.added += source.added;
  target.removed += source.removed;
  target.growth += source.growth;
  target.churn += source.churn;
}

function baseFromLines(added: number, removed: number): BaseMetric {
  return { added, removed, growth: added - removed, churn: added + removed };
}

function addToCommitMap(map: Map<string, BaseMetric>, path: string, metric: BaseMetric): void {
  const current = map.get(path) ?? zeroBase();
  addBase(current, metric);
  map.set(path, current);
}

function ensureAggregate(
  map: Map<string, MutableAggregate>,
  path: string,
  kind: ObjectKind,
): MutableAggregate {
  const existing = map.get(path);
  if (existing) return existing;
  const created: MutableAggregate = {
    path,
    kind,
    ...zeroBase(),
    modifications: 0,
    authors: new Map(),
  };
  map.set(path, created);
  return created;
}

function commitMetric(path: string, kind: ObjectKind, metric: BaseMetric): CommitObjectMetric {
  return { path, kind, ...metric };
}

function aggregateCommitMetric(
  aggregate: MutableAggregate,
  metric: BaseMetric,
  author: AuthorIdentity,
): void {
  addBase(aggregate, metric);
  if (metric.churn <= 0) return;

  aggregate.modifications += 1;
  const authorMetric = aggregate.authors.get(author.id) ?? {
    author,
    modifications: 0,
    churn: 0,
  };
  authorMetric.modifications += 1;
  authorMetric.churn += metric.churn;
  aggregate.authors.set(author.id, authorMetric);
}

function finalizeAggregate(value: MutableAggregate, commitCount: number): ObjectAggregate {
  const metrics: AggregateMetric = {
    added: value.added,
    removed: value.removed,
    growth: value.growth,
    churn: value.churn,
    modifications: value.modifications,
    modificationFrequency: commitCount === 0 ? 0 : value.modifications / commitCount,
    churnRate: commitCount === 0 ? 0 : value.churn / commitCount,
  };
  const authors: AuthorMetric[] = [...value.authors.values()]
    .map((item) => ({
      ...item,
      ownership: value.churn === 0 ? 0 : item.churn / value.churn,
    }))
    .sort((left, right) => right.churn - left.churn || left.author.id.localeCompare(right.author.id));
  return { path: value.path, kind: value.kind, metrics, authors };
}

function sortCommitMetrics(values: CommitObjectMetric[]): CommitObjectMetric[] {
  return values.sort((left, right) => left.path.localeCompare(right.path));
}

export function calculateMetrics(
  commits: HistoryCommit[],
  repository: RepositoryMetadata,
): RepositoryAnalysis {
  const fileAggregates = new Map<string, MutableAggregate>();
  const directoryAggregates = new Map<string, MutableAggregate>();
  ensureAggregate(directoryAggregates, '.', 'directory');
  const summaries: CommitSummary[] = [];

  for (const commit of commits) {
    const commitFiles = new Map<string, BaseMetric>();
    const commitDirectories = new Map<string, BaseMetric>();
    commitDirectories.set('.', zeroBase());

    for (const delta of commit.deltas) {
      if (delta.binary) continue;
      ensureAggregate(fileAggregates, delta.path, 'file');
      for (const directory of directoryAncestors(delta.path)) {
        ensureAggregate(directoryAggregates, directory, 'directory');
      }
      if (delta.previousPath) {
        ensureAggregate(fileAggregates, delta.previousPath, 'file');
        for (const directory of directoryAncestors(delta.previousPath)) {
          ensureAggregate(directoryAggregates, directory, 'directory');
        }
      }

      const metric = baseFromLines(delta.added, delta.removed);
      addToCommitMap(commitFiles, delta.path, metric);
      for (const directory of directoryAncestors(delta.path)) {
        addToCommitMap(commitDirectories, directory, metric);
      }
    }

    for (const [path, metric] of commitFiles) {
      aggregateCommitMetric(ensureAggregate(fileAggregates, path, 'file'), metric, commit.author);
    }
    for (const [path, metric] of commitDirectories) {
      aggregateCommitMetric(
        ensureAggregate(directoryAggregates, path, 'directory'),
        metric,
        commit.author,
      );
    }

    const rootMetric = commitDirectories.get('.') ?? zeroBase();
    summaries.push({
      hash: commit.hash,
      parents: commit.parents,
      author: commit.author,
      committerTimestamp: commit.committerTimestamp,
      root: commitMetric('.', 'directory', rootMetric),
      files: sortCommitMetrics(
        [...commitFiles].map(([path, metric]) => commitMetric(path, 'file', metric)),
      ),
      directories: sortCommitMetrics(
        [...commitDirectories]
          .filter(([path]) => path !== '.')
          .map(([path, metric]) => commitMetric(path, 'directory', metric)),
      ),
    });
  }

  const commitCount = commits.length;
  const files = [...fileAggregates.values()]
    .map((value) => finalizeAggregate(value, commitCount))
    .sort((left, right) => left.path.localeCompare(right.path));
  const directories = [...directoryAggregates.values()]
    .map((value) => finalizeAggregate(value, commitCount))
    .sort((left, right) => left.path.localeCompare(right.path));
  const root = directories.find((directory) => directory.path === '.')!;

  if (root.metrics.growth !== root.metrics.added - root.metrics.removed) {
    throw new Error('Metric invariant failed: repository growth is inconsistent.');
  }

  return {
    repository,
    commitCount,
    repositoryMetrics: root.metrics,
    files,
    directories,
    authors: root.authors,
    commits: summaries.reverse(),
  };
}

export function filterCommits(commits: HistoryCommit[], filter: FilterParams): HistoryCommit[] {
  return commits.filter((commit) => {
    if (filter.startTs !== undefined && commit.committerTimestamp < filter.startTs) return false;
    if (filter.endTs !== undefined && commit.committerTimestamp >= filter.endTs) return false;
    if (filter.authorIds && filter.authorIds.length > 0 && !filter.authorIds.includes(commit.author.id)) return false;
    if (filter.hashes && filter.hashes.length > 0 && !filter.hashes.includes(commit.hash)) return false;
    if (filter.paths && filter.paths.length > 0) {
      const hasMatchingDelta = commit.deltas.some((delta) =>
        filter.paths!.some(
          (fp) =>
            fp === '.' ||
            delta.path === fp ||
            delta.path.startsWith(`${fp}/`) ||
            (delta.previousPath !== undefined &&
              (delta.previousPath === fp || delta.previousPath.startsWith(`${fp}/`))),
        ),
      );
      if (!hasMatchingDelta) return false;
    }
    return true;
  });
}
