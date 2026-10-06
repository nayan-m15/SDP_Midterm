import { randomUUID } from 'node:crypto';
import { mkdir, opendir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as unzipper from 'unzipper';
import type { RepositorySource } from '../../shared/metrics';
import { config } from '../config';
import { AppError } from '../errors';
import { runGitText } from '../utils/git';
import { validateArchivePath } from '../utils/paths';

export interface PreparedRepository {
  containerPath: string;
  repositoryPath: string;
  name: string;
  source: RepositorySource;
}

async function createStagingDirectory(): Promise<string> {
  await mkdir(config.dataRoot, { recursive: true });
  const staging = path.join(config.dataRoot, `stage-${randomUUID()}`);
  await mkdir(staging, { recursive: true });
  return staging;
}

function validateRemoteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, 'INVALID_URL', 'Enter a valid HTTP(S) repository URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new AppError(400, 'INVALID_URL', 'Only credential-free HTTP(S) repository URLs are supported.');
  }
  return url;
}

function repositoryNameFromUrl(url: URL): string {
  const finalSegment = url.pathname.split('/').filter(Boolean).at(-1) ?? 'repository';
  return finalSegment.replace(/\.git$/i, '') || 'repository';
}

interface ZipEntry {
  path: string;
  type: 'File' | 'Directory';
  uncompressedSize: number;
  externalFileAttributes: number;
  buffer(): Promise<Buffer>;
}

interface ZipDirectory {
  files: ZipEntry[];
}

function isSymbolicLink(entry: ZipEntry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
  return mode === 0o120000;
}

async function extractArchive(archive: Buffer, destination: string): Promise<void> {
  let directory: ZipDirectory;
  try {
    directory = (await unzipper.Open.buffer(archive)) as ZipDirectory;
  } catch (error) {
    throw new AppError(422, 'INVALID_ARCHIVE', 'The uploaded file is not a readable ZIP archive.', error);
  }

  if (directory.files.length > config.extractedFileLimit) {
    throw new AppError(413, 'ARCHIVE_TOO_LARGE', 'The ZIP contains too many files.');
  }
  const totalSize = directory.files.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (totalSize > config.extractedLimitBytes) {
    throw new AppError(413, 'ARCHIVE_TOO_LARGE', 'The extracted ZIP exceeds the configured size limit.');
  }

  for (const entry of directory.files) {
    if (isSymbolicLink(entry)) {
      throw new AppError(422, 'UNSAFE_ARCHIVE', 'Symbolic links are not allowed in uploaded ZIP files.');
    }
    const relativePath = validateArchivePath(entry.path);
    if (!relativePath) continue;
    const outputPath = path.join(destination, ...relativePath.split('/'));
    if (entry.type === 'Directory') {
      await mkdir(outputPath, { recursive: true });
      continue;
    }
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, await entry.buffer());
  }
}

async function findRepositoryRoots(root: string): Promise<string[]> {
  const repositories: string[] = [];

  async function walk(directoryPath: string): Promise<void> {
    const childDirectories: string[] = [];
    let hasGitMetadata = false;
    const directory = await opendir(directoryPath);
    for await (const entry of directory) {
      if (entry.name === '.git') hasGitMetadata = true;
      else if (entry.isDirectory()) childDirectories.push(path.join(directoryPath, entry.name));
    }
    if (hasGitMetadata) {
      repositories.push(directoryPath);
      return;
    }
    for (const childDirectory of childDirectories) await walk(childDirectory);
  }

  await walk(root);
  return [...new Set(repositories)];
}

async function validateRepository(repositoryPath: string): Promise<void> {
  const insideWorkTree = (
    await runGitText(repositoryPath, ['rev-parse', '--is-inside-work-tree'])
  ).trim();
  if (insideWorkTree !== 'true') {
    throw new AppError(422, 'INVALID_REPOSITORY', 'The imported content is not a Git working tree.');
  }
  await runGitText(repositoryPath, ['rev-parse', '--verify', 'HEAD^{commit}']);
}

export async function prepareClone(urlValue: string): Promise<PreparedRepository> {
  const url = validateRemoteUrl(urlValue);
  const containerPath = await createStagingDirectory();
  const repositoryPath = path.join(containerPath, 'repository');
  try {
    await runGitText(containerPath, ['clone', '--no-local', url.toString(), repositoryPath]);
    await validateRepository(repositoryPath);
    return {
      containerPath,
      repositoryPath,
      name: repositoryNameFromUrl(url),
      source: 'clone',
    };
  } catch (error) {
    await rm(containerPath, { recursive: true, force: true });
    throw error;
  }
}

export async function prepareUpload(
  archive: Buffer,
  originalName: string,
): Promise<PreparedRepository> {
  if (archive.length === 0 || archive.length > config.uploadLimitBytes) {
    throw new AppError(413, 'UPLOAD_TOO_LARGE', 'The ZIP is empty or exceeds the upload size limit.');
  }
  if (!originalName.toLowerCase().endsWith('.zip')) {
    throw new AppError(400, 'INVALID_FILE_TYPE', 'Upload a .zip repository archive.');
  }

  const containerPath = await createStagingDirectory();
  const extractedPath = path.join(containerPath, 'extracted');
  await mkdir(extractedPath, { recursive: true });
  try {
    await extractArchive(archive, extractedPath);
    const repositories = await findRepositoryRoots(extractedPath);
    if (repositories.length !== 1) {
      throw new AppError(
        422,
        'AMBIGUOUS_REPOSITORY',
        repositories.length === 0
          ? 'The ZIP does not contain a Git working tree.'
          : 'The ZIP contains more than one Git working tree.',
      );
    }
    const repositoryPath = repositories[0];
    const repositoryStats = await stat(repositoryPath);
    if (!repositoryStats.isDirectory()) {
      throw new AppError(422, 'INVALID_REPOSITORY', 'The repository root is invalid.');
    }
    await validateRepository(repositoryPath);
    return {
      containerPath,
      repositoryPath,
      name: path.basename(repositoryPath),
      source: 'upload',
    };
  } catch (error) {
    await rm(containerPath, { recursive: true, force: true });
    throw error;
  }
}
