import { safeHtml } from '../../lib/sanitizeHtml';

export default function ReadingActivity({ activity }) {
  // The api layer flattens the stored content payload, so the markdown body
  // arrives as activity.body. The activity.content fallback keeps the
  // prototype's dummy data rendering while the rest of the app migrates.
  const source = activity?.body ?? activity?.content;
  if (typeof source !== 'string' || !source) return <div>No content provided.</div>;

  // Simple markdown-to-html conversion for the demo. This deliberately does
  // not escape the source first, so the output is sanitized below before it
  // reaches the DOM.
  const htmlContent = source
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/`(.*?)`/gim, '<code>$1</code>')
    .replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>')
    .replace(/<\/ul>\n<ul>/gim, '')
    .replace(/\n\n/gim, '<br/><br/>');

  return (
    <div className="reading-activity">
      <div
        className="reading-content"
        style={{ lineHeight: 1.6, color: 'var(--text)', fontSize: '1.05rem' }}
        {...safeHtml(htmlContent)}
      />
      <div style={{ marginTop: '2rem', fontSize: '0.85rem', color: 'var(--text-3)' }}>
        Estimated reading time: {activity.estimatedMinutes || 5} minutes
      </div>
    </div>
  );
}
