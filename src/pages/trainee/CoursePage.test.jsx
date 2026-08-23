import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Regression cover for the conditional-hook crash. CoursePage returns early
// for a missing or unenrolled course, and its chat auto-scroll useEffect used
// to sit *after* those returns. Router navigation between two course ids
// reuses the same fiber, so the hook count changed between renders and React
// threw "Rendered fewer hooks than expected".
//
// The data source moved from dummy data to the server in M3, but the crossing
// that used to crash is unchanged: c1 is enrolled, c2 is not, so c1 -> c2
// crosses the guard boundary in both directions.

const mocks = vi.hoisted(() => ({
  getCourseOutline: vi.fn(), listCourses: vi.fn(async () => []),
  myEnrollments: vi.fn(), applyForCourse: vi.fn(), sendChatMessage: vi.fn(),
}));
vi.mock('../../api/courses', () => ({
  getCourseOutline: mocks.getCourseOutline, listCourses: mocks.listCourses,
}));
vi.mock('../../api/enrollments', () => ({
  myEnrollments: mocks.myEnrollments, applyForCourse: mocks.applyForCourse,
}));

const { default: CoursePage } = await import('./CoursePage');

const course = (id, title) => ({
  id, title, description: 'd', color: '#002F6C', icon: '🏥', status: 'published',
  modules: [{ id: `${id}-m1`, title: 'Module One', position: 1, activities: [] }],
});

function NavProbe() {
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => navigate('/course/c1')}>go-c1</button>
      <button onClick={() => navigate('/course/c2')}>go-c2</button>
      <button onClick={() => navigate('/course/nope')}>go-missing</button>
    </div>
  );
}

function renderAt(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <NavProbe />
        <Routes>
          <Route path="/course/:courseId" element={<CoursePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

let consoleError;
beforeEach(() => {
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  // Only c1 is enrolled.
  mocks.myEnrollments.mockResolvedValue([
    { id: 'e1', courseId: 'c1', status: 'active', percent: 25 },
  ]);
  mocks.getCourseOutline.mockImplementation(async (id) =>
    id === 'nope' ? null : course(id, id === 'c1' ? 'Enrolled Course' : 'Other Course'));
});
afterEach(() => consoleError.mockRestore());

const hookOrderError = () =>
  consoleError.mock.calls.flat().some((a) => {
    const msg = a instanceof Error ? a.message : String(a);
    return /Rendered (fewer|more) hooks than expected|change in the order of Hooks/i.test(msg);
  });

describe('CoursePage guard transitions', () => {
  it('renders an enrolled course', async () => {
    renderAt('/course/c1');
    expect(await screen.findByText(/Course Hub/i)).toBeInTheDocument();
  });

  it('shows the locked panel for a course the trainee is not enrolled in', async () => {
    renderAt('/course/c2');
    expect(await screen.findByText(/Course Locked|Enrollment Pending/i)).toBeInTheDocument();
  });

  it('shows not-found for an unknown course', async () => {
    renderAt('/course/nope');
    expect(await screen.findByText(/Course not found/i)).toBeInTheDocument();
  });

  it('navigates enrolled -> unenrolled without a hook-order error', async () => {
    const user = userEvent.setup();
    renderAt('/course/c1');
    await screen.findByText(/Course Hub/i);

    await user.click(screen.getByRole('button', { name: 'go-c2' }));

    expect(await screen.findByText(/Course Locked|Enrollment Pending/i)).toBeInTheDocument();
    expect(hookOrderError()).toBe(false);
  });

  it('navigates unenrolled -> enrolled without a hook-order error', async () => {
    const user = userEvent.setup();
    renderAt('/course/c2');
    await screen.findByText(/Course Locked|Enrollment Pending/i);

    await user.click(screen.getByRole('button', { name: 'go-c1' }));

    expect(await screen.findByText(/Course Hub/i)).toBeInTheDocument();
    expect(hookOrderError()).toBe(false);
  });

  it('navigates enrolled -> missing without a hook-order error', async () => {
    const user = userEvent.setup();
    renderAt('/course/c1');
    await screen.findByText(/Course Hub/i);

    await user.click(screen.getByRole('button', { name: 'go-missing' }));

    expect(await screen.findByText(/Course not found/i)).toBeInTheDocument();
    await waitFor(() => expect(hookOrderError()).toBe(false));
  });
});
