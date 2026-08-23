/**
 * The visible half of a failed query.
 *
 * Without this a rejected fetch renders as an empty list, which reads as "you
 * have nothing" rather than "we could not load this" — the difference between
 * a trainee thinking there are no courses and knowing the page is broken.
 */
export default function QueryError({ error, what }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="card no-hover"
      style={{ padding: '1.25rem', borderLeft: '4px solid var(--brand-accent)' }}
    >
      <p style={{ color: 'var(--brand-accent)', margin: 0 }}>
        Could not load {what}.
      </p>
      {error.message && (
        <p style={{ color: 'var(--text-2)', fontSize: '0.85rem', margin: '0.35rem 0 0' }}>
          {error.message}
        </p>
      )}
    </div>
  );
}
