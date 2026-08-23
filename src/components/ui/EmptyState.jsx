/**
 * "There is nothing here" said properly.
 *
 * An empty list and a failed request look identical when both render as blank
 * space, which is the mistake QueryError exists to prevent on the failure
 * side. This is the other half: nothing here, on purpose, and here is what to
 * do about it.
 *
 * The icon is decorative and hidden from assistive technology — the title
 * already says what the emoji is gesturing at.
 */
export default function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon" aria-hidden="true">{icon}</div>}
      {title && <p className="empty-state-title">{title}</p>}
      {children && <p className="empty-state-body">{children}</p>}
      {action}
    </div>
  );
}
