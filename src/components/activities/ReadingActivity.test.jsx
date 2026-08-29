import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReadingActivity from './ReadingActivity';

// A reading turns authored markdown into HTML and puts it in the DOM, which
// makes it the one activity where course content reaches innerHTML. Course
// content is written by trainers and admins and rendered into every trainee's
// session, so it is untrusted as far as the browser is concerned — the
// sanitizing is the point, and these are the tests that would fail if somebody
// "simplified" safeHtml away.

const read = (activity) => render(<ReadingActivity activity={activity} />);

describe('rendering the body', () => {
  it('turns markdown headings and emphasis into real elements', () => {
    read({ body: '# Fire safety\n\nUse **the right** extinguisher.' });

    expect(screen.getByRole('heading', { name: 'Fire safety' })).toBeInTheDocument();
    expect(screen.getByText('the right').tagName).toBe('STRONG');
  });

  it('renders a list', () => {
    const { container } = read({ body: '- Water\n- Foam\n- CO2' });
    expect(container.querySelectorAll('li')).toHaveLength(3);
  });

  /**
   * The api layer flattens the stored payload onto activity.body, but the
   * component still accepts activity.content. Both paths must render, or the
   * fallback is a silently blank page rather than a fallback.
   */
  it('accepts content as well as body', () => {
    read({ content: 'Stored the other way.' });
    expect(screen.getByText(/stored the other way/i)).toBeInTheDocument();
  });

  it('says so when there is nothing to read', () => {
    read({});
    expect(screen.getByText('No content provided.')).toBeInTheDocument();
  });

  it('does not treat a non-string body as content', () => {
    read({ body: { nested: 'object' } });
    expect(screen.getByText('No content provided.')).toBeInTheDocument();
  });
});

describe('what it refuses to put in the DOM', () => {
  it('strips a script tag out of authored content', () => {
    const { container } = read({ body: 'Before<script>window.stolen = 1</script>After' });

    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('Before');
    expect(container.textContent).toContain('After');
  });

  it('strips an inline event handler', () => {
    const { container } = read({ body: '<img src=x onerror="window.stolen = 1">' });
    expect(container.innerHTML).not.toContain('onerror');
  });

  /** javascript: on an anchor is the other half of the same hole. */
  it('refuses a javascript: link', () => {
    const { container } = read({ body: '<a href="javascript:alert(1)">tap</a>' });
    const link = container.querySelector('a');
    expect(link?.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
  });

  /**
   * An authored link opens in a new tab, so without rel the opened page can
   * reach back through window.opener. The sanitizer adds it; this is what
   * notices if that hook is ever dropped.
   */
  it('gives an external link a safe rel', () => {
    const { container } = read({ body: '<a href="https://example.com">docs</a>' });
    const link = container.querySelector('a');

    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});

describe('the reading time', () => {
  it('shows what the activity says', () => {
    read({ body: 'x', estimatedMinutes: 12 });
    expect(screen.getByText(/12 minutes/)).toBeInTheDocument();
  });

  it('falls back rather than showing nothing', () => {
    read({ body: 'x' });
    expect(screen.getByText(/5 minutes/)).toBeInTheDocument();
  });
});
