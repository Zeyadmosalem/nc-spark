import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// The shell's own job is small: pick the navigation and put a count on the two
// items that can be holding somebody up. That arithmetic is the part worth
// testing — a trainer who cannot see there is work waiting only finds it by
// visiting the page, and a trainee waits until they happen to.

const mocks = vi.hoisted(() => ({
  usePendingReviews: vi.fn(),
  useBlockedAttempts: vi.fn(),
  useSupportUnread: vi.fn(),
  shell: vi.fn(),
}));

vi.mock('../../hooks/useReview', () => ({
  usePendingReviews: mocks.usePendingReviews,
  useBlockedAttempts: mocks.useBlockedAttempts,
}));
vi.mock('../../hooks/useSupport', () => ({ useSupportUnread: mocks.useSupportUnread }));

// The shell under test is the nav and the routing, not what the screens render.
vi.mock('../../components/shared/RoleShell', () => ({
  default: ({ navItems, title, children }) => {
    mocks.shell({ navItems, title });
    return <div>{children}</div>;
  },
}));

const stub = (name) => ({ default: () => <div data-testid={name}>{name}</div> });
vi.mock('./TrainerDashboard', () => stub('dashboard'));
vi.mock('./TrainerReview', () => stub('review'));
vi.mock('./TrainerCourses', () => stub('courses'));
vi.mock('../shared/AccountPage', () => stub('account'));
vi.mock('../../components/authoring/CourseBuilder', () => stub('builder'));
vi.mock('../../components/roster/CourseRoster', () => stub('roster'));
vi.mock('../../components/shared/CourseChatPage', () => stub('chat'));
vi.mock('../../components/support/SupportInbox', () => stub('support'));

const TrainerShell = (await import('./TrainerShell')).default;

// Mounted under /trainer/* exactly as App.jsx mounts it. The redirects inside
// go to absolute paths, so a shell mounted at the root would never resolve
// them — the test would be failing on its own harness.
const at = (path) => render(
  <MemoryRouter initialEntries={['/trainer' + path]}>
    <Routes>
      <Route path="/trainer/*" element={<TrainerShell />} />
    </Routes>
  </MemoryRouter>,
);

const badgeFor = (to) => mocks.shell.mock.calls.at(-1)[0]
  .navItems.find((i) => i.to === to)?.badge;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.usePendingReviews.mockReturnValue({ data: [] });
  mocks.useBlockedAttempts.mockReturnValue({ data: [] });
  mocks.useSupportUnread.mockReturnValue(0);
});

describe('the work-waiting count', () => {
  /**
   * Both queues block a trainee, so they are one number on one item. Showing
   * only one of them would say "nothing waiting" while somebody is stuck.
   */
  it('adds pending reviews and blocked attempts together', () => {
    mocks.usePendingReviews.mockReturnValue({ data: [{ id: 1 }, { id: 2 }] });
    mocks.useBlockedAttempts.mockReturnValue({ data: [{ id: 3 }] });
    at('/');
    expect(badgeFor('/trainer/review')).toBe(3);
  });

  it('counts blocked attempts even when nothing is pending review', () => {
    mocks.useBlockedAttempts.mockReturnValue({ data: [{ id: 1 }] });
    at('/');
    expect(badgeFor('/trainer/review')).toBe(1);
  });

  it('is zero when both queues are empty', () => {
    at('/');
    expect(badgeFor('/trainer/review')).toBe(0);
  });

  /** Queries that have not resolved must read as zero, not as NaN. */
  it('survives either query having no data yet', () => {
    mocks.usePendingReviews.mockReturnValue({ data: undefined });
    mocks.useBlockedAttempts.mockReturnValue({ data: undefined });
    at('/');
    expect(badgeFor('/trainer/review')).toBe(0);
  });
});

describe('the support count', () => {
  /** Unread, not "awaiting staff": a reply already read is not a notification. */
  it('badges support with what the reader has not seen', () => {
    mocks.useSupportUnread.mockReturnValue(2);
    at('/');
    expect(badgeFor('/trainer/support')).toBe(2);
  });

  it('leaves the other items unbadged', () => {
    mocks.useSupportUnread.mockReturnValue(2);
    mocks.usePendingReviews.mockReturnValue({ data: [{ id: 1 }] });
    at('/');
    expect(badgeFor('/trainer/courses')).toBeUndefined();
    expect(badgeFor('/trainer/account')).toBeUndefined();
  });
});

describe('the routes', () => {
  it.each([
    ['/', 'dashboard'],
    ['/courses', 'courses'],
    ['/courses/abc', 'builder'],
    ['/courses/abc/people', 'roster'],
    ['/courses/abc/chat', 'chat'],
    ['/review', 'review'],
    ['/support', 'support'],
    ['/account', 'account'],
  ])('serves %s', (path, testId) => {
    at(path);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  /**
   * The prototype's Create Content forms wrote to an in-memory context.
   * Authoring happens inside a course now, because an activity needs a module
   * to live in — so the old path redirects rather than 404s.
   */
  it('redirects the retired create route to the course list', () => {
    at('/create/quiz');
    expect(screen.getByTestId('courses')).toBeInTheDocument();
  });

  it('sends an unknown path back to the dashboard', () => {
    at('/nowhere');
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });
});
