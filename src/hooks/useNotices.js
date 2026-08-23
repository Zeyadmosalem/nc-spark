import { useQuery } from '@tanstack/react-query';
import { myNotices } from '../api/notices';

export const noticeKeys = { mine: ['notices', 'mine'] };

export function useMyNotices() {
  return useQuery({
    queryKey: noticeKeys.mine,
    queryFn: myNotices,
    // A trainer grading a paragraph or granting a retake happens while the
    // trainee is sitting on the page, so this refetches on focus rather than
    // waiting for a reload. Not realtime, but it costs one small query.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
