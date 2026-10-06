import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { AuthorIdentity, AuthorMap, HistoryCommit, RawAuthor } from '../../shared/metrics';

interface ParsedMailmapLine {
  canonicalName: string;
  canonicalEmail: string;
  rawEmail: string;
  rawName?: string;
}

function parseMailmapLine(line: string): ParsedMailmapLine | null {
  // Supported forms:
  // Canonical Name <canonical@email> <other@email>
  // Canonical Name <canonical@email> Other Name <other@email>
  // <canonical@email> <other@email>
  // <canonical@email> Other Name <other@email>
  const emailRegex = /<([^>]+)>/g;
  const emailMatches: Array<{ email: string; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = emailRegex.exec(line)) !== null) {
    emailMatches.push({ email: match[1].trim().toLowerCase(), index: match.index });
  }
  if (emailMatches.length < 2) return null;

  const canonicalEmail = emailMatches[0].email;
  const rawEmail = emailMatches[emailMatches.length - 1].email;
  const beforeFirst = line.slice(0, emailMatches[0].index).trim();
  const canonicalName = beforeFirst || canonicalEmail;

  let rawName: string | undefined;
  if (emailMatches.length === 2) {
    const firstCloseIdx = line.indexOf('>', emailMatches[0].index) + 1;
    const lastOpenIdx = emailMatches[1].index;
    const between = line.slice(firstCloseIdx, lastOpenIdx).trim();
    if (between) rawName = between;
  }

  return { canonicalName, canonicalEmail, rawEmail, rawName };
}

export async function parseMailmap(repositoryPath: string): Promise<AuthorMap> {
  const mailmapPath = path.join(repositoryPath, '.mailmap');
  let content: string;
  try {
    content = await readFile(mailmapPath, 'utf8');
  } catch {
    return {};
  }

  const map: AuthorMap = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parsed = parseMailmapLine(trimmed);
    if (!parsed) continue;

    const canonical: AuthorIdentity = {
      id: `${parsed.canonicalName} <${parsed.canonicalEmail}>`,
      name: parsed.canonicalName,
      email: parsed.canonicalEmail,
    };

    if (parsed.rawName) {
      // Exact name+email match
      map[`${parsed.rawName} <${parsed.rawEmail}>`] = canonical;
    } else {
      // Email-only match (applies to any author with this email)
      map[`<${parsed.rawEmail}>`] = canonical;
    }
  }
  return map;
}

export function applyAuthorMap(commits: HistoryCommit[], map: AuthorMap): HistoryCommit[] {
  if (Object.keys(map).length === 0) return commits;
  return commits.map((commit) => {
    // Exact name+email match takes priority
    const exactMatch = map[commit.author.id];
    if (exactMatch) return { ...commit, author: exactMatch };
    // Email-only match as fallback
    const emailMatch = map[`<${commit.author.email}>`];
    if (emailMatch) return { ...commit, author: emailMatch };
    return commit;
  });
}

export function mergeAuthorMaps(base: AuthorMap, override: AuthorMap): AuthorMap {
  return { ...base, ...override };
}

export function extractRawAuthors(commits: HistoryCommit[]): RawAuthor[] {
  const counts = new Map<string, { author: AuthorIdentity; count: number }>();
  for (const commit of commits) {
    const existing = counts.get(commit.author.id);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(commit.author.id, { author: commit.author, count: 1 });
    }
  }
  return [...counts.values()]
    .map(({ author, count }) => ({ ...author, commitCount: count }))
    .sort((a, b) => b.commitCount - a.commitCount || a.id.localeCompare(b.id));
}
