import { useQuery } from '@tanstack/react-query';
import { myQuizResults, completedActivityCount, myCompletions } from '../api/progress';

export const progressKeys = {
  quizResults: ['progress', 'quiz-results'],
  // Sorted, because the key is the cache identity: the same set of enrolments
  // arriving in a different order must not be a different cache entry.
  completions: (ids) => ['progress', 'completions', [...ids].sort()],
  enrollmentCompletions: (id) => ['progress', 'enrollment-completions', id],
};

export const useMyQuizResults = () =>
  useQuery({ queryKey: progressKeys.quizResults, queryFn: myQuizResults });

/**
 * Held until the enrolment list has arrived. Firing with [] first would cache a
 * zero under a key the real list never uses again, which is harmless, and then
 * flash "0 activities" at a trainee who has done twenty, which is not.
 */
export const useCompletedActivityCount = (enrollmentIds) =>
  useQuery({
    queryKey: progressKeys.completions(enrollmentIds ?? []),
    queryFn: () => completedActivityCount(enrollmentIds),
    enabled: Array.isArray(enrollmentIds),
  });

/**
 * The activity ids finished on one enrolment, for ticks and lock state.
 *
 * Invalidated by useCompleteActivity, so finishing an activity opens the next
 * module on screen rather than after a reload.
 */
export const useMyCompletions = (enrollmentId) =>
  useQuery({
    queryKey: progressKeys.enrollmentCompletions(enrollmentId),
    queryFn: () => myCompletions(enrollmentId),
    enabled: Boolean(enrollmentId),
  });
