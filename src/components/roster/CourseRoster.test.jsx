import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ roster: vi.fn(), course: vi.fn(), standings: vi.fn() }));

vi.mock('../../hooks/useRoster', () => ({ useCourseRoster: mocks.roster }));
vi.mock('../../hooks/useAuthoring', () => ({ useCourseForEditing: mocks.course }));
// The class charts read XP standings; the rows themselves are covered by
// xp.test.js against the live project.
vi.mock('../../hooks/useXp', () => ({ useCourseStandings: mocks.standings }));

const CourseRoster = (await import('./CourseRoster')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });

const COURSE = {
  id: 'c1', title: 'Fire Safety',
  modules: [{
    id: 'm1', title: 'Module one',
    activities: [
      { id: 'a1', type: 'reading', title: 'Read this', position: 1 },
      { id: 'a2', type: 'quiz', title: 'Module quiz', position: 2 },
    ],
  }],
};

const person = (over = {}) => ({
  id: 'e1', traineeId: 't1', name: 'Alice Ahmed', avatar: 'AA',
  status: 'active', enrolledAt: '2026-01-01T00:00:00Z', completedAt: null,
  percent: 50, completedActivities: new Map([['a1', '2026-02-01T00:00:00Z']]),
  attempts: [], ...over,
});

const show = () => render(
  <MemoryRouter initialEntries={['/trainer/courses/c1/people']}>
    <Routes>
      <Route path="/trainer/courses/:courseId/people" element={<CourseRoster />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.standings.mockReturnValue(query([]));
  mocks.course.mockReturnValue(query(COURSE));
  mocks.roster.mockReturnValue(query([person()]));
});

describe('the summary', () => {
  it('counts who has not started, not just the average', () => {
    mocks.roster.mockReturnValue(query([
      person({ id: 'e1', percent: 0, completedActivities: new Map() }),
      person({ id: 'e2', traineeId: 't2', name: 'Bob Brown', percent: 100 }),
    ]));
    show();
    const card = screen.getByText('Not started').closest('.stat-card');
    expect(within(card).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('no activity completed')).toBeInTheDocument();
  });

  it('says so when everyone has begun', () => {
    show();
    expect(screen.getByText('everyone has begun')).toBeInTheDocument();
  });

  /** An unmarked paragraph blocks the trainee until a human reads it. */
  it('counts what is waiting on the trainer', () => {
    mocks.roster.mockReturnValue(query([
      person({ attempts: [{ id: 'x', quizTitle: 'Q', status: 'pending_review', score: 40, passed: null, attemptNo: 1, submittedAt: '2026-02-02T00:00:00Z' }] }),
    ]));
    show();
    expect(screen.getByText('blocking those trainees')).toBeInTheDocument();
    expect(screen.getByText('1 to mark')).toBeInTheDocument();
  });

  /** An application nobody decided means somebody cannot start at all. */
  it('flags applications still waiting on a decision', () => {
    mocks.roster.mockReturnValue(query([person({ status: 'pending' })]));
    show();
    expect(screen.getByText(/still waiting for a decision/)).toBeInTheDocument();
  });

  it('explains an empty roster rather than showing zeroes', () => {
    mocks.roster.mockReturnValue(query([]));
    show();
    expect(screen.getByText('Nobody is enrolled yet')).toBeInTheDocument();
    expect(screen.queryByText('Not started')).not.toBeInTheDocument();
  });
});

describe('ordering', () => {
  const three = () => query([
    person({ id: 'e1', name: 'Carol Chen', percent: 90 }),
    person({ id: 'e2', traineeId: 't2', name: 'Alice Ahmed', percent: 10 }),
    person({ id: 'e3', traineeId: 't3', name: 'Bob Brown', percent: 50 }),
  ]);

  /**
   * Rendered document order, not the array the mock returned. Reading the
   * order off the DOM is the only way this test can tell that the component
   * sorts rather than that the fixture happened to arrive sorted.
   */
  // Scoped to the list. Every name is now also a bar label in the class
  // charts above it, so an unscoped getByText finds two of each and the
  // ordering being asserted here is the LIST's, not the chart's.
  const names = () => ['Alice Ahmed', 'Bob Brown', 'Carol Chen']
    .map((n) => within(screen.getByRole('region', { name: 'Roster' })).getByText(n))
    .sort((a, b) => (
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map((el) => el.textContent);

  /**
   * The default is the actionable order. Whoever is furthest behind is the
   * work, so they belong at the top rather than wherever the alphabet puts
   * them.
   */
  it('puts whoever is furthest behind first', () => {
    mocks.roster.mockReturnValue(three());
    show();
    expect(names()).toEqual(['Alice Ahmed', 'Bob Brown', 'Carol Chen']);
  });

  it('can sort by name for looking one person up', async () => {
    mocks.roster.mockReturnValue(three());
    show();
    await userEvent.selectOptions(screen.getByLabelText('Order'), 'name');
    expect(names()).toEqual(['Alice Ahmed', 'Bob Brown', 'Carol Chen']);
  });

  it('can sort by most progress', async () => {
    mocks.roster.mockReturnValue(three());
    show();
    await userEvent.selectOptions(screen.getByLabelText('Order'), 'ahead');
    expect(names()).toEqual(['Carol Chen', 'Bob Brown', 'Alice Ahmed']);
  });
});

describe('one person', () => {
  it('shows their progress against the whole course', () => {
    show();
    expect(screen.getByText('1 of 2 activities')).toBeInTheDocument();
    // The bar chart shows the same figure, so this is the row's copy of it.
    expect(within(screen.getByRole('region', { name: 'Roster' })).getByText('50%'))
      .toBeInTheDocument();
  });

  it('lists which activities are done and which are not', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Detail' }));

    const read = screen.getByText(/Read this/).closest('div');
    expect(within(read).getByText('completed')).toBeInTheDocument();

    const quiz = screen.getByText(/Module quiz/).closest('div');
    expect(within(quiz).getByText('not completed')).toBeInTheDocument();
    expect(within(quiz).getByText('not done')).toBeInTheDocument();
  });

  /**
   * A tick and a colour are not a status to somebody using a screen reader,
   * so each row says which it is in words as well.
   */
  it('states done-ness in text, not only as a glyph', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Detail' }));
    expect(screen.getAllByText(/^(completed|not completed)$/)).toHaveLength(2);
  });

  it('shows quiz attempts with a dash rather than a zero when unmarked', async () => {
    mocks.roster.mockReturnValue(query([person({
      attempts: [{
        id: 'x', quizTitle: 'Module quiz', status: 'pending_review',
        score: null, passed: null, attemptNo: 2, submittedAt: '2026-02-02T00:00:00Z',
      }],
    })]));
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Detail' }));
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/attempt 2/)).toBeInTheDocument();
  });

  it('starts collapsed and announces that it expands', () => {
    show();
    const toggle = screen.getByRole('button', { name: 'Detail' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Activities')).not.toBeInTheDocument();
  });
});

describe('when it cannot load', () => {
  it('says so rather than showing an empty course', () => {
    mocks.roster.mockReturnValue(query(undefined, { error: new Error('nope') }));
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load this course roster/);
  });
});
