import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import QueryError from '../shared/QueryError';
import Alert from '../ui/Alert';
import EmptyState from '../ui/EmptyState';
import { SkeletonList } from '../ui/Skeleton';
import { useToast } from '../ui/toast-context';
import {
  useQuizForAuthoring, useSaveQuiz, useSaveQuizQuestion,
  useDeleteQuizQuestion, useReorderQuizQuestions,
} from '../../hooks/useAuthoring';
import { questionProblem } from '../../api/quizzes';

/**
 * Writing the questions in a quiz.
 *
 * The builder could add a quiz *slot* to a module and nothing else. Questions
 * came from `npm run db:seed-quizzes`, so a trainer could build an entire
 * course and not write one — and a quiz activity with no quiz behind it is a
 * wall, because submit-quiz scores an empty quiz as zero and every pass mark
 * is above zero, leaving the rest of the course locked behind it.
 *
 * Everything here goes through the author-quiz Edge Function. quiz_answer_keys
 * has no grant for any browser role, on purpose, so there is no version of
 * this screen that talks to the table directly.
 */

const TYPE_LABEL = {
  mcq: 'Multiple choice',
  truefalse: 'True or false',
  paragraph: 'Written answer',
};

const TYPE_ICON = { mcq: '🔘', truefalse: '⚖️', paragraph: '✍️' };

const BLANK = {
  type: 'mcq',
  prompt: '',
  options: ['', ''],
  points: 1,
  answer: { index: 0 },
  explanation: '',
};

/** The answer shape each type stores. Changing type has to change the key too. */
const BLANK_ANSWER = {
  mcq: { index: 0 },
  truefalse: { value: true },
  paragraph: { guidance: '' },
};

export default function QuizEditor({ activityId, activityTitle, courseId }) {
  const { notify } = useToast();
  const editor = useQuizForAuthoring(activityId);
  const saveQuiz = useSaveQuiz();

  if (editor.isLoading) return <SkeletonList rows={3} label="Loading the quiz" />;
  if (editor.error) return <QueryError error={editor.error} what="this quiz" />;

  const quiz = editor.data?.quiz ?? null;
  const questions = editor.data?.questions ?? [];

  if (!quiz) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <EmptyState icon="📝" title="No quiz here yet">
          This activity is a quiz with nothing behind it. A trainee opening it
          finds nothing to answer, and the course cannot be published until it
          has questions.
        </EmptyState>
        <div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saveQuiz.isPending}
            onClick={() => saveQuiz.mutate(
              {
                activityId, courseId,
                title: activityTitle || 'Quiz', passMark: 0.7, timeLimitSeconds: null,
              },
              { onSuccess: () => notify('Quiz created. Add its first question.') },
            )}
          >
            {saveQuiz.isPending ? 'Creating…' : 'Create the quiz'}
          </button>
        </div>
        <Alert error={saveQuiz.error} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <QuizSettings quiz={quiz} activityId={activityId} courseId={courseId} />
      <QuestionList
        quiz={quiz}
        questions={questions}
        activityId={activityId}
        courseId={courseId}
      />
    </div>
  );
}

function QuizSettings({ quiz, activityId, courseId }) {
  const { notify } = useToast();
  const save = useSaveQuiz();
  const [title, setTitle] = useState(quiz.title);
  const [pass, setPass] = useState(String(Math.round(Number(quiz.pass_mark) * 100)));
  // Stored in seconds, entered in minutes — nobody sets a quiz to 900 seconds.
  const [minutes, setMinutes] = useState(
    quiz.time_limit_seconds ? String(Math.round(quiz.time_limit_seconds / 60)) : '');

  const passNum = Number(pass);
  const badPass = pass.trim() === '' || Number.isNaN(passNum) || passNum < 1 || passNum > 100;
  const minsNum = Number(minutes);
  const badMinutes = minutes.trim() !== '' && (Number.isNaN(minsNum) || minsNum < 1);

  const dirty = title !== quiz.title
    || passNum !== Math.round(Number(quiz.pass_mark) * 100)
    || (minutes.trim() === '' ? quiz.time_limit_seconds !== null
      : minsNum * 60 !== quiz.time_limit_seconds);

  return (
    <div className="card no-hover" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <label className="input-label" htmlFor="quiz-title">Quiz title</label>
        <input id="quiz-title" className="input-field" value={title}
               onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div style={{ width: 110 }}>
        <label className="input-label" htmlFor="quiz-pass">Pass mark %</label>
        <input id="quiz-pass" className="input-field" inputMode="numeric" value={pass}
               onChange={(e) => setPass(e.target.value)} />
      </div>
      <div style={{ width: 130 }}>
        <label className="input-label" htmlFor="quiz-time">Time limit (min)</label>
        <input id="quiz-time" className="input-field" inputMode="numeric" placeholder="none"
               value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </div>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={save.isPending || !dirty || !title.trim() || badPass || badMinutes}
        onClick={() => save.mutate(
          {
            quizId: quiz.id, activityId, courseId,
            title: title.trim(),
            passMark: passNum / 100,
            timeLimitSeconds: minutes.trim() === '' ? null : minsNum * 60,
          },
          { onSuccess: () => notify('Quiz settings saved.') },
        )}
      >
        {save.isPending ? 'Saving…' : 'Save settings'}
      </button>
      <div style={{ flexBasis: '100%' }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: 0 }}>
          Leave the time limit empty for no limit. The pass mark is measured
          against the total points below, not the number of questions.
        </p>
        <Alert error={save.error} />
      </div>
    </div>
  );
}

