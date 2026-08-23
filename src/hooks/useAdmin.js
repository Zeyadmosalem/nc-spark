import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listUsers, pendingSignups, platformStats, recentAudit,
  listAllowedDomains, addAllowedDomain, removeAllowedDomain,
} from '../api/admin';
import { pendingTeachingRequests, decideTeachingRequest } from '../api/teaching';
import { setUserRole, reviewSignup, suspendUser } from '../api/profiles';

export const adminKeys = {
  users: ['admin', 'users'],
  pendingSignups: ['admin', 'signups', 'pending'],
  stats: ['admin', 'stats'],
  allowedDomains: ['admin', 'allowed-domains'],
  // `audit` is the prefix the mutations invalidate; `auditPage` is what a
  // component subscribes to. TanStack matches prefixes, so invalidating the
  // short key clears every page size without either side naming a limit.
  teachingRequests: ['admin', 'teaching', 'pending'],
  audit: ['admin', 'audit'],
  auditPage: (limit) => ['admin', 'audit', limit],
};

export const useUsers = () =>
  useQuery({ queryKey: adminKeys.users, queryFn: listUsers });

export const usePendingSignups = () =>
  useQuery({ queryKey: adminKeys.pendingSignups, queryFn: pendingSignups });

export const usePlatformStats = () =>
  useQuery({ queryKey: adminKeys.stats, queryFn: platformStats });

export const useRecentAudit = (limit = 25) =>
  useQuery({ queryKey: adminKeys.auditPage(limit), queryFn: () => recentAudit(limit) });

/**
 * Any of the three admin writes can move a user between the queue and the
 * directory, and all three write an audit row. Refreshing one list and not the
 * others is how an admin approves the same person twice.
 */
function invalidateAll(queryClient) {
  queryClient.invalidateQueries({ queryKey: adminKeys.users });
  queryClient.invalidateQueries({ queryKey: adminKeys.pendingSignups });
  queryClient.invalidateQueries({ queryKey: adminKeys.stats });
  queryClient.invalidateQueries({ queryKey: adminKeys.audit });
}

// Each mutationFn unpacks a single object rather than being passed by
// reference: TanStack invokes it as fn(variables, context), and an api
// function with positional arguments would put a QueryClient in the body.
export function useSetUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }) => setUserRole(userId, role),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useReviewSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, decision, role }) => reviewSignup(userId, decision, role),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useSuspendUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, suspend }) => suspendUser(userId, suspend),
    onSuccess: () => invalidateAll(queryClient),
  });
}

export const useTeachingRequests = () =>
  useQuery({ queryKey: adminKeys.teachingRequests, queryFn: pendingTeachingRequests });

/**
 * Approving assigns courses.trainer_id, which decides who can edit and publish
 * that course. The course list has to be refetched or the Curriculum page goes
 * on showing "no trainer" for a course that now has one.
 */
export function useDecideTeachingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, decision }) => decideTeachingRequest(requestId, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.teachingRequests });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: adminKeys.audit });
    },
  });
}

export const useAllowedDomains = () =>
  useQuery({ queryKey: adminKeys.allowedDomains, queryFn: listAllowedDomains });

/**
 * Changing the allowlist changes who lands in the approval queue from now on,
 * so both lists go stale — but it never touches accounts that already exist,
 * which is why the directory does not.
 */
function useDomainMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.allowedDomains });
      queryClient.invalidateQueries({ queryKey: adminKeys.audit });
    },
  });
}

export const useAddAllowedDomain = () =>
  useDomainMutation(({ domain }) => addAllowedDomain(domain));

export const useRemoveAllowedDomain = () =>
  useDomainMutation(({ domain }) => removeAllowedDomain(domain));
