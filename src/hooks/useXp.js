import { useQuery } from '@tanstack/react-query';
import { myStats, myXpEvents, courseStandings } from '../api/xp';

export const xpKeys = {
  stats: ['xp', 'stats'],
  events: (limit) => ['xp', 'events', limit],
  standings: (courseId) => ['xp', 'standings', courseId],
};

export function useMyXp() {
  return useQuery({ queryKey: xpKeys.stats, queryFn: myStats });
}

export function useMyXpEvents(limit = 50) {
  return useQuery({ queryKey: xpKeys.events(limit), queryFn: () => myXpEvents(limit) });
}

export function useCourseStandings(courseId) {
  return useQuery({
    queryKey: xpKeys.standings(courseId),
    queryFn: () => courseStandings(courseId),
    enabled: Boolean(courseId),
  });
}
