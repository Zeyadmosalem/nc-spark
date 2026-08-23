import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';

vi.mock('./Sidebar', () => ({
  default: ({ navItems }) => (
    <nav aria-label="Sidebar">
      {navItems.filter((i) => i.to).map((i) => (
        <Link key={i.to} to={i.to}>{i.label}</Link>
      ))}
    </nav>
  ),
}));

const RoleShell = (await import('./RoleShell')).default;

const NAV = [
  { to: '/admin', end: true, label: 'Dashboard' },
  { to: '/admin/users', label: 'User Management' },
  { to: '/admin/content', label: 'Curriculum' },
];

const show = (path = '/admin') => render(
  <MemoryRouter initialEntries={[path]}>
    <RoleShell navItems={NAV} title="NC Spark Admin">
      <Routes>
        <Route path="/admin" element={<h1>Overview</h1>} />
        <Route path="/admin/users" element={<h1>People</h1>} />
        <Route path="/admin/content/:id" element={<h1>Builder</h1>} />
      </Routes>
    </RoleShell>
  </MemoryRouter>,
);

beforeEach(() => { document.title = ''; });

describe('landmarks', () => {
  /**
   * The content area was a plain div in all four shells, so the app had no
   * <main> at all and a screen reader's "jump to main content" did nothing.
   */
  it('wraps the page in a main landmark', () => {
    show();
    expect(screen.getByRole('main')).toContainElement(screen.getByText('Overview'));
  });

  /**
   * Without this, reaching the content by keyboard means tabbing past the
   * whole sidebar again on every navigation.
   */
  it('offers a skip link that targets that landmark', () => {
    show();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('puts the skip link before the sidebar in the tab order', () => {
    show();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    const nav = screen.getByRole('navigation', { name: 'Sidebar' });
    expect(skip.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the document title', () => {
  /**
   * Every one of the thirty screens said "NC Spark". Browser tabs, history
   * entries and window switchers were all indistinguishable from each other.
   */
  it('names the page and the portal', () => {
    show();
    expect(document.title).toBe('Dashboard · NC Spark Admin');
  });

  it('follows a navigation', async () => {
    show();
    await userEvent.click(screen.getByRole('link', { name: 'User Management' }));
    await waitFor(() => expect(document.title).toBe('User Management · NC Spark Admin'));
  });

  /**
   * Longest match wins. /admin/content/:id has to resolve to Curriculum, not
   * to the Dashboard, whose path is a prefix of every route in the portal.
   */
  it('resolves a nested route to its section, not to the dashboard', () => {
    show('/admin/content/c1');
    expect(document.title).toBe('Curriculum · NC Spark Admin');
  });

  it('falls back to the portal name for a path no nav entry covers', () => {
    show('/admin/nowhere');
    expect(document.title).toBe('NC Spark Admin');
  });
});

describe('focus on navigation', () => {
  /**
   * A single-page navigation changes the DOM without telling anyone. A screen
   * reader keeps reading the old page, and the next Tab resumes from wherever
   * the sidebar left off rather than at the new content.
   */
  it('moves focus to the content after a route change', async () => {
    show();
    await userEvent.click(screen.getByRole('link', { name: 'User Management' }));
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  // Grabbing focus the instant a page loads is its own accessibility problem.
  it('does not steal focus on first paint', () => {
    show();
    expect(screen.getByRole('main')).not.toHaveFocus();
  });
});
