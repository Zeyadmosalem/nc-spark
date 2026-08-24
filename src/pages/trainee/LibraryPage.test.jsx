import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ library: vi.fn() }));
vi.mock('../../hooks/useLibrary', () => ({ useMyLibrary: mocks.library }));

const LibraryPage = (await import('./LibraryPage')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });

const item = (over = {}) => ({
  id: 'a1', type: 'reading', title: 'Fire triangle', position: 1,
  moduleId: 'm1', moduleTitle: 'Basics', modulePosition: 1,
  courseId: 'c1', courseTitle: 'Fire Safety', courseIcon: '🔥', courseColor: '#dc3545',
  enrollmentId: 'e1', completed: false, unlocked: true, blockedBy: null, ...over,
});

const SPREAD = [
  item(),
  item({ id: 'a2', type: 'video', title: 'Extinguisher demo', position: 2 }),
  item({
    id: 'a3', type: 'quiz', title: 'Final check', moduleTitle: 'Assessment',
    modulePosition: 2, unlocked: false,
    blockedBy: { module: { position: 1, title: 'Basics' }, remaining: 2 },
  }),
  item({
    id: 'a4', type: 'video', title: 'Handwashing', courseId: 'c2',
    courseTitle: 'Food Hygiene', courseIcon: '🍽️', completed: true,
  }),
];

const show = (props) => render(
  <MemoryRouter><LibraryPage {...props} /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.library.mockReturnValue(query(SPREAD));
});

describe('the whole list', () => {
  it('shows every activity across every course', () => {
    show();
    for (const title of ['Fire triangle', 'Extinguisher demo', 'Final check', 'Handwashing']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('groups by course', () => {
    show();
    expect(screen.getByRole('link', { name: 'Fire Safety' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Food Hygiene' })).toBeInTheDocument();
  });

  it('names the module each activity is in', () => {
    show();
    // The title's own div holds only the title; the module line is its sibling.
    const row = screen.getByText('Final check').parentElement;
    expect(within(row).getByText('2. Assessment')).toBeInTheDocument();
  });
});

describe('filtering', () => {
  it('counts each kind before it is chosen', () => {
    show();
    // The count sits in its own element, so it joins the accessible name
    // with a space rather than in brackets.
    expect(screen.getByRole('button', { name: 'Videos 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quizzes 1' })).toBeInTheDocument();
  });

  it('narrows to one kind', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: /Videos/ }));
    expect(screen.getByText('Extinguisher demo')).toBeInTheDocument();
    expect(screen.queryByText('Fire triangle')).not.toBeInTheDocument();
  });

  /**
   * /trainee/quizzes and /trainee/videos were the prototype's two library
   * screens. They land here with their filter already chosen rather than
   * redirecting to a course list that answers neither question.
   */
  it.each([
    ['quiz', 'Final check', 'Fire triangle'],
    ['video', 'Extinguisher demo', 'Final check'],
  ])('opens pre-filtered for the old %s route', (kind, present, absent) => {
    show({ initialKind: kind });
    expect(screen.getByText(present)).toBeInTheDocument();
    expect(screen.queryByText(absent)).not.toBeInTheDocument();
  });

  it('ignores a filter it does not have', () => {
    show({ initialKind: 'nonsense' });
    expect(screen.getByRole('button', { name: /Everything/ }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  it('groups the three practice types together', async () => {
    mocks.library.mockReturnValue(query([
      item({ id: 'f', type: 'flashcards', title: 'Cards' }),
      item({ id: 'm', type: 'matching', title: 'Pairs' }),
      item({ id: 's', type: 'scenario', title: 'Situations' }),
      item({ id: 'r', type: 'reading', title: 'Text' }),
    ]));
    show();
    await userEvent.click(screen.getByRole('button', { name: /Practice/ }));
    expect(screen.getByText('Cards')).toBeInTheDocument();
    expect(screen.getByText('Situations')).toBeInTheDocument();
    expect(screen.queryByText('Text')).not.toBeInTheDocument();
  });

  it('can hide what is already finished', async () => {
    show();
    await userEvent.click(screen.getByLabelText(/Hide the 1 I have finished/));
    expect(screen.queryByText('Handwashing')).not.toBeInTheDocument();
    expect(screen.getByText('Fire triangle')).toBeInTheDocument();
  });

  /** Offering to hide nothing is a control that does nothing. */
  it('offers no hide control when nothing is finished', () => {
    mocks.library.mockReturnValue(query([item()]));
    show();
    expect(screen.queryByLabelText(/Hide the/)).not.toBeInTheDocument();
  });

  it('says so when a filter empties the list', async () => {
    mocks.library.mockReturnValue(query([item()]));
    show();
    await userEvent.click(screen.getByRole('button', { name: /Hand-ins/ }));
    expect(screen.getByText('Nothing of that kind')).toBeInTheDocument();
  });
});

describe('lock state', () => {
  /** Same rule as the course page, and here the reason matters more. */
  it('does not link a locked activity, and says what comes first', () => {
    show();
    expect(screen.queryByRole('link', { name: /Final check/ })).not.toBeInTheDocument();
    expect(screen.getByText('After 1. Basics')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('links an unlocked one to its activity page, carrying the course', () => {
    show();
    expect(screen.getByRole('link', { name: /Fire triangle/ }))
      .toHaveAttribute('href', '/trainee/activity/a1');
  });

  it('ticks what is done', () => {
    show();
    const row = screen.getByRole('link', { name: /Handwashing/ });
    expect(within(row).getByText('Done')).toBeInTheDocument();
  });
});

describe('nothing to show', () => {
  it('sends a trainee with no courses to the catalog', () => {
    mocks.library.mockReturnValue(query([]));
    show();
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the catalog' }))
      .toHaveAttribute('href', '/trainee/catalog');
  });

  it('reports a failure rather than an empty library', () => {
    mocks.library.mockReturnValue(query(undefined, { error: new Error('nope') }));
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load your library/);
  });
});
