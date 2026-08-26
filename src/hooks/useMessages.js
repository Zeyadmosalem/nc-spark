import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listCourseMessages, sendCourseMessage } from '../api/messages';

export const messageKeys = {
  list: (courseId) => ['messages', courseId],
};

export function useCourseMessages(courseId) {
  return useQuery({
    queryKey: messageKeys.list(courseId),
    queryFn: () => listCourseMessages(courseId),
    enabled: Boolean(courseId),
  });
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
