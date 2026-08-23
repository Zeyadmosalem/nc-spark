import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  pendingReviews, blockedAttempts, openRetakeGrants, gradeParagraph, grantRetake,
} from '../api/review';

export const reviewKeys = {
  pending: ['review', 'pending'],
  blocked: ['review', 'blocked'],
  grants: ['review', 'grants'],
};

export const usePendingReviews = () =>
  useQuery({ queryKey: reviewKeys.pending, queryFn: pendingReviews });

export const useBlockedAttempts = () =>
  useQuery({ queryKey: reviewKeys.blocked, queryFn: blockedAttempts });

export const useOpenRetakeGrants = () =>
  useQuery({ queryKey: reviewKeys.grants, queryFn: openRetakeGrants });

/** Both queues shift when a grade lands: a marked attempt leaves the review
 *  list and, if it failed, joins the blocked one. */
function invalidateQueues(queryClient) {
  queryClient.invalidateQueries({ queryKey: reviewKeys.pending });
  queryClient.invalidateQueries({ queryKey: reviewKeys.blocked });
  queryClient.invalidateQueries({ queryKey: reviewKeys.grants });
}

// The mutationFn is wrapped rather than passed by reference: TanStack calls it
// with (variables, context), and handing an api function a mutation context it
// never asked for is how an internal object ends up in a request body.
export function useGradeParagraph() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars) => gradeParagraph(vars),
    onSuccess: () => invalidateQueues(queryClient),
  });
}

export function useGrantRetake() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars) => grantRetake(vars),
    onSuccess: () => invalidateQueues(queryClient),
  });
}
