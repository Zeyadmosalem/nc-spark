import { requireRole, readJson, jsonResponse, errorResponse, HttpError } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { corsFor, handleOptions } from '../_shared/cors.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Writing quizzes: the quiz itself, its questions, and their answer keys.
 *
 * This is an Edge Function rather than a set of RLS policies because of
 * quiz_answer_keys. That table has no grant and no policy for `authenticated`
 * at all — the M4 migration is explicit that this is the point, so that "a
 * trainee can never read the answers" is enforced by the absence of a grant
 * rather than by remembering to exclude a column from every select for the
 * rest of the project's life. Adding a write policy for trainers would mean
 * adding a grant, and a grant is what that decision was avoiding.
 *
 * So the answer key is only ever touched by service_role, here, after this
 * function has checked that the caller owns the course. A trainer's browser
 * still receives the keys for their own quiz — they are editing them — but it
 * receives them from a function that authorised the read, not from a table
 * anyone can query.
 *
 * Before this existed the product could add a quiz *slot* to a module and
 * nothing else: questions came from `npm run db:seed-quizzes`, so a trainer
 * could build an entire course and not write a single question in it.
 */

type Action = 'get' | 'save-quiz' | 'save-question' | 'delete-question' | 'reorder';

interface Body {
  action?: Action;
  activityId?: string;
  quizId?: string;
  questionId?: string;
  title?: string;
  passMark?: number;
  timeLimitSeconds?: number | null;
  type?: string;
  prompt?: string;
  options?: unknown;
  points?: number;
  answer?: Record<string, unknown>;
  explanation?: string | null;
  order?: string[];
}

const QUESTION_TYPES = ['mcq', 'truefalse', 'paragraph'];

/**
 * The embedded answer key, whichever shape PostgREST chose.
 *
 * It is a to-one relationship today and comes back as an object. Accepting
 * both costs one line and means a future migration that splits the key out
 * into its own id does not silently blank every correct answer in the editor.
 */
function keyOf(embed: unknown): { answer?: unknown; explanation?: string | null } | null {
  if (Array.isArray(embed)) return embed[0] ?? null;
  return (embed as { answer?: unknown } | null) ?? null;
}

/**
 * Course ownership, from the quiz.
 *
 * Every action funnels through this. `is_trainer_of` exists as a SQL helper,
 * but it reads auth.uid(), and this function runs as service_role where that
 * is null — the check has to be made against the actor's profile explicitly.
 */
async function quizForActor(
  service: SupabaseClient,
  quizId: string,
  actor: { id: string; role: string },
) {
  const { data: quiz, error } = await service
    .from('quizzes')
    .select('id, course_id, activity_id, title, pass_mark, time_limit_seconds')
    .eq('id', quizId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!quiz) throw new HttpError(404, 'Quiz not found');

  const { data: course, error: cErr } = await service
    .from('courses').select('id, trainer_id').eq('id', quiz.course_id).single();
  if (cErr) throw new HttpError(500, cErr.message);
  if (actor.role !== 'admin' && course.trainer_id !== actor.id) {
    throw new HttpError(403, 'Not your course');
  }
  return quiz;
}

/**
 * Checks a question against the shape the grader in submit-quiz reads.
 *
 * `mcq_needs_options` is the only part of this the database enforces. Nothing
 * stops an answer key of {index: 7} against three options, and the failure
 * mode is silent: submit-quiz compares `given.index === key.index`, so every
 * trainee gets that question wrong forever with no indication why.
 */
