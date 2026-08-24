
import Icon from './Icon';

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

/* Icon names, not emoji. An alert is the one component guaranteed to
   appear on a coloured tinted surface, and an emoji cannot take the
   tone's colour — so the warning glyph was yellow inside a red box. */
const ICON = {
  error: 'error',
  warning: 'warning',
  success: 'complete',
  info: 'info',
};

export default function Alert({ tone = 'error', title, children, error }) {
  // Accepts either an Error or arbitrary children, because most callers have
  // a TanStack mutation error and nothing else to say about it.
  const body = children ?? error?.message;

  // A title alone is enough. QueryError supplies "Could not load the catalog."
  // as the title and the server's message as the body, and an Error with an
  // empty message must not silence the part that says what failed.
  if (!body && !title) return null;

  const assertive = tone === 'error' || tone === 'warning';

  return (
    <div
      className={`alert alert-${tone}`}
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
    >
      <span className="alert-icon">
        <Icon name={ICON[tone] ?? 'info'} size={17} />
      </span>
      <div className="alert-body">
        {title && <div className="alert-title">{title}</div>}
        {body}
      </div>
    </div>
  );
}
