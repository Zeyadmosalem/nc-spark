import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  useCourses: vi.fn(), useMyEnrollments: vi.fn(), useApplyForCourse: vi.fn(),
}));
vi.mock('../../hooks/useCourses', () => ({
  useCourses: mocks.useCourses,
  useMyEnrollments: mocks.useMyEnrollments,
  useApplyForCourse: mocks.useApplyForCourse,
}));

const { default: CourseCatalog } = await import('./CourseCatalog');

const loading = { data: undefined, isLoading: true, error: null };
const ok = (data) => ({ data, isLoading: false, error: null });
const COURSE = [{ id: 'c1', title: 'Health and Safety', color: '#000', icon: '🦺' }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useApplyForCourse.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
});

describe('CourseCatalog', () => {
  it('offers an unenrolled course', () => {
    mocks.useCourses.mockReturnValue(ok(COURSE));
    mocks.useMyEnrollments.mockReturnValue(ok([]));
    render(<CourseCatalog />);
    expect(screen.getByRole('button', { name: /apply to enrol/i })).toBeEnabled();
  });

  it('shows a pending application as awaiting approval', () => {
    mocks.useCourses.mockReturnValue(ok(COURSE));
    mocks.useMyEnrollments.mockReturnValue(ok([{ id: 'e1', courseId: 'c1', status: 'pending' }]));
    render(<CourseCatalog />);
    expect(screen.getByRole('button', { name: /awaiting approval/i })).toBeDisabled();
  });

  it('hides a course the trainee is already enrolled on', () => {
    mocks.useCourses.mockReturnValue(ok(COURSE));
    mocks.useMyEnrollments.mockReturnValue(ok([{ id: 'e1', courseId: 'c1', status: 'active' }]));
    render(<CourseCatalog />);
    expect(screen.queryByText('Health and Safety')).not.toBeInTheDocument();
  });

  // Enrolment state decides whether a course is offered at all and whether its
  // button is live. Rendering before it arrives offers "Apply to enrol" on a
  // course the trainee already holds, and the click fails on the unique index.
  it('waits for enrolment state before offering anything', () => {
    mocks.useCourses.mockReturnValue(ok(COURSE));
    mocks.useMyEnrollments.mockReturnValue(loading);
    render(<CourseCatalog />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apply to enrol/i })).not.toBeInTheDocument();
  });
});
