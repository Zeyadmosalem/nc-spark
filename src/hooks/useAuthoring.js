import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCourseForEditing,
  createModule, updateModule, deleteModule,
  createActivity, updateActivity, deleteActivity,
} from '../api/authoring';
import {
  quizForAuthoring, saveQuiz, saveQuizQuestion, deleteQuizQuestion,
  reorderQuizQuestions,
} from '../api/quizzes';
import { courseKeys } from './useCourses';

export const editorKeys = { course: (id) => ['authoring', 'course', id] };

export const useCourseForEditing = (courseId) =>
  useQuery({
    queryKey: editorKeys.course(courseId),
    queryFn: () => getCourseForEditing(courseId),
    enabled: Boolean(courseId),
  });

/**
 * Every authoring write changes the same three things: the course outline the
 * builder renders, the admin content counts that decide whether Publish is
 * offered, and the catalog, because a course with no activities cannot be
 * published and one with activities can.
 *
 * courseId is threaded through the variables rather than captured, so one hook
 * instance works for any course on the page.
 */
function useAuthoringMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_data, variables) => {
      if (variables?.courseId) {
        queryClient.invalidateQueries({ queryKey: editorKeys.course(variables.courseId) });
        queryClient.invalidateQueries({ queryKey: courseKeys.outline(variables.courseId) });
      }
      queryClient.invalidateQueries({ queryKey: courseKeys.contentCounts });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });
}

export const useCreateModule = () =>
  useAuthoringMutation(({ courseId, title, position, unlockAfterModuleId }) =>
    createModule({ courseId, title, position, unlockAfterModuleId }));

export const useUpdateModule = () =>
  useAuthoringMutation(({ id, title, unlockAfterModuleId }) =>
    updateModule(id, { title, unlockAfterModuleId }));

export const useDeleteModule = () =>
  useAuthoringMutation(({ id }) => deleteModule(id));

export const useCreateActivity = () =>
  useAuthoringMutation(({ moduleId, type, title, position, xp, content }) =>
    createActivity({ moduleId, type, title, position, xp, content }));

export const useUpdateActivity = () =>
  useAuthoringMutation(({ id, title, xp, content }) =>
    updateActivity(id, { title, xp, content }));

export const useDeleteActivity = () =>
  useAuthoringMutation(({ id }) => deleteActivity(id));

/* --------------------------------------------------------------- quizzes */

export const quizEditorKeys = {
  forActivity: (activityId) => ['authoring', 'quiz', activityId],
};

export const useQuizForAuthoring = (activityId) =>
  useQuery({
    queryKey: quizEditorKeys.forActivity(activityId),
    queryFn: () => quizForAuthoring(activityId),
    enabled: Boolean(activityId),
  });

/**
 * activityId, not quizId, is what everything here invalidates on.
 *
 * The editor is opened from an activity and may not have a quiz yet, so the
 * activity is the only identifier that exists for the whole lifetime of the
 * screen — including the moment the quiz is created, which is exactly when the
 * cache most needs to be refetched.
 *
 * The course outline goes too: publish-course refuses a course whose quiz has
 * no questions, so adding the first one changes whether Publish is offered.
 */
function useQuizMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_data, variables) => {
      if (variables?.activityId) {
        queryClient.invalidateQueries({
          queryKey: quizEditorKeys.forActivity(variables.activityId),
        });
      }
      if (variables?.courseId) {
        queryClient.invalidateQueries({ queryKey: editorKeys.course(variables.courseId) });
      }
      queryClient.invalidateQueries({ queryKey: courseKeys.contentCounts });
    },
  });
}

export const useSaveQuiz = () =>
  useQuizMutation(({ quizId, activityId, title, passMark, timeLimitSeconds }) =>
    saveQuiz({ quizId, activityId, title, passMark, timeLimitSeconds }));

export const useSaveQuizQuestion = () =>
  useQuizMutation(({ quizId, questionId, type, prompt, options, points, answer, explanation }) =>
    saveQuizQuestion({ quizId, questionId, type, prompt, options, points, answer, explanation }));

export const useDeleteQuizQuestion = () =>
  useQuizMutation(({ questionId }) => deleteQuizQuestion(questionId));

export const useReorderQuizQuestions = () =>
  useQuizMutation(({ quizId, order }) => reorderQuizQuestions(quizId, order));
