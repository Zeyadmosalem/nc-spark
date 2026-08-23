import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  getCourseOutline: vi.fn(),
  listCourses: vi.fn(async () => []),
  myEnrollments: vi.fn(async () => []),
  applyForCourse: vi.fn(),
  sendChatMessage: vi.fn(),
}));
vi.mock('../../api/courses', () => ({
  getCourseOutline: mocks.getCourseOutline, listCourses: mocks.listCourses,
}));
vi.mock('../../api/enrollments', () => ({
  myEnrollments: mocks.myEnrollments, applyForCourse: mocks.applyForCourse,
}));
vi.mock('../../context/AppContext', () => ({
  useApp: () => ({ chatMessages: {}, sendChatMessage: mocks.sendChatMessage }),
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
    expect(await screen.findByText(/Course Locked/i)).toBeInTheDocument();
  });

  it('shows the pending panel for a pending application', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue([{ id: 'e1', courseId: 'c1', status: 'pending', percent: 0 }]);
    renderAt();
    expect(await screen.findByText(/Enrollment Pending/i)).toBeInTheDocument();
  });

  it('shows not-found for a missing course', async () => {
    mocks.getCourseOutline.mockResolvedValue(null);
    mocks.myEnrollments.mockResolvedValue([]);
    renderAt();
    expect(await screen.findByText(/Course not found/i)).toBeInTheDocument();
  });

  it('reports a failed load instead of claiming the course does not exist', async () => {
    mocks.getCourseOutline.mockRejectedValue(new Error('network down'));
    mocks.myEnrollments.mockResolvedValue(enrolled);
    renderAt();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
  });

  // The prototype's course discussion is in-memory until M5, but it is
  // visible to trainees today and must survive the move to real data.
  it('keeps the course discussion tab', async () => {
    mocks.getCourseOutline.mockResolvedValue(outline);
    mocks.myEnrollments.mockResolvedValue(enrolled);
    const user = userEvent.setup();
    renderAt();
    await user.click(await screen.findByRole('button', { name: /course chat/i }));
    expect(await screen.findByRole('button', { name: /^send$/i })).toBeInTheDocument();
  });
});
