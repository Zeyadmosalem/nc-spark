import { requireClient } from './client';
import { unwrap, currentUserId } from './helpers';

/**
 * Support threads.
 *
 * /trainee/support was the last screen in the product that lied. It rendered a
 * name, an email and a message box, and its submit handler was
 * `alert('Support request submitted! (prototype only)')` — so somebody blocked
 * on a course could fill it in, read a confirmation and wait for an answer
 * that was never coming.
 *
 * Everything here is plain RLS, no Edge Function. There is no privileged write
 * to make: a request is filed as yourself (`author_id = auth.uid()` in the
 * WITH CHECK), and a reply is only accepted on a thread you can already see.
 * The one thing worth stating is what a trainer can reach — a request carrying
 * a course_id is visible to whoever teaches that course, and one without goes
 * to administrators only.
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
    .from('support_request_state')
    .select('request_id, message_count, last_message_at, has_reply, awaiting_staff')
    .in('request_id', rows.map((r) => r.id)));

  const byId = new Map((state ?? []).map((s) => [s.request_id, s]));
  return rows.map((r) => toCamel(r, byId.get(r.id)));
}

/** The messages on one thread, oldest first — the order it was written in. */
export async function supportMessages(requestId) {
  if (!requestId) return [];
  const rows = unwrap(await requireClient()
    .from('support_messages')
    .select('id, request_id, author_id, body, created_at, public_profiles(id, name, avatar, role)')
    .eq('request_id', requestId)
    .order('created_at'));

  return (rows ?? []).map((m) => ({
    id: m.id,
    requestId: m.request_id,
    authorId: m.author_id,
    authorName: nameOf(m.public_profiles),
    authorAvatar: m.public_profiles?.avatar ?? null,
    authorRole: m.public_profiles?.role ?? null,
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
    unwrap(await client
      .from('support_messages')
      .insert({ request_id: request.id, author_id: authorId, body: body.trim() }));
  } catch (err) {
    await client.from('support_requests').delete().eq('id', request.id);
    throw err;
  }

  return toCamel(request, { message_count: 1, awaiting_staff: true, has_reply: false });
}

export async function replyToSupportRequest({ requestId, body }) {
  const authorId = await currentUserId();
  unwrap(await requireClient()
    .from('support_messages')
    .insert({ request_id: requestId, author_id: authorId, body: body.trim() }));
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
