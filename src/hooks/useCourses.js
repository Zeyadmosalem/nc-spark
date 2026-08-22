import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listCourses, getCourseOutline } from '../api/courses';
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
