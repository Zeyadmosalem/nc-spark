import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getActivity, completeActivity } from '../api/activities';
import { courseKeys } from './useCourses';

export const activityKeys = { one: (id) => ['activities', id] };

export function useActivity(id) {
  return useQuery({
    queryKey: activityKeys.one(id),
    queryFn: () => getActivity(id),
    enabled: Boolean(id),
  });
}

export function useCompleteActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ activityId, payload }) => completeActivity(activityId, payload),
    // Completion changes progress and can unlock the next module, so the
    // enrollment list and every course outline go stale. Without this the
    // trainee keeps seeing a padlock the server has already opened.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.myEnrollments });
      queryClient.invalidateQueries({ queryKey: ['courses', 'outline'] });
    },
  });
}
