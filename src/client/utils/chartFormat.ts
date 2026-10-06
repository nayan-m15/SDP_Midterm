import type { TimeGranularity } from '../../shared/metrics';

/** Formats a TimeBucket.bucket key ("2024-05" or "2024-05-01") into a short axis label. */
export function formatBucketLabel(bucket: string, granularity: TimeGranularity): string {
  if (granularity === 'month') {
    const [year, month] = bucket.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit',
    });
  }
  const date = new Date(`${bucket}T00:00:00Z`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mixHex(from: string, to: string, t: number): string {
  const a = Number.parseInt(from.slice(1), 16);
  const b = Number.parseInt(to.slice(1), 16);
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Heatmap color for a growth value relative to the largest absolute growth in the data set. */
export function colorForGrowth(growth: number, maxAbsGrowth: number): string {
  if (maxAbsGrowth <= 0) return '#8a9592';
  const t = clamp(growth / maxAbsGrowth, -1, 1);
  if (t >= 0) return mixHex('#cfe9e4', '#0d766e', t);
  return mixHex('#f6ddc9', '#e1845c', -t);
}

export function displayFileName(path: string): string {
  const parts = path.split('/');
  return parts.at(-1) ?? path;
}
