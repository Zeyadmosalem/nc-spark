/**
 * Loading placeholders shaped like the thing that is coming.
 *
 * Twenty screens rendered the bare string "Loading..." in a div. That tells
 * you nothing about what is arriving, and the layout jumps the moment it does.
 *
 * Every exported skeleton carries a visually hidden live message, because the
 * shimmer conveys nothing to a screen reader — and the message is the same
 * sentence the old text node used, so the announcement did not get worse.
 */

export function Skeleton({ width, height, circle = false, style }) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton ${circle ? 'skeleton-circle' : 'skeleton-text'}`}
      style={{ width, height, ...style }}
    />
  );
}

/** The live region every skeleton needs, and nothing else. */
export function LoadingLabel({ children }) {
  return <span role="status" aria-live="polite" className="sr-only">{children}</span>;
}

/** A list of rows: avatar, two lines of text, an action on the right. */
export function SkeletonList({ rows = 4, label = 'Loading' }) {
  return (
    <div className="card no-hover stack-md">
      <LoadingLabel>{label}</LoadingLabel>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <Skeleton circle width={40} height={40} />
          <div className="skeleton-stack">
            {/* Uneven widths: rows of identical bars read as a table, not text. */}
            <Skeleton width={`${55 + ((i * 13) % 30)}%`} />
            <Skeleton width={`${30 + ((i * 17) % 25)}%`} height="0.7rem" />
          </div>
          <Skeleton width={72} height={30} style={{ borderRadius: 'var(--r-md)' }} />
        </div>
      ))}
    </div>
  );
}

/** A row of stat cards. */
function SkeletonStats({ count = 4 }) {
  return (
    <div className={`stat-grid stat-grid-${count === 3 ? 3 : 4}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="stat-card" key={i}>
          <Skeleton width="45%" height="0.7rem" />
          <Skeleton width="60%" height="2rem" style={{ margin: '0.6rem 0 0.4rem' }} />
          <Skeleton width="70%" height="0.7rem" />
        </div>
      ))}
    </div>
  );
}

/**
 * The default whole-page shape: a heading, some stats, a list. Close enough to
 * every dashboard in the app that the real content lands roughly where the
 * placeholder was.
 */
export default function PageSkeleton({ label = 'Loading', stats = 4, rows = 4 }) {
  return (
    <div className="page-body stack-lg">
      <LoadingLabel>{label}</LoadingLabel>
      <div aria-hidden="true">
        <Skeleton width={110} height="0.7rem" style={{ marginBottom: '0.75rem' }} />
        <div className="skeleton skeleton-title" />
      </div>
      {stats > 0 && <SkeletonStats count={stats} />}
      {rows > 0 && (
        <div className="card no-hover stack-md">
          {Array.from({ length: rows }, (_, i) => (
            <div className="skeleton-row" key={i} aria-hidden="true">
              <Skeleton circle width={40} height={40} />
              <div className="skeleton-stack">
                <Skeleton width={`${55 + ((i * 13) % 30)}%`} />
                <Skeleton width={`${30 + ((i * 17) % 25)}%`} height="0.7rem" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
