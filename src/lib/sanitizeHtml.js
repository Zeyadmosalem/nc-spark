import DOMPurify from 'dompurify';

// Course content is authored by trainers and admins and then rendered into
// every trainee's session, so it is untrusted input as far as the browser is
// concerned. Everything that reaches dangerouslySetInnerHTML must go through
// here first.

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

const ALLOWED_ATTR = ['class', 'href', 'title', 'target', 'rel'];

// Anchors that open a new tab get rel="noopener noreferrer" so the opened page
// cannot reach back through window.opener.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Strip scripts, event handlers and any other active content from an HTML
 * string, leaving only safe formatting markup.
 *
 * @param {string} dirty Untrusted HTML.
 * @returns {string} HTML that is safe to pass to dangerouslySetInnerHTML.
 */
export function sanitizeHtml(dirty) {
  if (typeof dirty !== 'string' || dirty.length === 0) return '';
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Block javascript:, data: and similar URI payloads on href.
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):|^[#/]/i,
  });
}

/**
 * Convenience wrapper for the dangerouslySetInnerHTML prop, so call sites read
 * as `<div {...safeHtml(content)} />` and cannot forget to sanitize.
 *
 * @param {string} dirty Untrusted HTML.
 */
export function safeHtml(dirty) {
  return { dangerouslySetInnerHTML: { __html: sanitizeHtml(dirty) } };
}
