import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useMyEnrollments: vi.fn(), useCourses: vi.fn(),
  useMyQuizResults: vi.fn(), useCompletedActivityCount: vi.fn(),
}));
vi.mock('../../hooks/useCourses', () => ({
  useMyEnrollments: mocks.useMyEnrollments, useCourses: mocks.useCourses,
}));
vi.mock('../../hooks/useProgress', () => ({
  useMyQuizResults: mocks.useMyQuizResults,
  useCompletedActivityCount: mocks.useCompletedActivityCount,
}));

const AchievementsPage = (await import('./AchievementsPage')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });
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
  it('states no rank, XP or streak', () => {
    mocks.useMyEnrollments.mockReturnValue(query([
      { id: 'e1', courseId: 'c1', status: 'completed' },
    ]));
    show();
    // The page may SAY the word XP — it explains why there is none. What it
    // must never do is state a figure, a rank or a streak as if it were real.
    expect(screen.queryByText(/of \d+ trainees/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*XP/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+-day streak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^#\d+$/)).not.toBeInTheDocument();
  });

  // A blank where the badges were invites the question. Answer it in the page.
  it('says why the badges are missing and that the work still counts', () => {
    show();
    expect(screen.getByText(/not switched on yet/)).toBeInTheDocument();
    expect(screen.getByText(/nothing you have already done will be lost/))
      .toBeInTheDocument();
  });
});

describe('failures', () => {
  it('shows an error rather than an empty record', () => {
    mocks.useMyQuizResults.mockReturnValue(query(undefined, { error: new Error('nope') }));
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load your record/);
  });
});
