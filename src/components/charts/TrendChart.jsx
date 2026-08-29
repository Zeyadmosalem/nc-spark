import { useId, useState } from 'react';
import { PRIMARY } from './chartTokens';
import { formatDate } from '../../lib/format';

/**
 * One measure over time, as an area with its line on top.
 *
 * Change-over-time is the job, so the form is a line rather than a row of
 * bars. One series, so there is no legend: the title says what is plotted, and
 * a legend box for a single thing is furniture.
 *
 * The empty days are drawn, not skipped. A chart built only from the days that
 * have events draws a smooth line straight through a fortnight of doing
 * nothing, which is the opposite of what a progress chart is for.
 */
export default function TrendChart({
  data,
  height = 160,
  label = 'value',
  formatValue = (n) => n,
}) {
  const gradientId = useId();
  const [hover, setHover] = useState(null);

  if (!data || data.length === 0) return null;

  // A fixed coordinate system scaled by the viewBox, with non-scaling strokes
  // so a 2px line stays 2px at any container width.
  const W = 600;
  const H = 200;
  const PAD = { top: 12, right: 8, bottom: 22, left: 8 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max = Math.max(1, ...data.map((d) => d.points));
  const x = (i) => PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v) => PAD.top + plotH - (v / max) * plotH;

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.points)}`).join(' ');
  const area = `${line} L ${x(data.length - 1)} ${PAD.top + plotH} L ${x(0)} ${PAD.top + plotH} Z`;

  const total = data.reduce((sum, d) => sum + d.points, 0);
  const dayLabel = (iso) => formatDate(iso, { year: false });

  return (
    <figure className="chart-figure">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart-svg"
        style={{ height }}
        role="img"
        aria-label={`${label} over the last ${data.length} days, ${formatValue(total)} in total`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PRIMARY} stopOpacity="0.28" />
            <stop offset="100%" stopColor={PRIMARY} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Recessive: the grid is a reference, not content. */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={PAD.left} x2={W - PAD.right}
            y1={PAD.top + plotH * t} y2={PAD.top + plotH * t}
            className="chart-grid" vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line} fill="none" stroke={PRIMARY} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {hover !== null && (
          <>
            <line
              x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH}
              className="chart-crosshair" vectorEffect="non-scaling-stroke"
            />
            {/* A 2px surface ring keeps the marker readable over the line. */}
            <circle
              cx={x(hover)} cy={y(data[hover].points)} r="5"
              fill={PRIMARY} stroke="var(--surface)" strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}

        {/* Hit targets are wider than the marks, so hovering is not a game. */}
        {data.map((d, i) => (
          <rect
            key={d.date}
            x={x(i) - plotW / data.length / 2} y={PAD.top}
            width={plotW / data.length} height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}

        {/* Only the ends are labelled: a date on every point is noise. */}
        <text x={PAD.left} y={H - 6} className="chart-axis-label" textAnchor="start">
          {dayLabel(data[0].date)}
        </text>
        <text x={W - PAD.right} y={H - 6} className="chart-axis-label" textAnchor="end">
          {dayLabel(data.at(-1).date)}
        </text>
      </svg>

      <figcaption className="chart-caption" aria-live="polite">
        {hover === null
          ? `${formatValue(total)} over ${data.length} days`
          : `${dayLabel(data[hover].date)} — ${formatValue(data[hover].points)}`}
      </figcaption>
    </figure>
  );
}
