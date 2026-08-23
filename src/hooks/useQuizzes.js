import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getQuiz, quizForActivity, myAttempt, startQuiz, submitQuiz } from '../api/quizzes';
import { courseKeys } from './useCourses';

export const quizKeys = {
  one: (quizId) => ['quizzes', 'one', quizId],
  forActivity: (activityId) => ['quizzes', 'forActivity', activityId],
  attempt: (quizId) => ['quizzes', 'attempt', quizId],
};

export function useQuiz(quizId) {
  return useQuery({
    queryKey: quizKeys.one(quizId),
    queryFn: () => getQuiz(quizId),
    enabled: Boolean(quizId),
  });
}

export function useQuizForActivity(activityId) {
  return useQuery({
    queryKey: quizKeys.forActivity(activityId),
    queryFn: () => quizForActivity(activityId),
    enabled: Boolean(activityId),
  });
}

export function useMyAttempt(quizId) {
  return useQuery({
    queryKey: quizKeys.attempt(quizId),
    queryFn: () => myAttempt(quizId),
    enabled: Boolean(quizId),
  });
}

/**
 * Opens or resumes an attempt. Not a query: it has a side effect on the
 * server — it can spend a retake grant — so it must never be re-run by a
 * refetch, a window focus, or a retry.
 */
export function useStartQuiz() {
  return useMutation({ mutationFn: (quizId) => startQuiz(quizId) });
}

export function useSubmitQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ attemptId, answers }) => submitQuiz(attemptId, answers),
    // Passing completes an activity, which can unlock the next module, so the
    // enrollment list and every outline go stale — the same reasoning as
    // useCompleteActivity. The attempt itself is stale too: it has just moved
    // from in_progress to a graded state.
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: courseKeys.myEnrollments });
      queryClient.invalidateQueries({ queryKey: ['courses', 'outline'] });
      if (variables?.quizId) {
        queryClient.invalidateQueries({ queryKey: quizKeys.attempt(variables.quizId) });
      }
    },
  });
}
