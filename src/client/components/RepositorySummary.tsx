import type { RepositoryAnalysis } from '../../shared/metrics';
import { FileHotspotsTreemap } from './FileHotspotsTreemap';

const integer = new Intl.NumberFormat('en-US');
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

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

      <FileHotspotsTreemap files={analysis.files} />
    </>
  );
}
