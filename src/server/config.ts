import path from 'node:path';

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: positiveInteger(process.env.PORT, 3001),
  dataRoot: path.resolve(process.env.RAT_DATA_ROOT ?? '.rat-data'),
  uploadLimitBytes: positiveInteger(process.env.RAT_UPLOAD_LIMIT_BYTES, 50 * 1024 * 1024),
  extractedLimitBytes: positiveInteger(process.env.RAT_EXTRACTED_LIMIT_BYTES, 250 * 1024 * 1024),
  extractedFileLimit: positiveInteger(process.env.RAT_EXTRACTED_FILE_LIMIT, 20_000),
  gitTimeoutMs: positiveInteger(process.env.RAT_GIT_TIMEOUT_MS, 120_000),
  gitMaxOutputBytes: positiveInteger(process.env.RAT_GIT_MAX_OUTPUT_BYTES, 256 * 1024 * 1024),
};
