import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GitFixture } from '../helpers/createGitFixture';
import { createGitFixture, zipDirectory } from '../helpers/createGitFixture';
import { prepareClone, prepareUpload } from '../../src/server/services/ingestionService';

const fixtures: GitFixture[] = [];
const staged: string[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  await Promise.all(staged.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function serveBareRepository(repositoryPath: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'rat-http-'));
  const barePath = path.join(root, 'sample.git');
  execFileSync('git', ['clone', '--bare', repositoryPath, barePath]);
  execFileSync('git', ['update-server-info'], { cwd: barePath });
  const server = createServer(async (request, response) => {
    try {
      const requestPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const filePath = path.resolve(root, `.${requestPath}`);
      if (!filePath.startsWith(`${root}${path.sep}`) || !(await stat(filePath)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200);
      response.end(await readFile(filePath));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start fixture server.');
  return {
    url: `http://127.0.0.1:${address.port}/sample.git`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    root,
  };
}

describe('repository ingestion', () => {
  it('extracts and validates a ZIP containing one Git working tree', async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const archive = await zipDirectory(fixture.repositoryPath);
    const prepared = await prepareUpload(archive, 'sample.zip');
    staged.push(prepared.containerPath);

    expect(prepared.source).toBe('upload');
    expect(prepared.name).toBe('sample-repo');
    expect(prepared.repositoryPath).toContain('sample-repo');
  });

  it('deeply clones a repository over HTTP', async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const remote = await serveBareRepository(fixture.repositoryPath);
    try {
      const prepared = await prepareClone(remote.url);
      staged.push(prepared.containerPath);
      const count = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
        cwd: prepared.repositoryPath,
        encoding: 'utf8',
      }).trim();
      expect(count).toBe('6');
      expect(prepared.source).toBe('clone');
      expect(prepared.name).toBe('sample');
    } finally {
      await remote.close();
      await rm(remote.root, { recursive: true, force: true });
    }
  });

  it('rejects invalid uploads and unsafe clone URLs', async () => {
    await expect(prepareUpload(Buffer.from('not zip'), 'sample.zip')).rejects.toMatchObject({
      code: 'INVALID_ARCHIVE',
    });
    await expect(prepareUpload(Buffer.from('data'), 'sample.txt')).rejects.toMatchObject({
      code: 'INVALID_FILE_TYPE',
    });
    await expect(prepareClone('file:///tmp/repository')).rejects.toMatchObject({ code: 'INVALID_URL' });
  });
});
