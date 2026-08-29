import { useQuery } from '@tanstack/react-query';
import { badgeCatalog, myBadges, courseLeaderboard } from '../api/badges';

export const badgeKeys = {
  catalog: ['badges', 'catalog'],
  mine: ['badges', 'mine'],
  leaderboard: (courseId) => ['badges', 'leaderboard', courseId],
};

/** The catalog changes about never, so it is worth holding on to. */
export function useBadgeCatalog() {
  return useQuery({
    queryKey: badgeKeys.catalog,
    queryFn: badgeCatalog,
    staleTime: 60 * 60 * 1000,
  });
}

export function useMyBadges() {
  return useQuery({ queryKey: badgeKeys.mine, queryFn: myBadges });
}

export function useCourseLeaderboard(courseId) {
  return useQuery({
    queryKey: badgeKeys.leaderboard(courseId),
    queryFn: () => courseLeaderboard(courseId),
    enabled: Boolean(courseId),
  });
}
