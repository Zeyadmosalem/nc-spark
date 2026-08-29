import { formatDate } from '../../lib/format';

/**
 * Wording the inbox, a row and a thread all need.
 *
 * Split out when SupportInbox was broken up (B20). Three files read these now,
 * and three copies of `when` would be three answers to "how long ago".
 */

export const ROLE_LABEL = {
  trainee: 'Trainee', trainer: 'Trainer', supervisor: 'Supervisor', admin: 'Administrator',
};

/**
 * How long ago, at the resolution a person cares about.
 *
 * Minutes for the last hour, then hours, then days for the last week, then an
 * actual date — because "217h ago" is not something anybody reads.
 */
export const when = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return formatDate(iso, { year: false });
};
