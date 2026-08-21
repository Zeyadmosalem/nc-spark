import { describe, it, expect } from 'vitest';
import { sanitizeHtml, safeHtml } from './sanitizeHtml';

// Course content is authored by trainers/admins and rendered into every
// trainee's session, so these payloads represent a trainer account being
// misused (or compromised) to attack trainees.
const ATTACKS = [
  ['script tag', '<script>alert(1)</script>'],
  ['img onerror', '<img src=x onerror="alert(1)">'],
  ['svg onload', '<svg onload=alert(1)>'],
  ['javascript: href', '<a href="javascript:alert(1)">click</a>'],
  ['iframe embed', '<iframe src="https://evil.example"></iframe>'],
  ['body onload', '<body onload=alert(1)>'],
  ['credential-harvesting form', '<form action="https://evil.example"><input name=p></form>'],
  ['css url(javascript:)', '<div style="background:url(javascript:alert(1))">x</div>'],
  ['data: uri navigation', '<a href="data:text/html,<script>alert(1)</script>">x</a>'],
  ['nested obfuscated tag', '<div><scr<script>ipt>alert(1)</scr</script>ipt></div>'],
  ['object embed', '<object data="evil.swf"></object>'],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
];

describe('sanitizeHtml — blocks active content', () => {
  it.each(ATTACKS)('neutralises %s', (_name, payload) => {
    const out = sanitizeHtml(payload);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/onerror|onload|onclick/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/<iframe|<object|<embed|<form|<meta/i);
    expect(out).not.toMatch(/data:text\/html/i);
  });
});

describe('sanitizeHtml — preserves legitimate course formatting', () => {
  const strip = (h) => h.replace(/\s*(target|rel)="[^"]*"/g, '').replace(/<br\/>/g, '<br>');

  it.each([
    ['headings', '<h2>Safety Rules</h2>'],
    ['bold and italic', '<strong>Always</strong> wear a <em>helmet</em>'],
    ['lists', '<ul><li>Step one</li><li>Step two</li></ul>'],
    ['inline code', '<code class="inline-code">npm run dev</code>'],
    ['line breaks', 'para one<br/><br/>para two'],
    ['tables', '<table><tbody><tr><td>A</td></tr></tbody></table>'],
  ])('keeps %s intact', (_name, payload) => {
    expect(strip(sanitizeHtml(payload))).toBe(strip(payload));
  });

  it('keeps safe links but forces noopener/noreferrer', () => {
    const out = sanitizeHtml('<a href="https://example.com">docs</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it('allows mailto and relative links', () => {
    expect(sanitizeHtml('<a href="mailto:a@b.com">mail</a>')).toContain('mailto:a@b.com');
    expect(sanitizeHtml('<a href="/courses">courses</a>')).toContain('href="/courses"');
  });
});

describe('sanitizeHtml — input handling', () => {
  it.each([[null], [undefined], [''], [42], [{}]])('returns empty string for %s', (input) => {
    expect(sanitizeHtml(input)).toBe('');
  });
});

describe('safeHtml', () => {
  it('produces a sanitized dangerouslySetInnerHTML prop', () => {
    const props = safeHtml('<img src=x onerror="alert(1)"><strong>ok</strong>');
    expect(props.dangerouslySetInnerHTML.__html).toBe('<strong>ok</strong>');
  });
});
