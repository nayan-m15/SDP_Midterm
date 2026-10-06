export type RepositorySource = 'clone' | 'upload';
export type ObjectKind = 'file' | 'directory';
export type AuthorMap = Record<string, AuthorIdentity>;

export interface AuthorIdentity {
  id: string;
  name: string;
  email: string;
}

export interface RawAuthor extends AuthorIdentity {
  commitCount: number;
}

export interface CommitMetadata {
  hash: string;
  parents: string[];
  author: AuthorIdentity;
  committerTimestamp: number;
}

export interface LineDelta {
  path: string;
  previousPath?: string;
  added: number;
  removed: number;
  binary: boolean;
}

export interface HistoryCommit extends CommitMetadata {
  deltas: LineDelta[];
}

export interface BaseMetric {
  added: number;
  removed: number;
  growth: number;
  churn: number;
}

export interface CommitObjectMetric extends BaseMetric {
  path: string;
  kind: ObjectKind;
}

export interface AggregateMetric extends BaseMetric {
  modifications: number;
  modificationFrequency: number;
  churnRate: number;
}

export interface AuthorMetric {
  author: AuthorIdentity;
  modifications: number;
  churn: number;
  ownership: number;
}

export interface ObjectAggregate {
  path: string;
  kind: ObjectKind;
  metrics: AggregateMetric;
  authors: AuthorMetric[];
}

export interface CommitSummary extends CommitMetadata {
  root: CommitObjectMetric;
  files: CommitObjectMetric[];
  directories: CommitObjectMetric[];
}

export interface RepositoryMetadata {
  id: string;
  name: string;
  source: RepositorySource;
  ref: string;
  resolvedCommit: string;
}

export interface RepositoryListItem {
  id: string;
  name: string;
  source: RepositorySource;
  ref: string;
  resolvedCommit: string;
  commitCount: number;
}

export interface FilterParams {
  startTs?: number;
  endTs?: number;
  authorIds?: string[];
  paths?: string[];
  hashes?: string[];
}

export interface RepositoryAnalysis {
  repository: RepositoryMetadata;
  commitCount: number;
  repositoryMetrics: AggregateMetric;
  files: ObjectAggregate[];
  directories: ObjectAggregate[];
  authors: AuthorMetric[];
  commits: CommitSummary[];
}

export interface CommitListResponse {
  items: CommitSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export type TimeGranularity = 'day' | 'week' | 'month';

export interface TimeBucket {
  bucket: string;
  timestamp: number;
  commits: number;
  added: number;
  removed: number;
  growth: number;
  churn: number;
  authorChurn: Record<string, number>;
}

export interface TimeSeriesResponse {
  granularity: TimeGranularity;
  buckets: TimeBucket[];
  authors: AuthorIdentity[];
}
