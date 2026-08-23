/**
 * One headline number.
 *
 * Three variants of this existed — Metric, Stat and Figure — differing in
 * whether they took an icon, a subtitle or neither, and in whether the value
 * was a `div` or a `span`. Same card, three sizes of number.
 *
 * `value` is rendered as given, so a caller can pass an em dash for "not
 * measured yet". That distinction matters more than it looks: a dash and a
 * zero say very different things about a trainee.
 */
export default function StatCard({ label, value, sub, icon, color, tone }) {
  return (
    <div className="stat-card">
      {icon && (
        <div style={{ fontSize: '1.3rem', marginBottom: '0.35rem' }} aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="stat-card-value" style={{ color: color ?? undefined }}>{value}</div>
      <div className="stat-card-label">{label}</div>
      {sub && (
        <div
          className="stat-card-sub"
          style={tone === 'attention' ? { color: 'var(--brand-accent)' } : undefined}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
