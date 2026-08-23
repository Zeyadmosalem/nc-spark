import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ThemeProvider from './ThemeProvider';
import { useTheme } from './theme-context';

function Harness() {
  const { theme, toggleTheme } = useTheme();
  return <button type="button" onClick={toggleTheme}>theme is {theme}</button>;
}

const show = () => render(<ThemeProvider><Harness /></ThemeProvider>);

/** window.matchMedia does not exist in jsdom; every test states what it wants. */
function prefersDark(dark) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: dark });
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  prefersDark(false);
});
afterEach(() => vi.restoreAllMocks());

describe('choosing the initial theme', () => {
  /**
   * The prototype defaulted to light regardless. Someone who runs their
   * machine dark has already said what they want before they ever open this
   * app, and flashing a white page at them ignores it.
   */
  it('follows the operating system on a first visit', () => {
    prefersDark(true);
    show();
    expect(screen.getByRole('button')).toHaveTextContent('theme is dark');
  });

  it('uses light when the system asks for light', () => {
    show();
    expect(screen.getByRole('button')).toHaveTextContent('theme is light');
  });

  // An explicit choice outranks the system preference.
  it('prefers a saved choice over the system', () => {
    prefersDark(true);
    localStorage.setItem('nc_theme', 'light');
    show();
    expect(screen.getByRole('button')).toHaveTextContent('theme is light');
  });

  it('ignores a stored value that is not a theme', () => {
    localStorage.setItem('nc_theme', 'chartreuse');
    show();
    expect(screen.getByRole('button')).toHaveTextContent('theme is light');
  });

  /**
   * A private window, or a browser set to block site data, throws on access
   * rather than returning null. Not being able to remember a preference is no
   * reason to fail to render.
   */
  it('survives storage being unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => { throw new Error('denied'); });
    prefersDark(true);
    expect(() => show()).not.toThrow();
    expect(screen.getByRole('button')).toHaveTextContent('theme is dark');
    getItem.mockRestore();
  });
});

describe('applying and remembering it', () => {
  // The stylesheet keys off data-theme; state alone changes nothing visible.
  it('stamps the theme on the document', () => {
    show();
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('toggles, stamps and persists', async () => {
    show();
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('theme is dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('nc_theme')).toBe('dark');
  });

  // The key is unchanged from AppContext, so an existing preference survives.
  it('keeps reading the key the prototype wrote', () => {
    localStorage.setItem('nc_theme', 'dark');
    show();
    expect(screen.getByRole('button')).toHaveTextContent('theme is dark');
  });

  it('does not throw when it cannot write', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => { throw new Error('quota'); });
    show();
    await userEvent.click(screen.getByRole('button'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    setItem.mockRestore();
  });
});

describe('without a provider', () => {
  // Every component test in the suite renders pages outside this provider.
  it('is a working no-op', async () => {
    render(<Harness />);
    expect(screen.getByRole('button')).toHaveTextContent('theme is light');
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('theme is light');
  });
});
