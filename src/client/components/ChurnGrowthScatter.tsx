import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { ObjectAggregate } from '../../shared/metrics';

const integer = new Intl.NumberFormat('en-US');

interface ScatterPoint {
  path: string;
  churn: number;
  growth: number;
  modifications: number;
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="scatter-tooltip">
      <strong>{item.path}</strong>
      <span>{integer.format(item.churn)} churn</span>
      <span>{item.growth > 0 ? '+' : ''}{integer.format(item.growth)} growth</span>
      <span>{integer.format(item.modifications)} modifications</span>
    </div>
  );
}

export function ChurnGrowthScatter({ files }: { files: ObjectAggregate[] }) {
  const data: ScatterPoint[] = files
    .filter((item) => item.metrics.churn > 0)
    .map((item) => ({
      path: item.path,
      churn: item.metrics.churn,
      growth: item.metrics.growth,
      modifications: item.metrics.modifications,
    }));

  return (
    <section className="panel scatter-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Multi-axis view</span>
          <h2>Churn vs. growth</h2>
        </div>
        <span className="legend-note">Bubble size = modifications</span>
      </div>
      {data.length ? (
        <div className="chart-container lg" aria-label="Churn versus growth scatter plot">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#dce3e2" />
              <XAxis
                type="number"
                dataKey="churn"
                name="Churn"
                tick={{ fontSize: 11 }}
                label={{ value: 'Churn (lines)', position: 'insideBottom', offset: -16, fontSize: 11, fill: '#64706e' }}
              />
              <YAxis
                type="number"
                dataKey="growth"
                name="Growth"
                tick={{ fontSize: 11 }}
                width={56}
                label={{ value: 'Growth (lines)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64706e' }}
              />
              <ZAxis type="number" dataKey="modifications" range={[36, 360]} name="Modifications" />
              <ReferenceLine y={0} stroke="#b7c0bd" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<ScatterTooltip />} />
              <Scatter data={data} fill="#5375d6" fillOpacity={0.72} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="empty-copy">No text churn is available to plot.</p>
      )}
    </section>
  );
}
