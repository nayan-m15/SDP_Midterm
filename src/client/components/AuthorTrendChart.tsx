import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TimeSeriesResponse } from '../../shared/metrics';
import { formatBucketLabel } from '../utils/chartFormat';

const COLORS = ['#0d766e', '#e1845c', '#5375d6', '#d2aa3e', '#875bb5', '#4d8c57'];
const OTHER_COLOR = '#9aa6a3';
const integer = new Intl.NumberFormat('en-US');

export function AuthorTrendChart({ data }: { data: TimeSeriesResponse | null }) {
  const authors = data?.authors ?? [];
  const chartData = (data?.buckets ?? []).map((bucket) => {
    const row: Record<string, string | number> = { label: formatBucketLabel(bucket.bucket, data!.granularity) };
    for (const author of authors) {
      row[author.id] = bucket.authorChurn[author.id] ?? 0;
    }
    return row;
  });
  const tickInterval = chartData.length > 20 ? Math.floor(chartData.length / 14) : 0;

  return (
    <section className="panel trend-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Contributors over time</span>
          <h2>Per-author contribution trend</h2>
        </div>
        <span className="legend-note">Churn per period</span>
      </div>
      {chartData.length && authors.length ? (
        <div className="chart-container lg" aria-label="Per-author contribution trend chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dce3e2" />
              <XAxis dataKey="label" angle={-22} textAnchor="end" interval={tickInterval} height={52} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} width={44} />
              <Tooltip formatter={(value) => `${integer.format(Number(value))} lines`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {authors.map((author, index) => (
                <Line
                  key={author.id}
                  dataKey={author.id}
                  name={author.name}
                  type="monotone"
                  stroke={author.id === '__other__' ? OTHER_COLOR : COLORS[index % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="empty-copy">No author contribution history to chart for this selection.</p>
      )}
    </section>
  );
}