function validateQuestion(body: Body) {
  const type = String(body.type ?? '');
  if (!QUESTION_TYPES.includes(type)) {
    throw new HttpError(400, `type must be one of ${QUESTION_TYPES.join(', ')}`);
  }

  const prompt = String(body.prompt ?? '').trim();
  if (!prompt) throw new HttpError(400, 'A question needs a prompt');

  const points = body.points ?? 1;
  if (!Number.isInteger(points) || points < 1) {
    throw new HttpError(400, 'points must be a whole number of at least 1');
  }

  const answer = body.answer ?? {};

  if (type === 'mcq') {
    const raw = Array.isArray(body.options) ? body.options : [];
    const options = raw.map((o) => String(o ?? '').trim());
    if (options.length < 2) throw new HttpError(400, 'A multiple-choice question needs at least two options');
    if (options.some((o) => o === '')) throw new HttpError(400, 'Every option needs some text');
    // Two identical options make one of them unpickable-by-intent: whichever
    // the trainee meant, the grader compares indexes and half of them are
    // marked wrong for choosing the right words.
    const seen = new Set(options.map((o) => o.toLowerCase()));
    if (seen.size !== options.length) throw new HttpError(400, 'Two options are the same');

    const index = answer.index;
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= options.length) {
      throw new HttpError(400, 'Mark which option is the correct one');
    }
    return { type, prompt, points, options, answer: { index } };
  }

  if (type === 'truefalse') {
    if (typeof answer.value !== 'boolean') {
      throw new HttpError(400, 'Mark whether the statement is true or false');
    }
    // Options are for mcq only, and quiz_questions defaults them to []. A
    // true/false question that carried leftover options from a type change
    // would render two answer widgets to the trainee.
    return { type, prompt, points, options: [], answer: { value: answer.value } };
  }

  // paragraph. Guidance is what a trainer reads while marking, in grade-paragraph;
  // it is never shown to a trainee, and an empty one is a choice, not an error.
  return {
    type, prompt, points, options: [],
    answer: { guidance: String(answer.guidance ?? '') },
  };
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  const cors = corsFor(req);
  try {
    const { profile: actor, service } = await requireRole(req, ['admin', 'trainer']);
    const body = await readJson(req) as Body;
    const action = body.action;

    /* ------------------------------------------------------------ get ---- */
    if (action === 'get') {
      const { activityId, quizId } = body;
      if (!activityId && !quizId) {
        throw new HttpError(400, 'activityId or quizId is required');
      }

      const lookup = service
        .from('quizzes')
        .select('id, course_id, activity_id, title, pass_mark, time_limit_seconds');
      const { data: quiz, error } = await (quizId
        ? lookup.eq('id', quizId)
        : lookup.eq('activity_id', activityId)).maybeSingle();
      if (error) throw new HttpError(500, error.message);

      // Not an error. A quiz activity exists before its quiz does, and the
      // editor's first job is to offer to create one.
      if (!quiz) return jsonResponse({ ok: true, quiz: null, questions: [] }, cors);

      await quizForActor(service, quiz.id, actor);

      const { data: questions, error: qErr } = await service
        .from('quiz_questions')
        .select('id, type, position, prompt, options, points, quiz_answer_keys(answer, explanation)')
        .eq('quiz_id', quiz.id)
        .order('position');
      if (qErr) throw new HttpError(500, qErr.message);

      return jsonResponse({
        ok: true,
        quiz,
        questions: (questions ?? []).map((q) => ({
          id: q.id,
          type: q.type,
          position: q.position,
          prompt: q.prompt,
          options: q.options ?? [],
          points: q.points,
          // PostgREST decides array-or-object from the relationship, and this
          // one is to-ONE: question_id is quiz_answer_keys' primary key as
          // well as its foreign key, so the embed arrives as a bare object.
          // Indexing it as an array gave every question a null answer key and
          // every editor a blank correct answer — silently, because null is
          // also what "not authored yet" looks like.
          answer: keyOf(q.quiz_answer_keys)?.answer ?? null,
          explanation: keyOf(q.quiz_answer_keys)?.explanation ?? null,
        })),
      }, cors);
    }

    /* ------------------------------------------------------ save-quiz ---- */
    if (action === 'save-quiz') {
      const title = String(body.title ?? '').trim();
      if (!title) throw new HttpError(400, 'A quiz needs a title');

      const passMark = body.passMark ?? 0.7;
      if (typeof passMark !== 'number' || passMark <= 0 || passMark > 1) {
        throw new HttpError(400, 'The pass mark must be between 1% and 100%');
      }
      const limit = body.timeLimitSeconds ?? null;
      if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
        throw new HttpError(400, 'A time limit must be a whole number of seconds');
      }

      const patch = { title, pass_mark: passMark, time_limit_seconds: limit };

      if (body.quizId) {
        const existing = await quizForActor(service, body.quizId, actor);
        const { data, error } = await service
          .from('quizzes').update(patch).eq('id', existing.id)
          .select('id, course_id, activity_id, title, pass_mark, time_limit_seconds').single();
        if (error) throw new HttpError(500, error.message);
        await writeAudit(service, {
          actor, action: 'quiz.updated', entityType: 'quiz', entityId: existing.id,
          before: existing, after: data,
        });
        return jsonResponse({ ok: true, quiz: data }, cors);
      }

      // Creating one. It has to hang off a quiz activity: a course final has
      // no activity, and quizzes_one_final_per_course would let a trainer
      // create a second course-wide quiz by accident from this screen.
      const activityId = body.activityId;
      if (!activityId) throw new HttpError(400, 'activityId is required to create a quiz');

      const { data: activity, error: aErr } = await service
        .from('activities')
        .select('id, type, modules!inner(course_id, courses!inner(trainer_id))')
        .eq('id', activityId).maybeSingle();
      if (aErr) throw new HttpError(500, aErr.message);
      if (!activity) throw new HttpError(404, 'Activity not found');
      if (activity.type !== 'quiz') {
        throw new HttpError(400, 'That activity is not a quiz');
      }
      const courseId = activity.modules.course_id;
      if (actor.role !== 'admin' && activity.modules.courses.trainer_id !== actor.id) {
        throw new HttpError(403, 'Not your course');
      }

      const { data, error } = await service.from('quizzes')
        .insert({ course_id: courseId, activity_id: activityId, ...patch })
        .select('id, course_id, activity_id, title, pass_mark, time_limit_seconds').single();
      // activity_id is UNIQUE. Two clicks on Create is the ordinary way to hit
      // this, and it is not a failure the trainer needs to hear about.
      if (error) {
        if (/duplicate key|unique/i.test(error.message)) {
          const { data: already } = await service.from('quizzes')
            .select('id, course_id, activity_id, title, pass_mark, time_limit_seconds')
            .eq('activity_id', activityId).single();
          return jsonResponse({ ok: true, quiz: already, unchanged: true }, cors);
        }
        throw new HttpError(500, error.message);
      }

      await writeAudit(service, {
        actor, action: 'quiz.created', entityType: 'quiz', entityId: data.id,
        after: { courseId, activityId, title },
      });
      return jsonResponse({ ok: true, quiz: data }, cors);
    }

    /* -------------------------------------------------- save-question ---- */
    if (action === 'save-question') {
      const clean = validateQuestion(body);

      let quizId = body.quizId;
      let before = null;

      if (body.questionId) {
        const { data: existing, error } = await service
          .from('quiz_questions')
          .select('id, quiz_id, type, position, prompt, options, points')
          .eq('id', body.questionId).maybeSingle();
        if (error) throw new HttpError(500, error.message);
        if (!existing) throw new HttpError(404, 'Question not found');
        quizId = existing.quiz_id;
        before = existing;
      }
      if (!quizId) throw new HttpError(400, 'quizId is required');
      await quizForActor(service, quizId, actor);

      let questionId = body.questionId;

      if (questionId) {
        const { error } = await service.from('quiz_questions')
          .update({
            type: clean.type, prompt: clean.prompt,
            options: clean.options, points: clean.points,
          })
          .eq('id', questionId);
        if (error) throw new HttpError(500, error.message);
      } else {
        // position is UNIQUE per quiz and nothing assigns it. Two questions
        // added in quick succession would otherwise collide, so the insert is
        // retried against a freshly read maximum rather than failing.
        for (let attempt = 0; ; attempt += 1) {
          const { data: last } = await service
            .from('quiz_questions').select('position')
            .eq('quiz_id', quizId).order('position', { ascending: false }).limit(1).maybeSingle();
          const position = (last?.position ?? 0) + 1;

          const { data, error } = await service.from('quiz_questions')
            .insert({
              quiz_id: quizId, type: clean.type, position,
              prompt: clean.prompt, options: clean.options, points: clean.points,
            })
            .select('id').single();
          if (!error) { questionId = data.id; break; }
          if (attempt >= 3 || !/duplicate key|unique/i.test(error.message)) {
            throw new HttpError(500, error.message);
          }
        }
      }

      // The key goes in its own table, and a question without one is a
      // question submit-quiz marks wrong for everybody. Upsert rather than
      // insert so a type change replaces the old shape.
      const { error: keyErr } = await service.from('quiz_answer_keys').upsert({
        question_id: questionId,
        answer: clean.answer,
        explanation: body.explanation?.trim() || null,
      }, { onConflict: 'question_id' });
      if (keyErr) throw new HttpError(500, keyErr.message);

      await writeAudit(service, {
        actor,
        action: before ? 'quiz.question_updated' : 'quiz.question_added',
        entityType: 'quiz_question',
        entityId: questionId!,
        before,
        // The answer key is deliberately absent. The audit log is readable by
        // every admin, and an append-only record of the right answers is a
        // copy of the thing this whole design keeps out of reach.
        after: { quizId, type: clean.type, prompt: clean.prompt, points: clean.points },
      });

      return jsonResponse({ ok: true, questionId }, cors);
    }

    /* ------------------------------------------------ delete-question ---- */
    if (action === 'delete-question') {
      const { questionId } = body;
      if (!questionId) throw new HttpError(400, 'questionId is required');

      const { data: existing, error } = await service
        .from('quiz_questions').select('id, quiz_id, prompt').eq('id', questionId).maybeSingle();
      if (error) throw new HttpError(500, error.message);
      if (!existing) throw new HttpError(404, 'Question not found');
      await quizForActor(service, existing.quiz_id, actor);

      // quiz_answers references question_id, so a question answered in a past
      // attempt cannot be deleted without taking that history with it. Saying
      // so beats a foreign-key error naming a constraint.
      const { count } = await service
        .from('quiz_answers').select('question_id', { count: 'exact', head: true })
        .eq('question_id', questionId);
      if ((count ?? 0) > 0) {
        throw new HttpError(409,
          `${count} trainee${count === 1 ? ' has' : 's have'} already answered this question. `
          + 'Edit it instead, or it would take their results with it.');
      }

      const { error: delErr } = await service
        .from('quiz_questions').delete().eq('id', questionId);
      if (delErr) throw new HttpError(500, delErr.message);

      await writeAudit(service, {
        actor, action: 'quiz.question_removed', entityType: 'quiz_question',
        entityId: questionId, before: existing,
      });
      return jsonResponse({ ok: true }, cors);
    }

    /* ----------------------------------------------------- reorder ------- */
    if (action === 'reorder') {
      const { quizId, order } = body;
      if (!quizId || !Array.isArray(order) || order.length === 0) {
        throw new HttpError(400, 'quizId and an order array are required');
      }
      await quizForActor(service, quizId, actor);

      const { data: existing, error } = await service
        .from('quiz_questions').select('id').eq('quiz_id', quizId);
      if (error) throw new HttpError(500, error.message);

      const ids = new Set((existing ?? []).map((q) => q.id));
      if (order.length !== ids.size || order.some((id) => !ids.has(id))) {
        throw new HttpError(400, 'The order must list every question in this quiz exactly once');
      }

      // Two passes. `unique (quiz_id, position)` means moving question 2 to
      // position 1 collides with question 1 before question 1 has moved, so
      // everything is parked above the range first. The check is position > 0,
      // so the park has to be high rather than negative.
      for (let i = 0; i < order.length; i += 1) {
        const { error: parkErr } = await service.from('quiz_questions')
          .update({ position: 100000 + i }).eq('id', order[i]);
        if (parkErr) throw new HttpError(500, parkErr.message);
      }
      for (let i = 0; i < order.length; i += 1) {
        const { error: setErr } = await service.from('quiz_questions')
          .update({ position: i + 1 }).eq('id', order[i]);
        if (setErr) throw new HttpError(500, setErr.message);
      }

      return jsonResponse({ ok: true }, cors);
    }

    throw new HttpError(400,
      'action must be get, save-quiz, save-question, delete-question or reorder');
  } catch (err) {
    return errorResponse(err, cors);
  }
});
