import { Fragment, useMemo, useState } from 'react';
import type { AggregateMetric, ObjectAggregate } from '../../shared/metrics';

type SortKey = 'path' | keyof AggregateMetric;

const integer = new Intl.NumberFormat('en-US');

export function MetricsTable({ title, items }: { title: string; items: ObjectAggregate[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('churn');
  const [descending, setDescending] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const sorted = useMemo(() => [...items].sort((left, right) => {
    const leftValue = sortKey === 'path' ? left.path : left.metrics[sortKey];
    const rightValue = sortKey === 'path' ? right.path : right.metrics[sortKey];
    const comparison = typeof leftValue === 'string'
      ? leftValue.localeCompare(String(rightValue))
      : Number(leftValue) - Number(rightValue);
    return descending ? -comparison : comparison;
  }), [items, sortKey, descending]);

  function changeSort(key: SortKey) {
    if (key === sortKey) setDescending((value) => !value);
    else {
      setSortKey(key);
      setDescending(key !== 'path');
    }
  }

  const headings: Array<[SortKey, string]> = [
    ['path', 'Path'], ['added', 'Added'], ['removed', 'Removed'], ['growth', 'Growth'],
    ['churn', 'Churn'], ['modifications', 'Mods'], ['modificationFrequency', 'Frequency'],
    ['churnRate', 'Churn / commit'],
  ];

  return (
    <section className="panel table-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Commit-set metrics</span>
          <h2>{title}</h2>
        </div>
        <span className="count-badge">{items.length.toLocaleString()} objects</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {headings.map(([key, label]) => (
                <th key={key} scope="col">
                  <button type="button" onClick={() => changeSort(key)}>
                    {label}{sortKey === key ? (descending ? ' ↓' : ' ↑') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const isExpanded = expanded === item.path;
              return (
                <Fragment key={item.path}>
                  <tr className="metric-row">
                    <td>
                      <button
                        type="button"
                        className="path-button"
                        onClick={() => setExpanded(isExpanded ? null : item.path)}
                        aria-expanded={isExpanded}
                      >
                        <span>{isExpanded ? '−' : '+'}</span>{item.path}
                      </button>
                    </td>
                    <td className="number positive-text">{integer.format(item.metrics.added)}</td>
                    <td className="number negative-text">{integer.format(item.metrics.removed)}</td>
                    <td className={`number ${item.metrics.growth >= 0 ? 'positive-text' : 'negative-text'}`}>
                      {item.metrics.growth > 0 ? '+' : ''}{integer.format(item.metrics.growth)}
                    </td>
                    <td className="number">{integer.format(item.metrics.churn)}</td>
                    <td className="number">{integer.format(item.metrics.modifications)}</td>
                    <td className="number">{(item.metrics.modificationFrequency * 100).toFixed(1)}%</td>
                    <td className="number">{item.metrics.churnRate.toFixed(2)}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="detail-row">
                      <td colSpan={8}>
                        <div className="ownership-list">
                          <strong>Author contribution</strong>
                          {item.authors.length ? item.authors.map((author) => (
                            <span key={author.author.id}>
                              {author.author.name}: {integer.format(author.churn)} churn · {author.modifications} mods · {(author.ownership * 100).toFixed(1)}%
                            </span>
                          )) : <span>No text churn for this object.</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
