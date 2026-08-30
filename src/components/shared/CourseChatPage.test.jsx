import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// This page exists because the chat used to live inside the course builder's
// body, below the materials list and above the new-module form — so a trainer
// reached the conversation with their class by opening the edit screen and
// scrolling past the module editor. A trainee had a tab for the same thing.
//
// The two things worth holding: the tab strip is built from the caller's base
// path, so the same page serves trainer and admin without either hard-coding
// the other's routes; and the card does not repeat the heading the page
// already shows.

const mocks = vi.hoisted(() => ({ useCourseOutline: vi.fn(), tabs: vi.fn(), chat: vi.fn() }));
// Only useParams is stubbed; PageHeader renders a real Link, so the rest of
// the router has to stay itself.
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ courseId: 'c1' }),
}));
vi.mock('../../hooks/useCourses', () => ({ useCourseOutline: mocks.useCourseOutline }));
vi.mock('./CourseTabs', () => ({
  default: (props) => { mocks.tabs(props); return <nav data-testid="tabs" />; },
}));
vi.mock('./CourseChat', () => ({
  default: (props) => { mocks.chat(props); return <div data-testid="chat" />; },
}));

const CourseChatPage = (await import('./CourseChatPage')).default;

const query = (over) => ({ data: undefined, isLoading: false, error: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useCourseOutline.mockReturnValue(query({ data: { id: 'c1', title: 'Fire Safety' } }));
});

describe('while the course loads', () => {
  it('shows a skeleton with a label a screen reader can hear', () => {
    mocks.useCourseOutline.mockReturnValue(query({ isLoading: true }));
    render(<MemoryRouter><CourseChatPage /></MemoryRouter>);
    expect(screen.getByText('Loading this course')).toBeInTheDocument();
  });

  it('does not mount the chat before the course is known', () => {
    mocks.useCourseOutline.mockReturnValue(query({ isLoading: true }));
    render(<MemoryRouter><CourseChatPage /></MemoryRouter>);
    expect(screen.queryByTestId('chat')).not.toBeInTheDocument();
  });
});

describe('when the course cannot be read', () => {
  it('reports the failure instead of an empty conversation', () => {
    mocks.useCourseOutline.mockReturnValue(query({ error: new Error('refused') }));
    render(<MemoryRouter><CourseChatPage /></MemoryRouter>);

    expect(screen.getByText(/this course/i)).toBeInTheDocument();
    expect(screen.queryByTestId('chat')).not.toBeInTheDocument();
  });
});

describe('the page', () => {
  it('names the course above the conversation', () => {
    render(<MemoryRouter><CourseChatPage /></MemoryRouter>);
    expect(screen.getByText('Fire Safety')).toBeInTheDocument();
    expect(screen.getByText('Course chat')).toBeInTheDocument();
  });

  it('falls back to a generic eyebrow if the title has not arrived', () => {
    mocks.useCourseOutline.mockReturnValue(query({ data: {} }));
    render(<MemoryRouter><CourseChatPage /></MemoryRouter>);
    expect(screen.getByText('Course')).toBeInTheDocument();
  });

  it('mounts the chat for this course', () => {
    render(<MemoryRouter><CourseChatPage /></MemoryRouter>);
    expect(screen.getByTestId('chat')).toBeInTheDocument();
    expect(mocks.chat.mock.calls[0][0]).toMatchObject({ courseId: 'c1' });
  });

  /** The page header is the title; a second one inside the card is noise. */
  it('tells the chat not to draw its own heading', () => {
    render(<MemoryRouter><CourseChatPage /></MemoryRouter>);
    expect(mocks.chat.mock.calls[0][0].heading).toBeNull();
  });

  /**
   * Built from the caller's base path, so trainer and admin share this page
   * without either hard-coding the other's routes.
   */
  it('builds the tab strip from the caller base path', () => {
    render(<MemoryRouter><CourseChatPage backTo="/admin/content" /></MemoryRouter>);
    expect(mocks.tabs.mock.calls[0][0]).toMatchObject({ base: '/admin/content/c1' });
  });

  it('defaults that base to the trainer courses list', () => {
    render(<MemoryRouter><CourseChatPage /></MemoryRouter>);
    expect(mocks.tabs.mock.calls[0][0].base).toBe('/trainer/courses/c1');
  });
});
