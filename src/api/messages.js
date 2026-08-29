import { requireClient } from './client';
import { unwrap, currentUserId } from './helpers';

const MESSAGE_COLUMNS = 'id, course_id, user_id, body, created_at, public_profiles!messages_user_id_fkey(id, name, avatar, role)';

export function messageToCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    courseId: row.course_id,
    userId: row.user_id,
    senderName: row.public_profiles?.name ?? 'Unknown user',
    senderAvatar: row.public_profiles?.avatar ?? null,
    senderRole: row.public_profiles?.role ?? null,
    body: row.body,
    createdAt: row.created_at,
  };
}

/**
 * How many messages one read returns.
 *
 * The query used to be unbounded: every message a course had ever produced,
 * on every open of the tab. That is fine for a thread with twelve messages in
 * it and is the kind of thing that only becomes a problem once the product is
 * being used, which is the worst time to find it.
 */
export const MESSAGE_PAGE_SIZE = 50;

/**
 * The most recent messages on a course, oldest first.
 *
 * Read newest-first so the LIMIT keeps the recent end of the conversation
 * rather than its beginning, then reversed for display. `before` takes the
 * createdAt of the oldest message on screen and returns the page behind it.
 */
export async function listCourseMessages(
  courseId, { limit = MESSAGE_PAGE_SIZE, before = null } = {},
) {
  let query = requireClient()
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);

  const rows = unwrap(await query);
  return (rows ?? []).map(messageToCamel).reverse();
}

/**
 * The longest message the column accepts: `check (length(body) <= 4000)`.
 *
 * Exported so the input that collects the text and the guard that rejects it
 * cannot drift apart. Without the guard the row reached the database and came
 * back as `new row for relation "messages" violates check constraint ...`,
 * which names the constraint rather than telling the person what to do.
 */
export const MAX_MESSAGE_LENGTH = 4000;

export async function sendCourseMessage({ courseId, body }) {
  const text = (body ?? '').trim();
  if (!text) throw new Error('A message cannot be empty.');
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new Error(
      `A message cannot be longer than ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const userId = await currentUserId();
  const row = unwrap(await requireClient()
    .from('messages')
    .insert({ course_id: courseId, user_id: userId, body: text })
    .select(MESSAGE_COLUMNS)
    .single());

  return messageToCamel(row);
}
