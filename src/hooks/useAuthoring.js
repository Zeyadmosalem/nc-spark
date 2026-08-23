import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCourseForEditing,
  createModule, updateModule, deleteModule,
  createActivity, updateActivity, deleteActivity,
} from '../api/authoring';
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'content-counts'] });
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
