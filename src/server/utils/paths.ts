import path from 'node:path';
import { AppError } from '../errors';

export function normalizeGitPath(value: string): string {
  const normalized = path.posix.normalize(value.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (!normalized || normalized === '.' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw new AppError(422, 'INVALID_REPOSITORY_PATH', 'The repository contains an invalid path.');
  }
  return normalized;
}

export function validateArchivePath(value: string): string {
  if (!value || value.includes('\0') || value.includes('\\') || path.posix.isAbsolute(value)) {
    throw new AppError(422, 'UNSAFE_ARCHIVE', 'The ZIP contains an unsafe path.');
  }
  const normalized = path.posix.normalize(value);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new AppError(422, 'UNSAFE_ARCHIVE', 'The ZIP contains an unsafe path.');
  }
  return normalized.replace(/\/$/, '');
}

export function directoryAncestors(filePath: string): string[] {
  const normalized = normalizeGitPath(filePath);
  const parts = normalized.split('/');
  const directories = ['.'];
  for (let index = 1; index < parts.length; index += 1) {
    directories.push(parts.slice(0, index).join('/'));
  }
  return directories;
}
