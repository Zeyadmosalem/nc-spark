import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  supportThreads, supportMessages, createSupportRequest,
  replyToSupportRequest, setSupportStatus, markSupportRead,
} from '../api/support';

export const supportKeys = {
  threads: ['support', 'threads'],
  messages: (id) => ['support', 'messages', id],
};

export const useSupportThreads = () =>
  useQuery({ queryKey: supportKeys.threads, queryFn: supportThreads });

export const useSupportMessages = (requestId) =>
  useQuery({
    queryKey: supportKeys.messages(requestId),
    queryFn: () => supportMessages(requestId),
    enabled: Boolean(requestId),
  });

/**
 * Every write here changes two things: the thread it touched, and the list —
 * which carries the message count, the last-activity time and who the thread
 * is waiting on. Invalidating only the thread would leave a trainer's queue
 * still showing "waiting on you" for something they have just answered.
 */
function useSupportMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: supportKeys.threads });
      if (variables?.requestId) {
        queryClient.invalidateQueries({ queryKey: supportKeys.messages(variables.requestId) });
      }
    },
  });
}

export const useCreateSupportRequest = () =>
  useSupportMutation(({ subject, body, courseId }) =>
    createSupportRequest({ subject, body, courseId }));

export const useReplyToSupport = () =>
  useSupportMutation(({ requestId, body }) => replyToSupportRequest({ requestId, body }));

export const useSetSupportStatus = () =>
  useSupportMutation(({ requestId, status }) => setSupportStatus({ requestId, status }));

/**
 * Records that this reader has opened a thread.
 *
 * Deliberately quiet about failure. Somebody is already reading the
 * conversation; an error banner because the read marker did not save would be
 * noise about something they never asked for. The count simply stays up and
 * corrects itself next time.
 */
export function useMarkSupportRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId }) => markSupportRead(requestId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supportKeys.threads }),
    onError: () => {},
  });
}

/**
 * How many threads are waiting on this reader, for the navigation badge.
 *
 * Unread rather than `awaitingStaff`: a trainee's own thread is never "waiting
 * on staff", but a reply they have not read is exactly what a badge should be
 * counting. One query, shared with the inbox by key.
 */
export function useSupportUnread() {
  const threads = useSupportThreads();
  return (threads.data ?? []).filter((t) => t.unreadCount > 0).length;
}
