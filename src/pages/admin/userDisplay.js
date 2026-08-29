/**
 * Labels the user directory and its rows both need.
 *
 * Split out when UserManager was broken up (B20): SignupCard and UserRow are
 * their own files now, and three of these four were being used by all of them.
 */

/** The roles an administrator may assign. Mirrors the user_role enum. */
export const ROLES = ['trainee', 'trainer', 'supervisor', 'admin'];

export const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const displayName = (user) => user.name || 'Unnamed';

/** How long somebody has been waiting on a human. */
export function waitedFor(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}
