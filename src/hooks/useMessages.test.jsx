import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Course chat had no live delivery: a reply arrived only when the reader
// happened to reload. These cover the subscription itself — that it is opened
// for the right course, that an insert refreshes the thread, and above all
// that it is closed again, since a channel left open per mount is a leak that
// accumulates for as long as somebody keeps the tab open.

const mocks = vi.hoisted(() => ({
  listCourseMessages: vi.fn(),
  sendCourseMessage: vi.fn(),
  channel: null,
  removeChannel: vi.fn(),
}));

/** A stand-in for the realtime channel, recording how it was configured. */
function makeChannel() {
  const handlers = [];
  const channel = {
    name: null,
    handlers,
    on: vi.fn((event, config, handler) => {
      handlers.push({ event, config, handler });
      return channel;
    }),
    subscribe: vi.fn(() => channel),
    // Lets a test pretend the server pushed an INSERT.
    emit: (payload) => handlers.forEach((h) => h.handler(payload)),
  };
  return channel;
}

vi.mock('../api/messages', () => ({
  listCourseMessages: mocks.listCourseMessages,
  sendCourseMessage: mocks.sendCourseMessage,
  MESSAGE_PAGE_SIZE: 50,
}));

vi.mock('../api/client', () => ({
  supabase: {
    channel: vi.fn((name) => {
      mocks.channel = makeChannel();
      mocks.channel.name = name;
      return mocks.channel;
    }),
    removeChannel: mocks.removeChannel,
  },
  requireClient: () => ({ channel: vi.fn(), removeChannel: vi.fn() }),
  isConfigured: true,
}));

const { useCourseMessages } = await import('./useMessages');
const { supabase } = await import('../api/client');

function wrapper({ children }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.channel = null;
  mocks.listCourseMessages.mockResolvedValue([]);
});

describe('subscribing to a course thread', () => {
  it('opens a channel scoped to the course', async () => {
    renderHook(() => useCourseMessages('course-1'), { wrapper });

    await waitFor(() => expect(supabase.channel).toHaveBeenCalled());
    expect(mocks.channel.name).toContain('course-1');
    expect(mocks.channel.subscribe).toHaveBeenCalled();
  });

  /**
   * The filter is what stops one course's chat waking every other open tab.
   * Without it the client receives every insert on the table and discards most
   * of them, which is both wasteful and a way to learn that other courses are
   * busy.
   */
  it('listens only for inserts on this course', async () => {
    renderHook(() => useCourseMessages('course-1'), { wrapper });
    await waitFor(() => expect(mocks.channel).toBeTruthy());

    const [, config] = mocks.channel.on.mock.calls[0];
    expect(config).toMatchObject({
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: 'course_id=eq.course-1',
    });
  });

  it('refetches the thread when a message arrives', async () => {
    renderHook(() => useCourseMessages('course-1'), { wrapper });
    await waitFor(() => expect(mocks.listCourseMessages).toHaveBeenCalledTimes(1));

    mocks.channel.emit({ eventType: 'INSERT' });

    await waitFor(() =>
      expect(mocks.listCourseMessages).toHaveBeenCalledTimes(2));
  });

  /** A channel per mount that is never closed is a leak. */
  it('closes the channel on unmount', async () => {
    const { unmount } = renderHook(() => useCourseMessages('course-1'), { wrapper });
    await waitFor(() => expect(mocks.channel).toBeTruthy());

    const opened = mocks.channel;
    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledWith(opened);
  });

  it('opens nothing without a course', async () => {
    renderHook(() => useCourseMessages(undefined), { wrapper });
    await waitFor(() => expect(mocks.listCourseMessages).not.toHaveBeenCalled());
    expect(supabase.channel).not.toHaveBeenCalled();
  });
});
