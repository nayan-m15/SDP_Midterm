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
  TimeBucket,
  TimeGranularity,
  TimeSeriesResponse,
} from '../../shared/metrics';
import { directoryAncestors } from '../utils/paths';

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

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

export function commitToSummary(commit: HistoryCommit): CommitSummary {
  const commitFiles = new Map<string, BaseMetric>();
  const commitDirectories = new Map<string, BaseMetric>();
  commitDirectories.set('.', zeroBase());

  for (const delta of commit.deltas) {
    if (delta.binary) continue;
    const metric = baseFromLines(delta.added, delta.removed);
    addToCommitMap(commitFiles, delta.path, metric);
    for (const directory of directoryAncestors(delta.path)) {
      addToCommitMap(commitDirectories, directory, metric);
    }
  }

  const rootMetric = commitDirectories.get('.') ?? zeroBase();
  return {
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
  };
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

    summaries.push(commitToSummary(commit));
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

export async function calculateMetricsAsync(
  commits: HistoryCommit[],
  repository: RepositoryMetadata,
  chunkSize = 1000,
): Promise<RepositoryAnalysis> {
  const fileAggregates = new Map<string, MutableAggregate>();
  const directoryAggregates = new Map<string, MutableAggregate>();
  ensureAggregate(directoryAggregates, '.', 'directory');
  const summaries: CommitSummary[] = [];

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i];
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

    summaries.push(commitToSummary(commit));

    // Yield to the event loop after each chunk to keep the server responsive.
    if (i > 0 && i % chunkSize === 0) await yieldToEventLoop();
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

const OTHER_AUTHOR_ID = '__other__';
const DAY_SECONDS = 86400;

function resolveGranularity(commits: HistoryCommit[], requested: TimeGranularity | 'auto'): TimeGranularity {
  if (requested !== 'auto') return requested;
  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const commit of commits) {
    if (commit.committerTimestamp < minTs) minTs = commit.committerTimestamp;
    if (commit.committerTimestamp > maxTs) maxTs = commit.committerTimestamp;
  }
  const spanDays = (maxTs - minTs) / DAY_SECONDS;
  if (spanDays <= 90) return 'day';
  if (spanDays <= 730) return 'week';
  return 'month';
}

function bucketInfo(timestamp: number, granularity: TimeGranularity): { key: string; start: number } {
  const date = new Date(timestamp * 1000);
  if (granularity === 'month') {
    const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return { key, start: start / 1000 };
  }
  if (granularity === 'week') {
    const dayOfWeek = date.getUTCDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - diffToMonday);
    return { key: new Date(start).toISOString().slice(0, 10), start: start / 1000 };
  }
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return { key: new Date(start).toISOString().slice(0, 10), start: start / 1000 };
}

function commitLineMetric(commit: HistoryCommit): BaseMetric {
  let added = 0;
  let removed = 0;
  for (const delta of commit.deltas) {
    if (delta.binary) continue;
    added += delta.added;
    removed += delta.removed;
  }
  return { added, removed, growth: added - removed, churn: added + removed };
}

export function computeTimeSeries(
  commits: HistoryCommit[],
  granularity: TimeGranularity | 'auto' = 'auto',
  maxAuthors = 6,
): TimeSeriesResponse {
  if (commits.length === 0) {
    return { granularity: 'day', buckets: [], authors: [] };
  }

  const resolved = resolveGranularity(commits, granularity);

  const authorChurnTotals = new Map<string, { author: AuthorIdentity; churn: number }>();
  for (const commit of commits) {
    const metric = commitLineMetric(commit);
    if (metric.churn <= 0) continue;
    const existing = authorChurnTotals.get(commit.author.id) ?? { author: commit.author, churn: 0 };
    existing.churn += metric.churn;
    authorChurnTotals.set(commit.author.id, existing);
  }

  const rankedAuthors = [...authorChurnTotals.values()]
    .sort((left, right) => right.churn - left.churn || left.author.id.localeCompare(right.author.id));
  const topAuthors = rankedAuthors.slice(0, maxAuthors).map((item) => item.author);
  const topAuthorIds = new Set(topAuthors.map((author) => author.id));
  const hasOtherAuthors = rankedAuthors.length > maxAuthors;

  const buckets = new Map<string, TimeBucket>();
  for (const commit of commits) {
    const metric = commitLineMetric(commit);
    const { key, start } = bucketInfo(commit.committerTimestamp, resolved);
    const bucket = buckets.get(key) ?? {
      bucket: key,
      timestamp: start,
      commits: 0,
      added: 0,
      removed: 0,
      growth: 0,
      churn: 0,
      authorChurn: {},
    };
    bucket.commits += 1;
    bucket.added += metric.added;
    bucket.removed += metric.removed;
    bucket.growth += metric.growth;
    bucket.churn += metric.churn;
    if (metric.churn > 0) {
      const authorKey = topAuthorIds.has(commit.author.id) ? commit.author.id : OTHER_AUTHOR_ID;
      bucket.authorChurn[authorKey] = (bucket.authorChurn[authorKey] ?? 0) + metric.churn;
    }
    buckets.set(key, bucket);
  }

  const authors = hasOtherAuthors
    ? [...topAuthors, { id: OTHER_AUTHOR_ID, name: 'Other', email: '' }]
    : topAuthors;

  return {
    granularity: resolved,
    buckets: [...buckets.values()].sort((left, right) => left.timestamp - right.timestamp),
    authors,
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
