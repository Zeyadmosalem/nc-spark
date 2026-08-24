import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  getCourseOutline: vi.fn(),
  listCourses: vi.fn(async () => []),
  myEnrollments: vi.fn(async () => []),
  applyForCourse: vi.fn(),
  sendChatMessage: vi.fn(),
  myCompletions: vi.fn(async () => new Set()),
}));
vi.mock('../../api/courses', () => ({
  getCourseOutline: mocks.getCourseOutline, listCourses: mocks.listCourses,
}));
vi.mock('../../api/enrollments', () => ({
  myEnrollments: mocks.myEnrollments, applyForCourse: mocks.applyForCourse,
}));
// moduleLockState is deliberately NOT mocked. It is the browser's copy of
// app.is_module_unlocked, and supabase/tests/module-locks.test.js pins it
// against the database; mocking it here would leave these tests asserting
// nothing about which modules actually open.
vi.mock('../../api/progress', async (importOriginal) => ({
  ...await importOriginal(),
  myCompletions: mocks.myCompletions,
}));

const { default: CoursePage } = await import('./CoursePage');

function renderAt(courseId = 'c1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/trainee/courses/${courseId}`]}>
        <Routes>
          <Route path="/trainee/courses/:courseId" element={<CoursePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const outline = {
  id: 'c1', title: 'Health and Safety', subtitle: 'Basics', description: 'd',
  color: '#002F6C', icon: '🏥', status: 'published',
  modules: [
    { id: 'm1', title: 'Fundamentals', position: 1, activities: [
      { id: 'a1', type: 'reading', title: 'Hazards', position: 1, xp: 8 },
      { id: 'a2', type: 'video', title: 'Walkthrough', position: 2, xp: 10 },
    ] },
    { id: 'm2', title: 'Assessment', position: 2, activities: [] },
  ],
};
const enrolled = [{ id: 'e1', courseId: 'c1', status: 'active', percent: 50 }];

/** Module two gated behind module one, which is how a real course is built. */
const gatedOutline = {
  ...outline,
  modules: [
    outline.modules[0],
    {
      id: 'm2', title: 'Assessment', position: 2, unlockAfterModuleId: 'm1',
      activities: [{ id: 'a3', type: 'quiz', title: 'Final check', position: 1, xp: 20 }],
    },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('CoursePage outline', () => {
  it('shows a loading state first', () => {
    mocks.getCourseOutline.mockReturnValue(new Promise(() => {}));
    mocks.myEnrollments.mockResolvedValue([]);
    renderAt();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders modules and activities from the server', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue(enrolled);
    renderAt();
    expect(await screen.findByText('1. Fundamentals')).toBeInTheDocument();
    expect(screen.getByText('Hazards')).toBeInTheDocument();
    expect(screen.getByText('Walkthrough')).toBeInTheDocument();
  });

  it('links each activity to its page, carrying the course for the back button', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue(enrolled);
    renderAt();
    const link = await screen.findByRole('link', { name: /Hazards/ });
    expect(link).toHaveAttribute('href', '/trainee/activity/a1');
  });

  it('shows the derived progress percentage', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue(enrolled);
    renderAt();
    expect(await screen.findByText('50%')).toBeInTheDocument();
  });

  it('says so when a module has no activities', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue(enrolled);
    renderAt();
    expect(await screen.findByText(/No activities yet/i)).toBeInTheDocument();
  });

  it('shows the locked panel when not enrolled', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue([]);
    renderAt();
    expect(await screen.findByText(/Not enrolled/i)).toBeInTheDocument();
  });

  it('shows the pending panel for a pending application', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue([{ id: 'e1', courseId: 'c1', status: 'pending', percent: 0 }]);
    renderAt();
    expect(await screen.findByText(/Application pending/i)).toBeInTheDocument();
  });

  it('shows not-found for a missing course', async () => {
    mocks.getCourseOutline.mockResolvedValue(null);
    mocks.myEnrollments.mockResolvedValue([]);
    renderAt();
    expect(await screen.findByText(/That course is not here/i)).toBeInTheDocument();
  });

  it('reports a failed load instead of claiming the course does not exist', async () => {
    mocks.getCourseOutline.mockRejectedValue(new Error('network down'));
    mocks.myEnrollments.mockResolvedValue(enrolled);
    renderAt();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
  });

  /**
   * The reverse of the test that used to keep this tab. The chat behind it was
   * the prototype's in-memory implementation: messages persisted nowhere and
   * reached no one, so a trainee asking a question got silence and then lost
   * the question on reload. It returns with M5 (backlog B8).
   */
  it('offers no chat tab, because the chat behind it reached nobody', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue(enrolled);
    renderAt();
    await screen.findByRole('tab', { name: /learning path/i });
    expect(screen.queryByRole('tab', { name: /course chat/i })).not.toBeInTheDocument();
  });

  /**
   * XP is authored on every activity and awarded by nothing (backlog B7).
   * "+8 XP" next to an activity was the last fabricated figure on a trainee's
   * screen: a promise of a total that does not exist anywhere in the product.
   */
  it('does not promise XP that nothing awards', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue(enrolled);
    renderAt();
    await screen.findByText('Hazards');
    expect(screen.queryByText(/XP/)).not.toBeInTheDocument();
  });
});

