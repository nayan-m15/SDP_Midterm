import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TimeGranularity, TimeSeriesResponse } from '../../shared/metrics';
import { formatBucketLabel } from '../utils/chartFormat';

const integer = new Intl.NumberFormat('en-US');
const GRANULARITIES: Array<[TimeGranularity | 'auto', string]> = [
  ['auto', 'Auto'],
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
];

export function ActivityTimeline({
  data,
  granularity,
  loading,
  onGranularityChange,
}: {
  data: TimeSeriesResponse | null;
  granularity: TimeGranularity | 'auto';
  loading?: boolean;
  onGranularityChange(value: TimeGranularity | 'auto'): void;
}) {
  const chartData = (data?.buckets ?? []).map((bucket) => ({
    label: formatBucketLabel(bucket.bucket, data!.granularity),
    commits: bucket.commits,
    churn: bucket.churn,
  }));
  const tickInterval = chartData.length > 20 ? Math.floor(chartData.length / 14) : 0;

  return (
    <section className="panel timeline-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Over time</span>
          <h2>Commit activity timeline</h2>
        </div>
        <div className="mode-switch" role="group" aria-label="Timeline granularity">
          {GRANULARITIES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={granularity === value ? 'active' : ''}
              onClick={() => onGranularityChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {chartData.length ? (
        <div className={`chart-container lg${loading ? ' is-loading' : ''}`} aria-label="Commit activity over time">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dce3e2" />
              <XAxis
                dataKey="label"
                angle={-22}
                textAnchor="end"
                interval={tickInterval}
                height={52}
                tick={{ fontSize: 10 }}
              />
              <YAxis yAxisId="commits" tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
              <YAxis yAxisId="churn" orientation="right" tick={{ fontSize: 11 }} width={48} />
              <Tooltip
                cursor={{ fill: '#f3f7f6' }}
                formatter={(value, name) => [
                  name === 'Commits' ? integer.format(Number(value)) : `${integer.format(Number(value))} lines`,
                  name,
                ]}
              />
              <Bar yAxisId="commits" dataKey="commits" name="Commits" fill="#5375d6" radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="churn"
                dataKey="churn"
                name="Churn"
                type="monotone"
                stroke="#0d766e"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="empty-copy">No commit activity to chart for this selection.</p>
      )}
    </section>
  );
}
