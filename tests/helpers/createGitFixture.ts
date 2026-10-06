import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import archiver from 'archiver';

function git(repositoryPath: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync('git', args, {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  }).trim();
}

async function commit(
  repositoryPath: string,
  message: string,
  author: { name: string; email: string },
  timestamp: string,
  allowEmpty = false,
): Promise<string> {
  git(repositoryPath, ['add', '-A']);
  git(repositoryPath, ['commit', '-m', message, ...(allowEmpty ? ['--allow-empty'] : [])], {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
    GIT_AUTHOR_DATE: timestamp,
    GIT_COMMITTER_DATE: timestamp,
  });
  return git(repositoryPath, ['rev-parse', 'HEAD']);
}

export interface GitFixture {
  root: string;
  repositoryPath: string;
  hashes: string[];
  cleanup(): Promise<void>;
}

export async function createGitFixture(): Promise<GitFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rat-fixture-'));
  const repositoryPath = path.join(root, 'sample-repo');
  await mkdir(path.join(repositoryPath, 'src', 'nested'), { recursive: true });
  git(repositoryPath, ['init', '-b', 'main']);

  await writeFile(path.join(repositoryPath, 'README.md'), 'project\n');
  await writeFile(path.join(repositoryPath, 'src', 'a.txt'), 'one\ntwo\n');
  await writeFile(path.join(repositoryPath, 'asset.bin'), Buffer.from([0, 1, 2, 0, 3]));
  const first = await commit(
    repositoryPath,
    'initial',
    { name: 'Alice', email: 'alice@example.com' },
    '2024-01-01T00:00:00Z',
  );

  await writeFile(path.join(repositoryPath, 'src', 'a.txt'), 'one\nthree\nfour\n');
  await writeFile(path.join(repositoryPath, 'src', 'nested', 'b.txt'), 'x\n');
  const second = await commit(
    repositoryPath,
    'edit and add',
    { name: 'Bob', email: 'bob@example.com' },
    '2024-01-02T00:00:00Z',
  );

  git(repositoryPath, ['mv', 'src/nested/b.txt', 'src/nested/c.txt']);
  const third = await commit(
    repositoryPath,
    'rename',
    { name: 'Alice', email: 'alice@example.com' },
    '2024-01-03T00:00:00Z',
  );

  git(repositoryPath, ['checkout', '-b', 'feature']);
  await commit(
    repositoryPath,
    'branch marker',
    { name: 'Alice', email: 'alice@example.com' },
    '2024-01-04T00:00:00Z',
    true,
  );
  git(repositoryPath, ['checkout', 'main']);
  git(repositoryPath, ['merge', '--no-ff', 'feature', '-m', 'merge feature'], {
    GIT_AUTHOR_NAME: 'Alice',
    GIT_AUTHOR_EMAIL: 'alice@example.com',
    GIT_COMMITTER_NAME: 'Alice',
    GIT_COMMITTER_EMAIL: 'alice@example.com',
    GIT_AUTHOR_DATE: '2024-01-05T00:00:00Z',
    GIT_COMMITTER_DATE: '2024-01-05T00:00:00Z',
  });

  await rm(path.join(repositoryPath, 'src', 'a.txt'));
  const fourth = await commit(
    repositoryPath,
    'delete',
    { name: 'Bob', email: 'bob@example.com' },
    '2024-01-06T00:00:00Z',
  );

  return {
    root,
    repositoryPath,
    hashes: [first, second, third, fourth],
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function zipDirectory(directoryPath: string): Promise<Buffer> {
  const outputPath = path.join(path.dirname(directoryPath), `fixture-${Date.now()}.zip`);
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 1 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(directoryPath, path.basename(directoryPath));
    void archive.finalize();
  });
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile(outputPath);
  await rm(outputPath, { force: true });
  return buffer;
}
