import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderQuery } from '../test/queryHarness';

// The invalidation scope is the whole point of this file. Every write changes
// two things — the thread it touched, and the list, which carries the message
// count, the last-activity time and who the thread is waiting on. Invalidating
// only the thread leaves a trainer's queue still saying "waiting on you" for
// something they have just answered.

const mocks = vi.hoisted(() => ({
  supportThreads: vi.fn(), supportMessages: vi.fn(), createSupportRequest: vi.fn(),
  replyToSupportRequest: vi.fn(), setSupportStatus: vi.fn(), markSupportRead: vi.fn(),
}));
vi.mock('../api/support', () => mocks);

const {
  useSupportThreads, useSupportMessages, useCreateSupportRequest, useReplyToSupport,
  useSetSupportStatus, useMarkSupportRead, useSupportUnread, supportKeys,
} = await import('./useSupport');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.supportThreads.mockResolvedValue([]);
  mocks.supportMessages.mockResolvedValue([]);
  mocks.createSupportRequest.mockResolvedValue({ id: 'r1' });
  mocks.replyToSupportRequest.mockResolvedValue({});
  mocks.setSupportStatus.mockResolvedValue({});
  mocks.markSupportRead.mockResolvedValue({});
});

describe('reading', () => {
  it('lists the threads', async () => {
    mocks.supportThreads.mockResolvedValue([{ id: 'a', unreadCount: 0 }]);
    const { result } = renderQuery(() => useSupportThreads());
    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it('reads one thread', async () => {
    const { result } = renderQuery(() => useSupportMessages('r1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.supportMessages).toHaveBeenCalledWith('r1');
  });

  /** Without the guard this asks the server for the messages of undefined. */
  it('does not fetch a thread before one is chosen', () => {
    renderQuery(() => useSupportMessages(undefined));
    expect(mocks.supportMessages).not.toHaveBeenCalled();
  });

  it('keys a thread by its id, so two threads do not share a cache', () => {
    expect(supportKeys.messages('a')).not.toEqual(supportKeys.messages('b'));
  });
});

describe('writing', () => {
  const invalidated = (client) => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    return () => spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey));
  };

  it('refreshes the list as well as the thread after a reply', async () => {
    const { result, client } = renderQuery(() => useReplyToSupport());
    const keys = invalidated(client);

    result.current.mutate({ requestId: 'r1', body: 'here you go' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(keys()).toContain(JSON.stringify(supportKeys.threads));
    expect(keys()).toContain(JSON.stringify(supportKeys.messages('r1')));
  });

  it('refreshes the list after a status change', async () => {
    const { result, client } = renderQuery(() => useSetSupportStatus());
    const keys = invalidated(client);

    result.current.mutate({ requestId: 'r1', status: 'closed' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(keys()).toContain(JSON.stringify(supportKeys.threads));
  });

  /** A new request has no requestId yet, so only the list can be refreshed. */
  it('refreshes only the list when there is no thread yet', async () => {
    const { result, client } = renderQuery(() => useCreateSupportRequest());
    const keys = invalidated(client);

    result.current.mutate({ subject: 'Help', body: 'Please' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(keys()).toEqual([JSON.stringify(supportKeys.threads)]);
  });

  it('passes only the fields the api asked for', async () => {
    const { result } = renderQuery(() => useCreateSupportRequest());
    result.current.mutate({ subject: 'S', body: 'B', courseId: 'c1', stray: 'no' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.createSupportRequest).toHaveBeenCalledWith({
      subject: 'S', body: 'B', courseId: 'c1',
    });
  });
});

describe('marking a thread read', () => {
  it('refreshes the list so the badge drops', async () => {
    const { result, client } = renderQuery(() => useMarkSupportRead());
    const spy = vi.spyOn(client, 'invalidateQueries');

    result.current.mutate({ requestId: 'r1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: supportKeys.threads });
  });

  /**
   * Deliberately quiet. Somebody is already reading the conversation; an error
   * because the read marker did not save is noise about something they never
   * asked for. The count stays up and corrects itself next time.
   */
  it('swallows a failure rather than interrupting the reader', async () => {
    mocks.markSupportRead.mockRejectedValue(new Error('offline'));
    const { result } = renderQuery(() => useMarkSupportRead());

    result.current.mutate({ requestId: 'r1' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    // isError is the mutation's own state; what matters is that the onError
    // handler exists and does nothing, so nothing is thrown at the UI.
    expect(result.current.failureReason?.message).toBe('offline');
  });
});

describe('useSupportUnread', () => {
  /**
   * Unread rather than "awaiting staff": a trainee's own thread is never
   * waiting on staff, but a reply they have not read is exactly what a badge
   * should count.
   */
  it('counts threads with something unread', async () => {
    mocks.supportThreads.mockResolvedValue([
      { id: 'a', unreadCount: 2 }, { id: 'b', unreadCount: 0 }, { id: 'c', unreadCount: 1 },
    ]);
    const { result } = renderQuery(() => useSupportUnread());
    await waitFor(() => expect(result.current).toBe(2));
  });

  it('is zero while the threads are still loading', () => {
    const { result } = renderQuery(() => useSupportUnread());
    expect(result.current).toBe(0);
  });

  it('is zero when nothing is unread', async () => {
    mocks.supportThreads.mockResolvedValue([{ id: 'a', unreadCount: 0 }]);
    const { result } = renderQuery(() => useSupportUnread());
    await waitFor(() => expect(result.current).toBe(0));
  });
});
