import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useMyEnrollments: vi.fn(), useCourses: vi.fn(),
  useMyQuizResults: vi.fn(), useCompletedActivityCount: vi.fn(),
  useMyXp: vi.fn(), useMyXpEvents: vi.fn(),
}));
vi.mock('../../hooks/useCourses', () => ({
  useMyEnrollments: mocks.useMyEnrollments, useCourses: mocks.useCourses,
}));
vi.mock('../../hooks/useProgress', () => ({
  useMyQuizResults: mocks.useMyQuizResults,
  useCompletedActivityCount: mocks.useCompletedActivityCount,
}));
vi.mock('../../hooks/useXp', () => ({
  useMyXp: mocks.useMyXp, useMyXpEvents: mocks.useMyXpEvents,
}));

const AchievementsPage = (await import('./AchievementsPage')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });

/** The value shown on the stat tile with this label. */
const tileValue = (label) =>
  within(screen.getByText(label).closest('.stat-card')).getByText(
    (_, el) => el?.className === 'stat-card-value').textContent;
const show = () => render(<MemoryRouter><AchievementsPage /></MemoryRouter>);

const COURSES = [
  { id: 'c1', title: 'Fire Safety', icon: 'F' },
  { id: 'c2', title: 'Manual Handling', icon: 'M' },
];
const result = (over) => ({
  id: 'a1', quizId: 'q1', quizTitle: 'Module 1 check', courseTitle: 'Fire Safety',
  attemptNo: 1, status: 'passed', submittedAt: '2026-02-01T00:00:00Z',
  score: 85, passed: true, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useCourses.mockReturnValue(query(COURSES));
  mocks.useMyEnrollments.mockReturnValue(query([]));
  mocks.useMyQuizResults.mockReturnValue(query([]));
  mocks.useCompletedActivityCount.mockReturnValue(query(0));
  mocks.useMyXp.mockReturnValue(query({ xp: 0, streak: 0, lastActiveOn: null }));
  mocks.useMyXpEvents.mockReturnValue(query([]));
});

describe('the headline numbers', () => {
  it('counts completed courses and passed quizzes', () => {
    mocks.useMyEnrollments.mockReturnValue(query([
      { id: 'e1', courseId: 'c1', status: 'completed', completedAt: '2026-02-02T00:00:00Z' },
      { id: 'e2', courseId: 'c2', status: 'active' },
    ]));
    mocks.useMyQuizResults.mockReturnValue(query([
      result({ id: 'a1', passed: true }),
      result({ id: 'a2', passed: false, status: 'failed', score: 40 }),
    ]));
    mocks.useCompletedActivityCount.mockReturnValue(query(17));
    show();

    expect(screen.getByText('Courses completed').closest('.stat-card')).toHaveTextContent('1');
    expect(screen.getByText('Quizzes passed').closest('.stat-card')).toHaveTextContent('1');
    expect(screen.getByText('Activities completed').closest('.stat-card')).toHaveTextContent('17');
  });

  /**
   * final_score is null until a trainer marks a paragraph. Counting that as a
   * zero would drag the average down and tell a trainee they are failing work
   * nobody has looked at yet.
   */
  it('averages only the attempts that carry a score', () => {
    mocks.useMyQuizResults.mockReturnValue(query([
      result({ id: 'a1', score: 80 }),
      result({ id: 'a2', score: 60 }),
      result({ id: 'a3', score: null, status: 'pending_review', passed: null }),
    ]));
    show();
    expect(screen.getByText('Average score').closest('.stat-card')).toHaveTextContent('70%');
  });

  it('shows a dash, not a zero, when nothing has been scored', () => {
    show();
    expect(screen.getByText('Average score').closest('.stat-card')).toHaveTextContent('—');
  });

  it('shows a dash while the completion count is still arriving', () => {
    mocks.useCompletedActivityCount.mockReturnValue(query(undefined, { isLoading: true }));
    show();
    expect(screen.getByText('Activities completed').closest('.stat-card')).toHaveTextContent('—');
  });
});

describe('the quiz history', () => {
  it('renders a pass with its score', () => {
    mocks.useMyQuizResults.mockReturnValue(query([result()]));
    show();
    const row = screen.getByText('Module 1 check').closest('.student-row');
    expect(within(row).getByText('85%')).toBeInTheDocument();
    expect(within(row).getByText('Passed')).toBeInTheDocument();
  });

  it('shows an unmarked attempt as awaiting marking, with no score', () => {
    mocks.useMyQuizResults.mockReturnValue(query([
      result({ status: 'pending_review', score: null, passed: null }),
    ]));
    show();
    const row = screen.getByText('Module 1 check').closest('.student-row');
    expect(within(row).getByText('Awaiting marking')).toBeInTheDocument();
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(row).queryByText('0%')).not.toBeInTheDocument();
  });

  it('notes a second attempt', () => {
    mocks.useMyQuizResults.mockReturnValue(query([result({ attemptNo: 2 })]));
    show();
    expect(screen.getByText(/attempt 2/)).toBeInTheDocument();
  });
});

describe('what replaced the prototype', () => {
  /**
   * This page used to open with "#3 of 12 trainees", an XP total and a streak,
   * every figure of it from dummyData. For a real trainee that is a fabricated
   * ranking against fabricated peers.
   */
  /**
   * This used to assert the opposite — that no XP figure appeared anywhere —
   * because nothing awarded any and a number would have been invented. The
   * triggers now pay for real work, so the figure is the honest thing to show.
   */
  it('leads with the XP that has actually been earned', () => {
    mocks.useMyXp.mockReturnValue(query({ xp: 240, streak: 3, lastActiveOn: '2026-08-29' }));
    show();
    expect(tileValue('Total XP')).toBe('240');
    expect(tileValue('Day streak')).toBe('3');
  });

  it('works out the level and what is left of it', () => {
    mocks.useMyXp.mockReturnValue(query({ xp: 240, streak: 1, lastActiveOn: null }));
    show();
    // 240 XP at 100 to a level is level 3, 60 short of level 4.
    expect(tileValue('Level')).toBe('3');
    expect(screen.getByText(/60 XP to level 4/)).toBeInTheDocument();
  });

  /** A rank against peers was the prototype's invention and is still absent. */
  it('still claims no rank against other trainees', () => {
    mocks.useMyXp.mockReturnValue(query({ xp: 240, streak: 3, lastActiveOn: null }));
    show();
    expect(screen.queryByText(/of \d+ trainees/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^#\d+$/)).not.toBeInTheDocument();
  });

  // A blank where the badges were invites the question. Answer it in the page.
  it('says which parts are still not built', () => {
    show();
    expect(screen.getByText(/not switched on yet/)).toBeInTheDocument();
    // ...and no longer claims XP is one of them.
    expect(screen.getByText(/XP counts from/)).toBeInTheDocument();
  });
});

describe('failures', () => {
  it('shows an error rather than an empty record', () => {
    mocks.useMyQuizResults.mockReturnValue(query(undefined, { error: new Error('nope') }));
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load your record/);
  });
});
