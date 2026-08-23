import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listCourses, getCourseOutline, createCourse, updateCourse, deleteCourse, publishCourse,
} from '../api/courses';
import { myEnrollments, applyForCourse } from '../api/enrollments';

export const courseKeys = {
  all: ['courses'],
  outline: (id) => ['courses', 'outline', id],
  myEnrollments: ['enrollments', 'mine'],
};

export function useCourses() {
  return useQuery({ queryKey: courseKeys.all, queryFn: listCourses });
}

export function useCourseOutline(id) {
  return useQuery({
    queryKey: courseKeys.outline(id),
    queryFn: () => getCourseOutline(id),
    enabled: Boolean(id),
  });
}

export function useMyEnrollments() {
  return useQuery({ queryKey: courseKeys.myEnrollments, queryFn: myEnrollments });
}

export function useApplyForCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (courseId) => applyForCourse(courseId),
    // The catalog renders an "applied" state from the enrollment list, so both
    // queries go stale together.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: courseKeys.myEnrollments });
      queryClient.invalidateQueries({ queryKey: courseKeys.all });
    },
  });
}

/**
 * Curriculum writes. Every one of them changes what the catalog shows, so they
 * all invalidate the same list; publishing also changes who can see the course
 * at all, since courses_select_published is what puts it in front of trainees.
 *
 * Each mutationFn unpacks its variables rather than being passed by reference:
 * TanStack calls it as fn(variables, context), and an api function taking
 * positional arguments would receive a QueryClient as its second one.
 */
function invalidateCatalog(queryClient) {
  queryClient.invalidateQueries({ queryKey: courseKeys.all });
  queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
}

export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fields) => createCourse(fields),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useUpdateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }) => updateCourse(id, patch),
    onSuccess: (_data, { id }) => {
      invalidateCatalog(queryClient);
      queryClient.invalidateQueries({ queryKey: courseKeys.outline(id) });
    },
  });
}

export function useDeleteCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => deleteCourse(id),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function usePublishCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, publish }) => publishCourse(courseId, publish),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}
