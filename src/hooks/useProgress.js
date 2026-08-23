import { useQuery } from '@tanstack/react-query';
import { myQuizResults, completedActivityCount } from '../api/progress';

export const progressKeys = {
  quizResults: ['progress', 'quiz-results'],
  // Sorted, because the key is the cache identity: the same set of enrolments
  // arriving in a different order must not be a different cache entry.
  completions: (ids) => ['progress', 'completions', [...ids].sort()],
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
