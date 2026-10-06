import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import type { ObjectAggregate } from '../../shared/metrics';
import { colorForGrowth, displayFileName } from '../utils/chartFormat';

const integer = new Intl.NumberFormat('en-US');
const MAX_FILES = 60;

interface TreemapNode {
  name: string;
  path: string;
  size: number;
  growth: number;
  churn: number;
  [key: string]: string | number;
}

interface CellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  path?: string;
  growth?: number;
  churn?: number;
  maxAbsGrowth: number;
}

function TreemapCell({ x = 0, y = 0, width = 0, height = 0, name = '', growth = 0, churn = 0, maxAbsGrowth }: CellProps) {
  if (width <= 0 || height <= 0) return null;
  const fill = colorForGrowth(growth, maxAbsGrowth);
  const showLabel = width > 48 && height > 22;
  const showChurn = showLabel && height > 40;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: '#fffefa', strokeWidth: 2 }} />
      {showLabel && (
        <text x={x + 6} y={y + 16} fontSize={10} fill="#172321" fontFamily="'DM Mono', monospace">
          {name.length > Math.floor(width / 6) ? `${name.slice(0, Math.floor(width / 6) - 1)}…` : name}
        </text>
      )}
      {showChurn && (
        <text x={x + 6} y={y + 30} fontSize={9} fill="#4d5a58" fontFamily="'DM Mono', monospace">
          {integer.format(churn)} churn
        </text>
      )}
    </g>
  );
}

function TreemapTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TreemapNode }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  if (!item?.path) return null;
  return (
    <div className="treemap-tooltip">
      <strong>{item.path}</strong>
      <span>{integer.format(item.churn)} churn</span>
      <span>{item.growth > 0 ? '+' : ''}{integer.format(item.growth)} growth</span>
    </div>
  );
}

export function FileHotspotsTreemap({ files }: { files: ObjectAggregate[] }) {
  const ranked = [...files]
    .filter((item) => item.metrics.churn > 0)
    .sort((left, right) => right.metrics.churn - left.metrics.churn)
    .slice(0, MAX_FILES);
  const data: TreemapNode[] = ranked.map((item) => ({
    name: displayFileName(item.path),
    path: item.path,
    size: item.metrics.churn,
    growth: item.metrics.growth,
    churn: item.metrics.churn,
  }));
  const maxAbsGrowth = data.reduce((max, item) => Math.max(max, Math.abs(item.growth)), 0);

  return (
    <section className="panel chart-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Hotspots</span>
          <h2>Highest-churn files</h2>
        </div>
        <span className="legend-note">Top {data.length} by churn · color = growth</span>
      </div>
      {data.length ? (
        <div className="chart-container lg" aria-label="File hotspots treemap">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={data}
              dataKey="size"
              aspectRatio={4 / 3}
              stroke="#fffefa"
              content={<TreemapCell maxAbsGrowth={maxAbsGrowth} />}
            >
              <Tooltip content={<TreemapTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="empty-copy">No text-file changes were found.</p>
      )}
    </section>
  );
}
