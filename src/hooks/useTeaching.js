import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { myTeachingRequests, requestToTeach } from '../api/teaching';

export const teachingKeys = { mine: ['teaching', 'mine'] };

export const useMyTeachingRequests = () =>
  useQuery({ queryKey: teachingKeys.mine, queryFn: myTeachingRequests });

/**
 * The trainer half of the queue an admin decides. Only the request list goes
 * stale: the course does not change owner until an admin approves.
 */
export function useRequestToTeach() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId }) => requestToTeach(courseId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teachingKeys.mine }),
  });
}
