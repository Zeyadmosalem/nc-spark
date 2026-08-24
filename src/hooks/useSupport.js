import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  supportThreads, supportMessages, createSupportRequest,
  replyToSupportRequest, setSupportStatus,
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
