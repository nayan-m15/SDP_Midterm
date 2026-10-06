import type { AuthorIdentity, HistoryCommit, LineDelta } from '../../shared/metrics';
import { AppError } from '../errors';
import { normalizeGitPath } from '../utils/paths';
import { runGit, runGitText } from '../utils/git';

const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';

function authorIdentity(name: string, email: string): AuthorIdentity {
  const normalizedName = name.trim() || 'Unknown';
  const normalizedEmail = email.trim().toLowerCase();
  return {
    id: `${normalizedName} <${normalizedEmail}>`,
    name: normalizedName,
    email: normalizedEmail,
  };
}

function trimRecordPadding(value: string): string {
  return value.replace(/^[\r\n\0]+|[\r\n\0]+$/g, '');
}

function parseNumstat(value: string): LineDelta[] {
  const tokens = value.split('\0');
  const deltas: LineDelta[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index].replace(/^[\r\n]+/, '');
    if (!token) continue;

    const firstTab = token.indexOf('\t');
    const secondTab = token.indexOf('\t', firstTab + 1);
    if (firstTab < 0 || secondTab < 0) continue;

    const addedText = token.slice(0, firstTab);
    const removedText = token.slice(firstTab + 1, secondTab);
    let repositoryPath = token.slice(secondTab + 1);
    let previousPath: string | undefined;

    if (!repositoryPath) {
      previousPath = tokens[index + 1];
      repositoryPath = tokens[index + 2];
      index += 2;
    }

    if (!repositoryPath) continue;
    const binary = addedText === '-' || removedText === '-';
    deltas.push({
      path: normalizeGitPath(repositoryPath),
      previousPath: previousPath ? normalizeGitPath(previousPath) : undefined,
      added: binary ? 0 : Number.parseInt(addedText, 10),
      removed: binary ? 0 : Number.parseInt(removedText, 10),
      binary,
    });
  }

  return deltas;
}

export function parseGitHistory(output: Buffer | string): HistoryCommit[] {
  const text = typeof output === 'string' ? output : output.toString('utf8');
  const commits: HistoryCommit[] = [];

  for (const rawRecord of text.split(RECORD_SEPARATOR).slice(1)) {
    const metadataEnd = rawRecord.indexOf('\0');
    if (metadataEnd < 0) continue;

    const metadata = trimRecordPadding(rawRecord.slice(0, metadataEnd));
    const fields = metadata.split(FIELD_SEPARATOR);
    if (fields.length !== 5) {
      throw new AppError(422, 'INVALID_GIT_HISTORY', 'Git returned an unexpected history format.');
    }

    const [hash, parentsText, authorName, authorEmail, timestampText] = fields;
    const committerTimestamp = Number.parseInt(timestampText, 10);
    if (!/^[0-9a-f]{40,64}$/i.test(hash) || !Number.isFinite(committerTimestamp)) {
      throw new AppError(422, 'INVALID_GIT_HISTORY', 'Git returned invalid commit metadata.');
    }

    commits.push({
      hash,
      parents: parentsText ? parentsText.split(' ') : [],
      author: authorIdentity(authorName, authorEmail),
      committerTimestamp,
      deltas: parseNumstat(rawRecord.slice(metadataEnd + 1)),
    });
  }

  return commits;
}

export interface ExtractedHistory {
  resolvedCommit: string;
  commits: HistoryCommit[];
}

export async function extractHistory(repositoryPath: string, ref = 'HEAD'): Promise<ExtractedHistory> {
  if (!ref.trim() || ref.startsWith('-') || ref.includes('\0')) {
    throw new AppError(400, 'INVALID_REF', 'The Git reference is invalid.');
  }

  const resolvedCommit = (
    await runGitText(repositoryPath, ['rev-parse', '--verify', `${ref}^{commit}`])
  ).trim();
  const format = `%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%ct%x00`;
  const output = await runGit(repositoryPath, [
    'log',
    '--no-merges',
    '--reverse',
    '--root',
    '--numstat',
    '-z',
    '--find-renames=50%',
    `--format=${format}`,
    resolvedCommit,
  ]);
  const commits = parseGitHistory(output);
  if (commits.length === 0) {
    throw new AppError(422, 'EMPTY_HISTORY', 'The selected reference has no non-merge commits to analyze.');
  }
  return { resolvedCommit, commits };
}
