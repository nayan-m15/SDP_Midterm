import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { AuthorMetric } from '../../shared/metrics';

const COLORS = ['#0d766e', '#e1845c', '#5375d6', '#d2aa3e', '#875bb5', '#4d8c57'];

export function AuthorMetrics({ authors }: { authors: AuthorMetric[] }) {
  const chartData = authors.slice(0, 6).map((item) => ({
    name: item.author.name,
    value: item.churn,
  }));

  return (
    <section className="panel authors-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Contributors</span>
          <h2>Repository ownership</h2>
        </div>
        <span className="legend-note">By total churn</span>
      </div>
      {authors.length ? (
        <div className="author-layout">
          <div className="ownership-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                  {chartData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => [`${Number(value).toLocaleString()} lines`, 'Churn']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="author-list">
            {authors.slice(0, 8).map((item, index) => (
              <div className="author-row" key={item.author.id}>
                <span className="author-swatch" style={{ background: COLORS[index % COLORS.length] }} />
                <div>
                  <strong>{item.author.name}</strong>
                  <small>{item.author.email || 'No email'}</small>
                </div>
                <span>{(item.ownership * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : <p className="empty-copy">No text churn is available for author ownership.</p>}
    </section>
  );
}
