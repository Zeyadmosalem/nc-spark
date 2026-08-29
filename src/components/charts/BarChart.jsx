import { useState } from 'react';
import { PRIMARY } from './chartTokens';

/**
 * Magnitude across a handful of named things, as horizontal bars.
 *
 * Horizontal rather than vertical because the categories here are people and
 * course titles: a name reads along a row and has room to be a name, where a
 * column chart turns it into a rotated stub.
 *
 * Built from divs rather than SVG. A bar chart is a list of labelled
 * quantities, so a list is what it should be in the DOM — it wraps, it reflows
 * on a phone, and a screen reader reads it as rows rather than as a graphic.
 */
export default function BarChart({
  rows,
  max: fixedMax,
  formatValue = (n) => n,
  emptyLabel = 'Nothing to show yet.',
  colorFor,
}) {
  const [hover, setHover] = useState(null);

  if (!rows || rows.length === 0) {
    return <p className="muted-2">{emptyLabel}</p>;
  }

  const max = Math.max(1, fixedMax ?? Math.max(...rows.map((r) => r.value)));

  return (
    <ul className="bar-chart">
      {rows.map((row, i) => {
        const pct = Math.max(0, Math.min(100, (row.value / max) * 100));
        return (
          <li
            key={row.id ?? row.label}
            className="bar-row"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="bar-label" title={row.label}>{row.label}</span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{
                  width: `${pct}%`,
                  background: colorFor ? colorFor(row, i) : PRIMARY,
                  opacity: hover === null || hover === i ? 1 : 0.55,
                }}
              />
            </span>
            {/* Values wear text tokens, never the series colour. */}
            <span className="bar-value">{formatValue(row.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}