function QuestionList({ quiz, questions, activityId, courseId }) {
  const { notify } = useToast();
  const reorder = useReorderQuizQuestions();
  const [adding, setAdding] = useState(false);

  const totalPoints = questions.reduce((n, q) => n + q.points, 0);
  const needed = Math.ceil(Number(quiz.pass_mark) * totalPoints);

  function move(index, delta) {
    const next = questions.map((q) => q.id);
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate({ quizId: quiz.id, activityId, courseId, order: next });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {questions.length === 0 ? (
        <EmptyState icon="❓" title="No questions yet">
          A quiz with no questions cannot be passed — every pass mark is above
          zero and an empty quiz scores zero. The course will not publish until
          this has at least one.
        </EmptyState>
      ) : (
        <>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', margin: 0 }}>
            {questions.length} question{questions.length === 1 ? '' : 's'} ·{' '}
            {totalPoints} point{totalPoints === 1 ? '' : 's'} · a trainee needs{' '}
            {needed} to pass.
          </p>
          <AnimatePresence initial={false}>
            {questions.map((q, i) => (
              <QuestionRow
                key={q.id}
                question={q}
                index={i}
                last={i === questions.length - 1}
                quiz={quiz}
                activityId={activityId}
                courseId={courseId}
                onMove={(delta) => move(i, delta)}
                reordering={reorder.isPending}
              />
            ))}
          </AnimatePresence>
          <Alert error={reorder.error} />
        </>
      )}

      {adding ? (
        <QuestionForm
          quiz={quiz}
          activityId={activityId}
          courseId={courseId}
          initial={BLANK}
          onSaved={() => { notify('Question added.'); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
                onClick={() => setAdding(true)}>
          + Add a question
        </button>
      )}
    </div>
  );
}

function QuestionRow({ question, index, last, quiz, activityId, courseId, onMove, reordering }) {
  const { notify } = useToast();
  const remove = useDeleteQuizQuestion();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      style={{
        border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '0.6rem 0.8rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
          <span style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0, fontSize: '0.72rem',
            display: 'grid', placeItems: 'center', fontWeight: 700,
            background: 'var(--surface-alt)', color: 'var(--text-2)',
          }}>
            {index + 1}
          </span>
          <span aria-hidden="true">{TYPE_ICON[question.type]}</span>
          <span style={{
            fontWeight: 600, fontSize: '0.92rem', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {question.prompt}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {TYPE_LABEL[question.type]} · {question.points} pt
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0 || reordering}
                  aria-label={`Move question ${index + 1} up`} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={last || reordering}
                  aria-label={`Move question ${index + 1} down`} onClick={() => onMove(1)}>
            ↓
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Close' : 'Edit'}
          </button>
          {confirming ? (
            <>
              <button type="button" className="btn btn-sm btn-danger" disabled={remove.isPending}
                      onClick={() => remove.mutate(
                        { questionId: question.id, activityId, courseId },
                        { onSuccess: () => notify('Question removed.') },
                      )}>
                Delete
              </button>
              <button type="button" className="btn btn-ghost btn-sm"
                      onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#dc3545' }}
                    onClick={() => setConfirming(true)}>
              Remove
            </button>
          )}
        </div>
      </div>

      <Alert error={remove.error} />

      {open && (
        <div style={{ marginTop: '0.75rem' }}>
          <QuestionForm
            quiz={quiz}
            activityId={activityId}
            courseId={courseId}
            initial={{
              type: question.type,
              prompt: question.prompt,
              options: question.options?.length ? question.options : ['', ''],
              points: question.points,
              answer: question.answer ?? BLANK_ANSWER[question.type],
              explanation: question.explanation ?? '',
            }}
            questionId={question.id}
            onSaved={() => { notify('Question saved.'); setOpen(false); }}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </motion.div>
  );
}

function QuestionForm({ quiz, activityId, courseId, initial, questionId, onSaved, onCancel }) {
  const save = useSaveQuizQuestion();
  const [q, setQ] = useState(initial);
  const idBase = questionId ?? 'new';

  const set = (patch) => setQ((prev) => ({ ...prev, ...patch }));

  function pickType(type) {
    // The answer key is shaped by the type. Carrying {index: 2} onto a
    // true/false question would be rejected by the function, and carrying
    // options onto one would render two answer widgets to the trainee.
    set({ type, answer: { ...BLANK_ANSWER[type] }, options: type === 'mcq' ? (q.options?.length ? q.options : ['', '']) : [] });
  }

  const problem = questionProblem(q);

  function submit(e) {
    e.preventDefault();
    save.mutate({
      quizId: quiz.id, questionId, activityId, courseId,
      type: q.type,
      prompt: q.prompt.trim(),
      options: q.type === 'mcq' ? q.options.map((o) => o.trim()) : [],
      points: Number(q.points),
      answer: q.answer,
      explanation: q.explanation,
    }, { onSuccess: onSaved });
  }

  return (
    <form onSubmit={submit} style={{
      padding: '0.9rem', borderRadius: 'var(--r-lg)',
      background: 'var(--surface-alt)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
    }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <label className="input-label" htmlFor={`${idBase}-type`}>Type</label>
          <select id={`${idBase}-type`} className="input-field" style={{ width: 'auto' }}
                  value={q.type} onChange={(e) => pickType(e.target.value)}>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{TYPE_ICON[value]} {label}</option>
            ))}
          </select>
        </div>
        <div style={{ width: 90 }}>
          <label className="input-label" htmlFor={`${idBase}-points`}>Points</label>
          <input id={`${idBase}-points`} className="input-field" inputMode="numeric"
                 value={q.points} onChange={(e) => set({ points: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="input-label" htmlFor={`${idBase}-prompt`}>Question</label>
        <textarea id={`${idBase}-prompt`} className="input-field" rows={2}
                  placeholder="Which extinguisher is used on an electrical fire?"
                  value={q.prompt} onChange={(e) => set({ prompt: e.target.value })} />
      </div>

      {q.type === 'mcq' && (
        <McqOptions q={q} set={set} idBase={idBase} />
      )}

      {q.type === 'truefalse' && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="input-label" style={{ padding: 0 }}>The statement is</legend>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {[true, false].map((value) => (
              <label key={String(value)} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input
                  type="radio"
                  name={`${idBase}-tf`}
                  checked={q.answer?.value === value}
                  onChange={() => set({ answer: { value } })}
                />
                {value ? 'True' : 'False'}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {q.type === 'paragraph' && (
        <div>
          <label className="input-label" htmlFor={`${idBase}-guidance`}>
            Marking guidance
          </label>
          <textarea
            id={`${idBase}-guidance`} className="input-field" rows={2}
            placeholder="What a full-marks answer covers"
            value={q.answer?.guidance ?? ''}
            onChange={(e) => set({ answer: { guidance: e.target.value } })}
          />
          {/* Worth stating: this is the only question type that stops an
              attempt being scored automatically. */}
          <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: '0.35rem 0 0' }}>
            Only you see this, while marking. A written answer is not graded
            automatically — every attempt waits in Review Work until you mark it,
            and the trainee cannot move on until then.
          </p>
        </div>
      )}

      <div>
        <label className="input-label" htmlFor={`${idBase}-explanation`}>
          Explanation (optional)
        </label>
        <input
          id={`${idBase}-explanation`} className="input-field"
          placeholder="Shown after the attempt is graded"
          value={q.explanation ?? ''}
          onChange={(e) => set({ explanation: e.target.value })}
        />
      </div>

      {problem && (
        <p style={{ fontSize: '0.8rem', color: 'var(--brand-accent)', margin: 0 }}>{problem}</p>
      )}
      <Alert error={save.error} />

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" className="btn btn-primary btn-sm"
                disabled={save.isPending || Boolean(problem)}>
          {save.isPending ? 'Saving…' : questionId ? 'Save question' : 'Add question'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function McqOptions({ q, set, idBase }) {
  const options = q.options ?? ['', ''];
  const correct = q.answer?.index ?? 0;

  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="input-label" style={{ padding: 0 }}>
        Options — select the correct one
      </legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {options.map((option, i) => (
          <div key={i} style={{
            display: 'flex', gap: '0.5rem', alignItems: 'center',
            padding: '0.35rem 0.5rem', borderRadius: 'var(--r-sm)',
            background: correct === i ? 'rgba(40,167,69,0.08)' : 'transparent',
          }}>
            <input
              type="radio"
              name={`${idBase}-correct`}
              aria-label={`Option ${i + 1} is correct`}
              checked={correct === i}
              onChange={() => set({ answer: { index: i } })}
            />
            <label className="sr-only" htmlFor={`${idBase}-opt-${i}`}>Option {i + 1}</label>
            <input
              id={`${idBase}-opt-${i}`}
              className="input-field"
              value={option}
              onChange={(e) => set({
                options: options.map((o, j) => (j === i ? e.target.value : o)),
              })}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: options.length > 2 ? '#dc3545' : 'var(--text-3)' }}
              disabled={options.length <= 2}
              aria-label={`Remove option ${i + 1}`}
              onClick={() => {
                const kept = options.filter((_, j) => j !== i);
                /*
                 * The answer is stored as an index, so deleting an option
                 * above the correct one silently moves the right answer to a
                 * different line — and submit-quiz compares indexes, so every
                 * trainee would get it wrong with nothing on screen to show
                 * why. The index is shifted to follow the option it named.
                 */
                let next = correct;
                if (correct === i) next = 0;
                else if (correct > i) next = correct - 1;
                set({ options: kept, answer: { index: next } });
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '0.4rem' }}
              onClick={() => set({ options: [...options, ''] })}>
        + Add an option
      </button>
    </fieldset>
  );
}
