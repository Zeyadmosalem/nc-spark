import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ useCourses: vi.fn(), useMyEnrollments: vi.fn() }));
vi.mock('../../hooks/useCourses', () => ({
  useCourses: mocks.useCourses,
  useMyEnrollments: mocks.useMyEnrollments,
}));
vi.mock('../../context/AppContext', () => ({ useApp: () => ({}) }));

const { MyCoursesPage } = await import('./TraineeShell');

const idle = { data: undefined, isLoading: false, error: null };
const loading = { data: undefined, isLoading: true, error: null };
const ok = (data) => ({ data, isLoading: false, error: null });
const failed = (message) => ({ data: undefined, isLoading: false, error: new Error(message) });

const show = () => render(<MemoryRouter><MyCoursesPage /></MemoryRouter>);

beforeEach(() => vi.clearAllMocks());

describe('MyCoursesPage', () => {
  it('lists an enrolled course', () => {
    mocks.useMyEnrollments.mockReturnValue(ok([{ id: 'e1', courseId: 'c1', status: 'active', percent: 40 }]));
    mocks.useCourses.mockReturnValue(ok([{ id: 'c1', title: 'Health and Safety' }]));
    show();
    expect(screen.getByText('Health and Safety')).toBeInTheDocument();
  });

  it('invites the trainee to the catalog when they have no enrollments', () => {
    mocks.useMyEnrollments.mockReturnValue(ok([]));
    mocks.useCourses.mockReturnValue(ok([]));
    show();
    expect(screen.getByText(/not enrolled in any course/i)).toBeInTheDocument();
  });

  // The two queries settle independently. If only the enrollment query is
  // consulted for loading state, the course lookup misses, every card is
  // skipped, and the trainee sees a blank page mid-flight.
  it('keeps waiting while the course list is still in flight', () => {
    mocks.useMyEnrollments.mockReturnValue(ok([{ id: 'e1', courseId: 'c1', status: 'active', percent: 40 }]));
    mocks.useCourses.mockReturnValue(loading);
    show();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(/not enrolled in any course/i)).not.toBeInTheDocument();
  });

  it('reports a failed enrollment load instead of an empty library', () => {
    mocks.useMyEnrollments.mockReturnValue(failed('network down'));
    mocks.useCourses.mockReturnValue(ok([]));
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i);
    expect(screen.queryByText(/not enrolled in any course/i)).not.toBeInTheDocument();
  });

  it('reports a failed course load too', () => {
    mocks.useMyEnrollments.mockReturnValue(ok([]));
    mocks.useCourses.mockReturnValue(failed('network down'));
    show();
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i);
  });

  it('does not hang on a spinner when both queries are simply idle', () => {
    mocks.useMyEnrollments.mockReturnValue(idle);
    mocks.useCourses.mockReturnValue(idle);
    show();
    expect(screen.getByText(/not enrolled in any course/i)).toBeInTheDocument();
  });
});
