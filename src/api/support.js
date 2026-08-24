import { requireClient } from './client';
import { unwrap, currentUserId, invokeFn } from './helpers';

/**
 * Support threads.
 *
 * /trainee/support was the last screen in the product that lied. It rendered a
 * name, an email and a message box, and its submit handler was
 * `alert('Support request submitted! (prototype only)')` — so somebody blocked
 * on a course could fill it in, read a confirmation and wait for an answer
 * that was never coming.
 *
 * Requests are plain RLS: one is filed as yourself (`author_id = auth.uid()`
 * in the WITH CHECK), and what a trainer can reach is decided by policy — a
 * request carrying a course_id is visible to whoever teaches that course, and
 * one without goes to administrators only.
 *
 * MESSAGE BODIES are different. They are encrypted with a per-thread data key,
 * itself wrapped with a master key that lives in the support-messages function's
 * secrets and never touches the database. So a stolen database dump holds no
 * readable message text — and reading one back means asking the function,
 * because nothing else can decrypt it.
 *
 * It is not end-to-end encryption and does not claim to be. The server can
 * decrypt by design, because requests route to a ROLE that changes hands, there
 * is no native client to hold a key safely, and these threads are business
 * records an administrator has to be able to recover. See
 * supabase/migrations/20260827000100_support_encryption.sql for the full
 * reasoning and the honest limit.
 */

/*
 * public_profiles, not profiles.
 *
 * A trainee cannot read their trainer's profile row — no policy grants it, and
 * none should, because that table carries the email. So the ordinary FK embed
 * came back null and every staff reply in a thread was attributed to
 * "Unknown", which makes a support conversation close to useless.
 *
 * public_profiles is the view built for exactly this: id, name, avatar and
 * role for active accounts, with no contact details and no status history. It
 * has existed since M1 and nothing had ever selected from it. PostgREST
 * resolves it to its base table for relationship detection, so it embeds —
 * verified against the live project rather than assumed, because
 * enrollment_progress taught this codebase that some views do not.
 */
const REQUEST_COLUMNS = `
  id, author_id, course_id, subject, status, created_at, updated_at,
  public_profiles!support_requests_author_id_fkey(id, name, avatar, role),
  courses(id, title, icon)
`;

/*
 * public_profiles filters to active accounts, so a suspended author has no
 * row. Saying so is better than "Unknown", which reads like a bug.
 */
const nameOf = (p) => p?.name || 'Deactivated account';

const toCamel = (r, state) => ({
  id: r.id,
  authorId: r.author_id,
  authorName: nameOf(r.public_profiles),
  authorAvatar: r.public_profiles?.avatar ?? null,
  authorRole: r.public_profiles?.role ?? null,
  courseId: r.course_id ?? null,
  courseTitle: r.courses?.title ?? null,
  courseIcon: r.courses?.icon ?? null,
  subject: r.subject,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  messageCount: state?.message_count ?? 0,
  lastMessageAt: state?.last_message_at ?? r.created_at,
  // Messages somebody else wrote since this reader last opened the thread.
  // Per participant: a trainer having read something says nothing about
  // whether the trainee has.
  unreadCount: state?.unread_count ?? 0,
  // null when nobody has posted at all, which cannot happen through this api
  // — the first message is written with the request — but can if a row is
  // inserted by hand.
  awaitingStaff: state?.awaiting_staff ?? true,
  hasReply: state?.has_reply ?? false,
});

/**
 * Every thread the caller can see, newest activity first.
 *
 * One query for the requests and one for the derived state rather than an
 * embed. support_request_state is a grouped view, and this project has already
 * paid once for assuming PostgREST can embed one — My Courses rendered
 * "Could not load your courses" for a milestone because of it.
 */
export async function supportThreads() {
  const client = requireClient();

  const rows = unwrap(await client
    .from('support_requests').select(REQUEST_COLUMNS).order('updated_at', { ascending: false }));

  if ((rows ?? []).length === 0) return [];

  const state = unwrap(await client
    .from('support_inbox')
    .select('request_id, message_count, last_message_at, has_reply, awaiting_staff, unread_count')
    .in('request_id', rows.map((r) => r.id)));

  const byId = new Map((state ?? []).map((s) => [s.request_id, s]));
  return rows.map((r) => toCamel(r, byId.get(r.id)));
}

/**
 * The messages on one thread, oldest first — the order it was written in.
 *
 * Through the function, because the bodies are ciphertext and only it holds
 * the key. It re-checks visibility on the caller's behalf: it runs as
 * service_role, which bypasses RLS, so the policy that would have protected a
 * direct read does not apply to it.
 */
export async function supportMessages(requestId) {
  if (!requestId) return [];
  const { messages } = await invokeFn('support-messages', { action: 'list', requestId });

  return (messages ?? []).map((m) => ({
    id: m.id,
    requestId: m.request_id,
    authorId: m.author_id,
    authorName: nameOf(m.author),
    authorAvatar: m.author?.avatar ?? null,
    authorRole: m.author?.role ?? null,
    body: m.body,
    createdAt: m.created_at,
  }));
}

/**
 * Files a request and its opening message.
 *
 * Two inserts, and the second can fail on its own — a thread with a subject
 * and no message is a support request nobody can answer. The request row is
 * deleted if the message does not land, so a half-written thread never appears
 * in anybody's queue. The author owns the row, so this cleanup is allowed.
 */
export async function createSupportRequest({ subject, body, courseId = null }) {
  const client = requireClient();
  const authorId = await currentUserId();

  const request = unwrap(await client
    .from('support_requests')
    .insert({ author_id: authorId, course_id: courseId, subject: subject.trim() })
    .select(REQUEST_COLUMNS)
    .single());

  try {
    // Through the function, so the opening message is encrypted like every
    // other one. A first message written in the clear would defeat the whole
    // arrangement for the message most likely to describe the problem.
    await invokeFn('support-messages', {
      action: 'send', requestId: request.id, body: body.trim(),
    });
  } catch (err) {
    await client.from('support_requests').delete().eq('id', request.id);
    throw err;
  }

  return toCamel(request, {
    message_count: 1, awaiting_staff: true, has_reply: false, unread_count: 0,
  });
}

export async function replyToSupportRequest({ requestId, body }) {
  await invokeFn('support-messages', { action: 'send', requestId, body: body.trim() });
}

/**
 * Marks a thread read up to now, for this reader only.
 *
 * Fire-and-forget from the caller's point of view: failing to record that
 * somebody opened a thread is not worth an error message on top of the thread
 * they are already reading.
 */
export async function markSupportRead(requestId) {
  await invokeFn('support-messages', { action: 'mark-read', requestId });
}

/**
 * Closes or reopens a thread.
 *
 * support_messages_insert refuses a message on a closed thread, so this is
 * what reopening means: it is not cosmetic, and a reply to something everybody
 * has stopped watching would otherwise go unread.
 */
export async function setSupportStatus({ requestId, status }) {
  unwrap(await requireClient()
    .from('support_requests').update({ status }).eq('id', requestId));
}
