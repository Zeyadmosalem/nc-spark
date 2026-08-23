import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(), useCourses: vi.fn(), useMyEnrollments: vi.fn(),
}));
vi.mock('../../hooks/useSession', () => ({ useSession: mocks.useSession }));
vi.mock('../../hooks/useCourses', () => ({
  useCourses: mocks.useCourses, useMyEnrollments: mocks.useMyEnrollments,
}));
vi.mock('../../components/shared/TraineeNotices', () => ({ default: () => null }));

const TraineeDashboard = (await import('./TraineeDashboard')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });
const show = () => render(<MemoryRouter><TraineeDashboard /></MemoryRouter>);

const COURSES = [
  { id: 'c1', title: 'Fire Safety', subtitle: 'Basics', icon: 'F', color: '#dc3545' },
  { id: 'c2', title: 'Manual Handling', subtitle: 'Lifting', icon: 'M', color: '#00a3e0' },
];
const enrol = (over) => ({
  id: 'e1', courseId: 'c1', status: 'active', percent: 40, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSession.mockReturnValue({ profile: { id: 'me', name: 'Ada Lovelace' } });
  mocks.useCourses.mockReturnValue(query(COURSES));
  mocks.useMyEnrollments.mockReturnValue(query([]));
});

describe('the headline', () => {
  it('greets by first name', () => {
    show();
    expect(screen.getByText('Welcome back, Ada')).toBeInTheDocument();
  });

  it('survives a profile that has not loaded', () => {
    mocks.useSession.mockReturnValue({ profile: null });
    show();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });

  it('averages progress across started courses only', () => {
    mocks.useMyEnrollments.mockReturnValue(query([
      enrol({ id: 'e1', courseId: 'c1', status: 'active', percent: 40 }),
      enrol({ id: 'e2', courseId: 'c2', status: 'completed', percent: 100 }),
      // A pending application has no progress and must not drag the average
      // down to 46 by counting as a zero.
      enrol({ id: 'e3', courseId: 'c2', status: 'pending', percent: 0 }),
    ]));
    show();
    expect(screen.getByText('70% through 2 courses.')).toBeInTheDocument();
  });

  it('says so plainly before anything is started', () => {
    show();
    expect(screen.getByText('You have not started a course yet.')).toBeInTheDocument();
  });
});

describe('continue where you left off', () => {
  /**
   * The furthest-along unfinished course, not the least. Resuming whatever was
   * abandoned first is the opposite of useful.
   */
  it('points at the most progressed unfinished course', () => {
    mocks.useMyEnrollments.mockReturnValue(query([
      enrol({ id: 'e1', courseId: 'c1', percent: 20 }),
      enrol({ id: 'e2', courseId: 'c2', percent: 80 }),
    ]));
    show();
    const link = screen.getByRole('link', { name: /Continue Manual Handling/ });
    expect(link).toHaveAttribute('href', '/trainee/courses/c2');
  });

  it('offers nothing to continue when every course is finished', () => {
    mocks.useMyEnrollments.mockReturnValue(query([
      enrol({ status: 'completed', percent: 100 }),
    ]));
    show();
    expect(screen.queryByRole('link', { name: /Continue/ })).not.toBeInTheDocument();
  });
});

describe('the course list', () => {
  it('shows real progress, and links to the course', () => {
    mocks.useMyEnrollments.mockReturnValue(query([enrol({ percent: 40 })]));
    show();
    const row = screen.getByText('Fire Safety').closest('a');
    expect(row).toHaveAttribute('href', '/trainee/courses/c1');
    expect(within(row).getByText('40%')).toBeInTheDocument();
  });

  /**
   * A pending application is not a course yet. Making it clickable sends a
   * trainee to a course page they have no access to; omitting it entirely
   * makes them apply again.
   */
  it('lists a pending application without making it clickable', () => {
    mocks.useMyEnrollments.mockReturnValue(query([
      enrol({ id: 'e3', courseId: 'c2', status: 'pending', percent: 0 }),
    ]));
    show();
    expect(screen.getByText('Waiting for a trainer to approve you')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Manual Handling/ })).not.toBeInTheDocument();
  });

  // An enrolment can outlive the course being unpublished, which drops it out
  // of useCourses. Rendering "undefined" is worse than rendering nothing.
  it('skips an enrolment whose course it cannot see', () => {
    mocks.useMyEnrollments.mockReturnValue(query([enrol({ courseId: 'gone' })]));
    show();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    expect(screen.getByText('📚 My courses')).toBeInTheDocument();
  });

  it('sends a trainee with nothing to the catalog', () => {
    show();
    expect(screen.getByRole('link', { name: 'Browse the catalog' }))
      .toHaveAttribute('href', '/trainee/catalog');
  });
});

describe('what is deliberately not shown', () => {
  /**
   * Nothing awards XP (backlog B7) and learning paths have no server-side
   * counterpart. Wired to real data the XP hero, leaderboard, badge grid and
   * path map all render zeros or nothing, which tells a trainee they are
   * behind rather than that this is not measured yet.
   */
  it('makes no claim about XP, badges, streaks or a leaderboard', () => {
    mocks.useMyEnrollments.mockReturnValue(query([enrol()]));
    show();
    expect(screen.queryByText(/XP/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/badge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/leaderboard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/weekly goal/i)).not.toBeInTheDocument();
  });
});

describe('failures', () => {
  it('shows an error rather than a dashboard of zeros', () => {
    mocks.useMyEnrollments.mockReturnValue(query(undefined, { error: new Error('nope') }));
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load your dashboard/);
  });

  // Waiting on only one query renders course cards with no course to name.
  it('waits for both queries before drawing anything', () => {
    mocks.useCourses.mockReturnValue(query(undefined, { isLoading: true }));
    mocks.useMyEnrollments.mockReturnValue(query([enrol()]));
    show();
    expect(screen.getByRole('status')).toHaveTextContent(/Loading your dashboard/);
  });
});
