import { useQuery } from '@tanstack/react-query';
import { courseRoster } from '../api/roster';

export const rosterKeys = { course: (id) => ['roster', id] };

export const useCourseRoster = (courseId) =>
  useQuery({
    queryKey: rosterKeys.course(courseId),
    queryFn: () => courseRoster(courseId),
    enabled: Boolean(courseId),
  });
