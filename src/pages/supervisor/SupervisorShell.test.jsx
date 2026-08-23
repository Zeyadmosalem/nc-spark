import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useMyTrainers: vi.fn(), useTeamCourses: vi.fn(),
  useTeamEnrollments: vi.fn(), useTeamQuizAttempts: vi.fn(),
}));
vi.mock('../../hooks/useSupervisor', () => mocks);

const { Dashboard } = await import('./SupervisorShell');
const SupervisorCourses = (await import('./SupervisorCourses')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });
const showDashboard = () => render(<MemoryRouter><Dashboard /></MemoryRouter>);
const showCourses = () => render(<MemoryRouter><SupervisorCourses /></MemoryRouter>);

const TRAINERS = [
  { id: 't1', name: 'Ada Lovelace', avatar: 'A', email: 'ada@x.io', status: 'active' },
];
const COURSES = [
  { id: 'c1', title: 'Fire Safety', status: 'published', icon: 'F', color: '#f00', trainerId: 't1' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useMyTrainers.mockReturnValue(query(TRAINERS));
  mocks.useTeamCourses.mockReturnValue(query(COURSES));
  mocks.useTeamEnrollments.mockReturnValue(query([]));
  mocks.useTeamQuizAttempts.mockReturnValue(query([]));
});

describe('the dashboard', () => {
  it('lists the supervised trainers with a course count', () => {
    showDashboard();
    const row = screen.getByText('Ada Lovelace').closest('.student-row');
    expect(within(row).getByText('1 course')).toBeInTheDocument();
  });

  it('averages progress over started enrolments', () => {
    mocks.useTeamEnrollments.mockReturnValue(query([
      { id: 'e1', courseId: 'c1', status: 'active', percent: 40 },
      { id: 'e2', courseId: 'c1', status: 'completed', percent: 100 },
      // Pending is not a cohort member yet and must not drag the average down.
      { id: 'e3', courseId: 'c1', status: 'pending', percent: 0 },
    ]));
    showDashboard();
    expect(screen.getByText('Learners enrolled').closest('.stat-card'))
      .toHaveTextContent('70% average progress');
  });

  /**
   * An attempt awaiting marking has passed === null. Counting it as a fail
   * would understate every trainer's pass rate.
   */
  it('computes the pass rate over graded attempts only', () => {
    mocks.useTeamQuizAttempts.mockReturnValue(query([
      { id: 'a1', courseId: 'c1', passed: true, status: 'passed' },
      { id: 'a2', courseId: 'c1', passed: false, status: 'failed' },
      { id: 'a3', courseId: 'c1', passed: null, status: 'pending_review' },
    ]));
    showDashboard();
    const card = screen.getByText('Quiz pass rate').closest('.stat-card');
    expect(card).toHaveTextContent('50%');
    expect(card).toHaveTextContent('2 graded attempts');
  });

  it('flags attempts stuck awaiting marking, because they block trainees', () => {
    mocks.useTeamQuizAttempts.mockReturnValue(query([
      { id: 'a3', courseId: 'c1', passed: null, status: 'pending_review' },
    ]));
    showDashboard();
    expect(screen.getByText(/waiting on a trainer to mark/)).toBeInTheDocument();
  });

  it('stays quiet when nothing is waiting', () => {
    showDashboard();
    expect(screen.queryByText(/waiting on a trainer to mark/)).not.toBeInTheDocument();
  });

  it('shows a dash rather than 0% before anything is graded', () => {
    showDashboard();
    expect(screen.getByText('Quiz pass rate').closest('.stat-card')).toHaveTextContent('—');
  });

  /**
   * A supervisor with no trainers is a real state — the link is made by an
   * admin. Rendering a dashboard of zeros would read as "your team is idle".
   */
  it('explains an empty roster instead of showing zeros', () => {
    mocks.useMyTrainers.mockReturnValue(query([]));
    showDashboard();
    expect(screen.getByText(/No trainers are assigned to you yet/)).toBeInTheDocument();
    expect(screen.queryByText('Quiz pass rate')).not.toBeInTheDocument();
  });

  it('says out loud that the figures are cohort totals', () => {
    showDashboard();
    expect(screen.getByText(/individual\s+trainee names and results are not shown/i))
      .toBeInTheDocument();
  });

  it('shows an error rather than an empty team', () => {
    mocks.useMyTrainers.mockReturnValue(query(undefined, { error: new Error('nope') }));
    showDashboard();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load your team/);
  });
});

describe('team courses', () => {
  it('names the trainer running each course', () => {
    showCourses();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('reports the cohort per course', () => {
    mocks.useTeamEnrollments.mockReturnValue(query([
      { id: 'e1', courseId: 'c1', status: 'active', percent: 50 },
      { id: 'e2', courseId: 'c1', status: 'completed', percent: 100 },
      { id: 'e3', courseId: 'other', status: 'active', percent: 10 },
    ]));
    showCourses();
    const card = screen.getByText('Fire Safety').closest('.card');
    expect(within(card).getByText('enrolled').previousSibling).toHaveTextContent('2');
    expect(within(card).getByText('completed').previousSibling).toHaveTextContent('1');
    expect(within(card).getByText('avg progress').previousSibling).toHaveTextContent('75%');
  });

  /**
   * This is backlog B5 made visible. Before migration 20260825000100 a
   * supervisor could read the attempt but not the quiz, so attempts arrived
   * with no course id and every course showed a dash.
   */
  it('attributes attempts to their course', () => {
    mocks.useTeamQuizAttempts.mockReturnValue(query([
      { id: 'a1', courseId: 'c1', quizTitle: 'Check', passed: true, status: 'passed' },
      { id: 'a2', courseId: 'c1', quizTitle: 'Check', passed: false, status: 'failed' },
    ]));
    showCourses();
    const card = screen.getByText('Fire Safety').closest('.card');
    expect(within(card).getByText('pass rate').previousSibling).toHaveTextContent('50%');
  });

  it('ignores an attempt whose course could not be read', () => {
    mocks.useTeamQuizAttempts.mockReturnValue(query([
      { id: 'a1', courseId: null, quizTitle: 'Unknown quiz', passed: true, status: 'passed' },
    ]));
    showCourses();
    const card = screen.getByText('Fire Safety').closest('.card');
    expect(within(card).getByText('pass rate').previousSibling).toHaveTextContent('—');
  });

  it('distinguishes no trainers from no courses', () => {
    mocks.useMyTrainers.mockReturnValue(query([]));
    mocks.useTeamCourses.mockReturnValue(query([]));
    showCourses();
    expect(screen.getByText(/No trainers are assigned to you yet/)).toBeInTheDocument();

    mocks.useMyTrainers.mockReturnValue(query(TRAINERS));
    showCourses();
    expect(screen.getByText(/Your trainers have no courses yet/)).toBeInTheDocument();
  });
});
