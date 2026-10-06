import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ObjectAggregate, RepositoryAnalysis } from '../../shared/metrics';

const integer = new Intl.NumberFormat('en-US');
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function displayPath(item: ObjectAggregate): string {
  const parts = item.path.split('/');
  return parts.at(-1) ?? item.path;
}

export function RepositorySummary({ analysis }: { analysis: RepositoryAnalysis }) {
  const metrics = analysis.repositoryMetrics;
  const cards = [
    ['Added', integer.format(metrics.added), 'positive'],
    ['Removed', integer.format(metrics.removed), 'negative'],
    ['Net growth', `${metrics.growth > 0 ? '+' : ''}${integer.format(metrics.growth)}`, metrics.growth >= 0 ? 'positive' : 'negative'],
    ['Churn', integer.format(metrics.churn), 'accent'],
    ['Modifications', integer.format(metrics.modifications), 'neutral'],
    ['Change rate', decimal.format(metrics.churnRate), 'neutral'],
  ];
  const chartData = [...analysis.files]
    .sort((left, right) => right.metrics.churn - left.metrics.churn)
    .slice(0, 8)
    .map((item) => ({ name: displayPath(item), churn: item.metrics.churn, growth: item.metrics.growth }));

  return (
    <>
      <section className="repository-heading">
        <div>
          <span className="eyebrow">Active repository</span>
          <h2>{analysis.repository.name}</h2>
          <p>
            {analysis.repository.source === 'clone' ? 'Remote clone' : 'ZIP upload'} · {analysis.repository.ref}
            {' · '}{analysis.commitCount.toLocaleString()} non-merge commits
          </p>
        </div>
        <code title={analysis.repository.resolvedCommit}>
          {analysis.repository.resolvedCommit.slice(0, 12)}
        </code>
      </section>

      <section className="metric-grid" aria-label="Repository metrics">
        {cards.map(([label, value, tone]) => (
          <article className={`metric-card ${tone}`} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="panel chart-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Hotspots</span>
            <h2>Highest-churn files</h2>
          </div>
          <span className="legend-note">Top {chartData.length} by changed lines</span>
        </div>
        {chartData.length ? (
          <div className="chart-container" aria-label="Highest-churn files chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dce3e2" />
                <XAxis dataKey="name" angle={-18} textAnchor="end" interval={0} height={52} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={42} />
                <Tooltip cursor={{ fill: '#f3f7f6' }} />
                <Bar dataKey="churn" fill="#0d766e" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="empty-copy">No text-file changes were found.</p>}
      </section>
    </>
  );
}
