import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listCourseMessages, sendCourseMessage } from '../api/messages';
import { supabase } from '../api/client';

export const messageKeys = {
  list: (courseId) => ['messages', courseId],
};

/**
 * The recent end of a course conversation, kept live.
 *
 * The query is the source of truth and the subscription only invalidates it,
 * rather than pushing the payload straight into the cache. That costs one
 * refetch per arriving message and buys the thing that matters: what comes
 * back has been through RLS as this reader, so a row Realtime delivered can
 * never appear in a thread the reader is not entitled to.
 *
 * Without this a reply arrived only when somebody happened to reload.
 */
export function useCourseMessages(courseId) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: messageKeys.list(courseId),
    queryFn: () => listCourseMessages(courseId),
    enabled: Boolean(courseId),
  });

  useEffect(() => {
    if (!courseId || !supabase) return undefined;

    const channel = supabase
      .channel(`course-chat-${courseId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          // Scoped to this course, so one busy thread does not wake every
          // other tab the reader has open.
          filter: `course_id=eq.${courseId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: messageKeys.list(courseId) });
        },
      )
      .subscribe();

    // A channel per mount that is never closed accumulates for as long as the
    // tab stays open.
    return () => { supabase.removeChannel(channel); };
  }, [courseId, queryClient]);

  return query;
}

export function useSendCourseMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ courseId, body }) => sendCourseMessage({ courseId, body }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messageKeys.list(variables.courseId) });
    },
  });
}

/**
 * The page of messages behind the ones on screen.
 *
 * A mutation rather than a query: it is fired by a button and its result is
 * accumulated by the caller, so there is no key to cache it under. The list
 * query stays the live view of the recent end of the conversation.
 */
export function useOlderCourseMessages(courseId) {
  return useMutation({
    mutationFn: (before) => listCourseMessages(courseId, { before }),
  });
}
