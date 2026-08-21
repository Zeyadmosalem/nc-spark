import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AppProvider } from '../../context/AppContext';
import { USERS } from '../../data/dummyData';
import CoursePage from './CoursePage';

// Regression cover for the conditional-hook crash. CoursePage returned early
// for a missing or unenrolled course *before* reaching its useEffect. Router
// navigation between two course ids reuses the same fiber, so the hook count
// changed between renders and React threw "Rendered fewer hooks than expected".
//
// Trainee s1 is enrolled in c1 and c3, but NOT c2 — so c1 -> c2 crosses the
// guard boundary, which is exactly the case that used to crash.

// Auth now lives in useSession; AppContext receives the profile as a prop.
const trainee = USERS.trainees.find((t) => t.id === 's1');

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
  return render(
    <AppProvider currentUser={trainee}>
      <MemoryRouter initialEntries={[path]}>
        <NavProbe />
        <Routes>
          <Route path="/course/:courseId" element={<CoursePage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>
  );
}

let consoleError;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

const hookOrderError = () =>
  consoleError.mock.calls.flat().some((a) => {
    const msg = a instanceof Error ? a.message : String(a);
    return /Rendered (fewer|more) hooks than expected|change in the order of Hooks/i.test(msg);
  });

describe('CoursePage guard transitions', () => {
  it('renders an enrolled course', () => {
    renderAt('/course/c1');
    expect(screen.getByText(/Course Hub/i)).toBeInTheDocument();
  });

  it('shows the locked panel for a course the trainee is not enrolled in', () => {
    renderAt('/course/c2');
    expect(screen.getByText(/Course Locked|Enrollment Pending/i)).toBeInTheDocument();
  });

  it('shows not-found for an unknown course', () => {
    renderAt('/course/nope');
    expect(screen.getByText(/Course not found/i)).toBeInTheDocument();
  });

  it('navigates enrolled -> unenrolled without a hook-order error', async () => {
    const user = userEvent.setup();
    renderAt('/course/c1');
    expect(screen.getByText(/Course Hub/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'go-c2' }));

    expect(screen.getByText(/Course Locked|Enrollment Pending/i)).toBeInTheDocument();
    expect(hookOrderError()).toBe(false);
  });

  it('navigates unenrolled -> enrolled without a hook-order error', async () => {
    const user = userEvent.setup();
    renderAt('/course/c2');
    await user.click(screen.getByRole('button', { name: 'go-c1' }));

    expect(screen.getByText(/Course Hub/i)).toBeInTheDocument();
    expect(hookOrderError()).toBe(false);
  });

  it('navigates enrolled -> missing course without a hook-order error', async () => {
    const user = userEvent.setup();
    renderAt('/course/c1');
    await user.click(screen.getByRole('button', { name: 'go-missing' }));

    expect(screen.getByText(/Course not found/i)).toBeInTheDocument();
    expect(hookOrderError()).toBe(false);
  });

  it('survives repeated back-and-forth navigation across the guard', async () => {
    const user = userEvent.setup();
    renderAt('/course/c1');

    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: 'go-c2' }));
      await user.click(screen.getByRole('button', { name: 'go-missing' }));
      await user.click(screen.getByRole('button', { name: 'go-c1' }));
    }

    expect(screen.getByText(/Course Hub/i)).toBeInTheDocument();
    expect(hookOrderError()).toBe(false);
  });
});
