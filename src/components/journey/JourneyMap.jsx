export default function JourneyMap({ stages }) {
  const width = 1100;
  const height = 190;
  const pad = 70;
  const n = stages.length;

  const points = stages.map((stage, i) => ({
    ...stage,
    x: pad + (i * (width - pad * 2)) / (n - 1),
    y: height / 2 + Math.sin(i * 0.85) * 32,
  }));

  const currentIdx = points.findIndex((p) => p.status === 'current');
  const activePoints = currentIdx > -1 ? points.slice(0, currentIdx + 1) : points.filter(p => p.status === 'done');

  const pathD = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="journey-container">
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 760 }}>
        {/* Base path */}
        <path d={pathD(points)} fill="none" stroke="var(--border)" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
        {/* Active path */}
        {activePoints.length > 1 && (
          <path d={pathD(activePoints)} fill="none" stroke="var(--brand-accent)" strokeWidth="3.5" strokeLinecap="round" />
        )}

        {points.map((p) => {
          const isDone = p.status === 'done';
          const isCurrent = p.status === 'current';
          const isLocked = p.status === 'locked';

          return (
            <g key={p.id}>
              {isCurrent && (
                <circle cx={p.x} cy={p.y} r="18" fill="var(--brand-accent)" opacity="0.2">
                  <animate attributeName="r" values="14;22;14" dur="2.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.25;0.05;0.25" dur="2.2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                cx={p.x} cy={p.y} r="11"
                fill={isDone ? 'var(--brand-primary)' : isCurrent ? 'var(--brand-accent)' : 'var(--surface-alt)'}
                stroke={isLocked ? 'var(--border)' : 'var(--bg)'}
                strokeWidth="3"
              />
              {isDone && (
                <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">✓</text>
              )}
              {isCurrent && (
                <circle cx={p.x} cy={p.y} r="4" fill="#fff" />
              )}
              <text
                x={p.x}
                y={p.y + (p.id % 2 === 0 ? 32 : -20)}
                textAnchor="middle"
                fontFamily="Inter, sans-serif"
                fontSize="12"
                fontWeight={isCurrent ? '700' : '500'}
                fill={isLocked ? 'var(--text-3)' : 'var(--text)'}
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