describe('what a trainee has finished', () => {
  beforeEach(() => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue(enrolled);
  });

  it('ticks the activities that are done', async () => {
    mocks.myCompletions.mockResolvedValue(new Set(['a1']));
    renderAt();
    // The link renders from the outline, which arrives before the
    // completions do — so waiting on the link alone would assert before the
    // ticks exist.
    await screen.findByText('Done');
    const hazards = screen.getByRole('link', { name: /Hazards/ });
    expect(within(hazards).getByText('Done')).toBeInTheDocument();

    const video = screen.getByRole('link', { name: /Walkthrough/ });
    expect(within(video).queryByText('Done')).not.toBeInTheDocument();
  });

  it('counts them per module', async () => {
    mocks.myCompletions.mockResolvedValue(new Set(['a1']));
    renderAt();
    expect(await screen.findByText('1 of 2 done')).toBeInTheDocument();
  });

  it('says a module is complete rather than counting to itself', async () => {
    mocks.myCompletions.mockResolvedValue(new Set(['a1', 'a2']));
    renderAt();
    expect(await screen.findByText('Complete')).toBeInTheDocument();
  });
});

describe('a module behind a gate', () => {
  beforeEach(() => {
    mocks.getCourseOutline.mockResolvedValue(gatedOutline);
    mocks.myEnrollments.mockResolvedValue(enrolled);
  });

  /**
   * complete-activity refuses a locked activity server-side. Before this the
   * only way to discover that was to open one and be turned away, with nothing
   * to say what was in the way.
   */
  it('says what is in the way, and how much of it is left', async () => {
    mocks.myCompletions.mockResolvedValue(new Set());
    renderAt();
    expect(await screen.findByText(/Finish 1\. Fundamentals first/))
      .toHaveTextContent('2 activities to go');
  });

  it('counts down as the prerequisite is worked through', async () => {
    mocks.myCompletions.mockResolvedValue(new Set(['a1']));
    renderAt();
    expect(await screen.findByText(/1 activity to go/)).toBeInTheDocument();
  });

  /** A link the server will refuse is an invitation to a dead end. */
  it('does not link a locked activity at all', async () => {
    mocks.myCompletions.mockResolvedValue(new Set());
    renderAt();
    await screen.findByText('Final check');
    expect(screen.queryByRole('link', { name: /Final check/ })).not.toBeInTheDocument();
    // A padlock glyph is not a status to somebody using a screen reader.
    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('opens it once the prerequisite is finished', async () => {
    mocks.myCompletions.mockResolvedValue(new Set(['a1', 'a2']));
    renderAt();
    expect(await screen.findByRole('link', { name: /Final check/ }))
      .toHaveAttribute('href', '/trainee/activity/a3');
    expect(screen.queryByText(/first/)).not.toBeInTheDocument();
  });

  /**
   * Completions arrive after the outline. Treating "not loaded yet" as
   * unlocked would show an open course for a moment and then shut it, which
   * looks like the app taking something away.
   */
  it('stays locked while the completions are still loading', async () => {
    mocks.myCompletions.mockReturnValue(new Promise(() => {}));
    renderAt();
    await screen.findByText('Final check');
    expect(screen.queryByRole('link', { name: /Final check/ })).not.toBeInTheDocument();
  });
});
