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

export async function listCourseMessages(courseId) {
  const rows = unwrap(await requireClient()
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('course_id', courseId)
    .order('created_at', { ascending: true }));

  return (rows ?? []).map(messageToCamel);
}

export async function sendCourseMessage({ courseId, body }) {
  const userId = await currentUserId();
  const row = unwrap(await requireClient()
    .from('messages')
    .insert({ course_id: courseId, user_id: userId, body: body.trim() })
    .select(MESSAGE_COLUMNS)
    .single());

  return messageToCamel(row);
}
