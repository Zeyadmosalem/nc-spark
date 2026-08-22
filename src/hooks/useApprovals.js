import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pendingEnrollments, decideEnrollment } from '../api/enrollments';

export const approvalKeys = { pendingEnrollments: ['enrollments', 'pending'] };

export function usePendingEnrollments() {
  return useQuery({
    queryKey: approvalKeys.pendingEnrollments,
    queryFn: pendingEnrollments,
  });
}

export function useDecideEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ enrollmentId, decision }) => decideEnrollment(enrollmentId, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: approvalKeys.pendingEnrollments });
      queryClient.invalidateQueries({ queryKey: ['enrollments', 'mine'] });
    },
  });
}
