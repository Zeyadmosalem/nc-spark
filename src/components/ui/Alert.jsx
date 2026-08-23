/**
 * The visible half of a failure, and now of a success.
 *
 * There were four near-identical copies of this, each a bare <p> in the accent
 * colour. Two of them were not marked `role="alert"`, so a screen-reader user
 * pressed a button, the request was refused, and nothing was announced at all.
 *
 * `role="alert"` is applied only to errors and warnings. It interrupts a
 * screen reader mid-sentence, which is right for "that was refused" and rude
 * for "here is some context".
 */

const ICON = {
  error: '⚠️',
  warning: '⚠️',
  success: '✓',
  info: 'ℹ️',
};

export default function Alert({ tone = 'error', title, children, error }) {
  // Accepts either an Error or arbitrary children, because most callers have
  // a TanStack mutation error and nothing else to say about it.
  const body = children ?? error?.message;
  if (!body) return null;

  const assertive = tone === 'error' || tone === 'warning';

  return (
    <div
      className={`alert alert-${tone}`}
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
    >
      <span className="alert-icon" aria-hidden="true">{ICON[tone]}</span>
      <div className="alert-body">
        {title && <div className="alert-title">{title}</div>}
        {body}
      </div>
    </div>
  );
}
