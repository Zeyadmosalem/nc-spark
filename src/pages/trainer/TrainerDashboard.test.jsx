import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(), useCourses: vi.fn(), useCourseEnrollments: vi.fn(),
  usePendingReviews: vi.fn(), useBlockedAttempts: vi.fn(),
  usePendingEnrollments: vi.fn(), decide: vi.fn(),
}));

vi.mock('../../hooks/useSession', () => ({ useSession: mocks.useSession }));
vi.mock('../../hooks/useCourses', () => ({
  useCourses: mocks.useCourses,
  useCourseEnrollments: mocks.useCourseEnrollments,
}));
vi.mock('../../hooks/useReview', () => ({
  usePendingReviews: mocks.usePendingReviews,
  useBlockedAttempts: mocks.useBlockedAttempts,
}));
vi.mock('../../hooks/useApprovals', () => ({
  usePendingEnrollments: mocks.usePendingEnrollments,
  useDecideEnrollment: () => ({ mutate: mocks.decide, isPending: false, error: null }),
}));

const TrainerDashboard = (await import('./TrainerDashboard')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });
const show = () => render(<MemoryRouter><TrainerDashboard /></MemoryRouter>);
const varsOf = (spy) => spy.mock.calls.at(-1)?.[0];

const MY_COURSE = {
  id: 'c1', title: 'Fire Safety', status: 'published', icon: 'F', trainerId: 'me',
};
const OTHER_COURSE = {
  id: 'c9', title: 'Someone Else', status: 'published', icon: 'S', trainerId: 'other',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useSession.mockReturnValue({ profile: { id: 'me', name: 'Grace Hopper' } });
  mocks.useCourses.mockReturnValue(query([MY_COURSE]));
  mocks.useCourseEnrollments.mockReturnValue(query([]));
  mocks.usePendingReviews.mockReturnValue(query([]));
  mocks.useBlockedAttempts.mockReturnValue(query([]));
  mocks.usePendingEnrollments.mockReturnValue(query([]));
});

describe('scoping', () => {
  /**
   * An admin can read every course and every enrolment. Without this filter
   * they would see the whole platform under the heading "your courses".
   */
  it('counts only courses this trainer owns', () => {
    mocks.useCourses.mockReturnValue(query([MY_COURSE, OTHER_COURSE]));
    show();
    expect(screen.getByText('Fire Safety')).toBeInTheDocument();
    expect(screen.queryByText('Someone Else')).not.toBeInTheDocument();
    expect(screen.getByText('Courses').closest('.stat-card')).toHaveTextContent('1');
  });

  it('ignores enrolments on courses that are not theirs', () => {
    mocks.useCourseEnrollments.mockReturnValue(query([
      { id: 'e1', courseId: 'c1', status: 'active', percent: 50 },
      { id: 'e2', courseId: 'c9', status: 'active', percent: 10 },
    ]));
    show();
    expect(screen.getByText('Learners').closest('.stat-card')).toHaveTextContent('1');
    expect(screen.getByText('Average progress').closest('.stat-card')).toHaveTextContent('50%');
  });

  it('greets by first name', () => {
    show();
    expect(screen.getByText('Hello, Grace')).toBeInTheDocument();
  });
});

describe('waiting on you', () => {
  /**
   * All three queues stop a trainee dead: an unmarked paragraph holds up a
   * quiz, a failed attempt with no retake ends a course, and an unapproved
   * application means somebody cannot start at all. They are counted together
   * and put above the statistics, which are not actionable.
   */
  it('totals all three blocking queues', () => {
    mocks.usePendingReviews.mockReturnValue(query([{ attemptId: 'a1' }, { attemptId: 'a2' }]));
    mocks.useBlockedAttempts.mockReturnValue(query([{ attemptId: 'a3' }]));
    mocks.usePendingEnrollments.mockReturnValue(query([
      { id: 'e1', courseId: 'c1', traineeName: 'Ada', traineeAvatar: 'A', courseTitle: 'Fire Safety' },
    ]));
    show();
    expect(screen.getByText('4 in total')).toBeInTheDocument();
  });

  it('says so plainly when nothing is blocked', () => {
    show();
    expect(screen.getByText('All clear')).toBeInTheDocument();
    expect(screen.getByText(/Nothing is blocked on you/)).toBeInTheDocument();
  });

  it('names both assessment queues distinctly', () => {
    mocks.usePendingReviews.mockReturnValue(query([{ attemptId: 'a1' }]));
    mocks.useBlockedAttempts.mockReturnValue(query([{ attemptId: 'a2' }]));
    show();
    expect(screen.getByText(/written answer to mark/)).toBeInTheDocument();
    expect(screen.getByText(/blocked\s+without a retake/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the review queue/ }))
      .toHaveAttribute('href', '/trainer/review');
  });
});

describe('course applications', () => {
  const application = {
    id: 'e1', courseId: 'c1', traineeName: 'Ada Lovelace',
    traineeAvatar: 'A', courseTitle: 'Fire Safety',
  };

  /**
   * This queue used to live on the Course Catalog page, which was otherwise a
   * prototype browsing screen duplicating /trainer/courses. An unapproved
   * application means somebody cannot start, so it belongs where a trainer
   * looks first.
   */
  it('approves an application', async () => {
    mocks.usePendingEnrollments.mockReturnValue(query([application]));
    show();
    expect(screen.getByText(/wants to join Fire Safety/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(varsOf(mocks.decide)).toEqual({ enrollmentId: 'e1', decision: 'approve' });
  });

  it('denies an application', async () => {
    mocks.usePendingEnrollments.mockReturnValue(query([application]));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(varsOf(mocks.decide)).toEqual({ enrollmentId: 'e1', decision: 'deny' });
  });

  // An admin sees every pending application; only this trainer's belong here.
  it('shows only applications to this trainer courses', () => {
    mocks.usePendingEnrollments.mockReturnValue(query([
      application,
      { ...application, id: 'e2', courseId: 'c9', traineeName: 'Not Mine' },
    ]));
    show();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('Not Mine')).not.toBeInTheDocument();
  });
});

describe('the course list', () => {
  it('summarises each course and links into the builder', () => {
    mocks.useCourseEnrollments.mockReturnValue(query([
      { id: 'e1', courseId: 'c1', status: 'active', percent: 40 },
      { id: 'e2', courseId: 'c1', status: 'completed', percent: 100 },
    ]));
    show();
    const row = screen.getByText('Fire Safety').closest('a');
    expect(row).toHaveAttribute('href', '/trainer/courses/c1');
    expect(within(row).getByText(/2 learners · 70% average progress/)).toBeInTheDocument();
  });

  it('points a trainer with no courses somewhere useful', () => {
    mocks.useCourses.mockReturnValue(query([]));
    show();
    expect(screen.getByRole('link', { name: 'Find a course to teach' }))
      .toHaveAttribute('href', '/trainer/courses');
  });
});

describe('what is deliberately absent', () => {
  /**
   * The prototype dashboard led with average trainee XP, a leaderboard and
   * submission counts from a localStorage blob. Nothing awards XP (backlog
   * B7), so every one of those figures was invented.
   */
  it('makes no claim about XP or trainee rankings', () => {
    mocks.useCourseEnrollments.mockReturnValue(query([
      { id: 'e1', courseId: 'c1', status: 'active', percent: 40 },
    ]));
    show();
    expect(screen.queryByText(/XP/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/leaderboard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/top perform/i)).not.toBeInTheDocument();
  });

  it('shows an error rather than a dashboard of zeros', () => {
    mocks.useCourses.mockReturnValue(query(undefined, { error: new Error('nope') }));
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load your dashboard/);
  });
});
