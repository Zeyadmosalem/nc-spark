import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMyAttempt, useStartQuiz, useSubmitQuiz } from '../../hooks/useQuizzes';
import Alert from '../ui/Alert';
import PageSkeleton from '../ui/Skeleton';

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The response shape submit-quiz expects, per question type. */
function responseFor(question, value) {
  if (question.type === 'mcq') return { index: value };
  if (question.type === 'truefalse') return { value };
  return { text: value ?? '' };
}

/**
 * Runs one quiz: intro, questions, result.
 *
 * Nothing here knows a correct answer. The questions arrive from start-quiz
 * without a key, grading happens in submit-quiz, and the result carries only
 * right-or-wrong per question. With one attempt each, anything this rendered
 * could be screenshotted and handed to the next trainee.
 */
export default function QuizRunner({ quiz, onPassed }) {
  const { data: previous, isLoading } = useMyAttempt(quiz?.id);
  const start = useStartQuiz();
  const submit = useSubmitQuiz();

  const [session, setSession] = useState(null);   // { attempt, questions }
  const [answers, setAnswers] = useState({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);

  const deadline = session?.attempt?.deadline ?? null;

  // The countdown is display only. started_at plus the limit is what the
  // server checks, so a paused or tampered clock changes nothing.
  useEffect(() => {
    if (!deadline || result) return undefined;
    const tick = () => setSecondsLeft(
      Math.max(0, Math.round((new Date(deadline).getTime() - Date.now()) / 1000)),
    );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, result]);

  if (!quiz) return null;
  if (isLoading) return <PageSkeleton label="Loading quiz" stats={0} rows={2} />;

  async function begin() {
    const data = await start.mutateAsync(quiz.id).catch(() => null);
    if (data) { setSession(data); setIndex(0); }
  }

  async function finish() {
    const payload = session.questions.map((q) => ({
      questionId: q.id,
      response: responseFor(q, answers[q.id]),
    }));
    const data = await submit
      .mutateAsync({ attemptId: session.attempt.id, answers: payload, quizId: quiz.id })
      .catch(() => null);
    if (data) {
      setResult(data);
      if (data.passed === true) onPassed?.(data);
    }
  }

  // ---------------------------------------------------------------- result --
  if (result) {
    const verdictText = result.status === 'expired'
      ? 'You ran out of time.'
      : result.status === 'pending_review'
        ? 'Submitted — awaiting your trainer’s review.'
        : result.passed ? 'Passed' : 'Not passed';

    return (
      <div className="page-body measure">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="card no-hover" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '3rem', fontWeight: 700 }}>
            {result.score}%
          </div>
          <p style={{ color: 'var(--text-2)', marginBottom: '1.5rem' }}>{verdictText}</p>

          {/* Right or wrong only. Never the correct answer, never the
              explanation — see the component docblock. */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {(result.perQuestion ?? []).map((p, i) => (
              <span
                key={p.questionId}
                aria-label={p.isCorrect === null
                  ? `Question ${i + 1} awaiting review`
                  : `Question ${i + 1} ${p.isCorrect ? 'correct' : 'incorrect'}`}
                style={{
                  width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  background: p.isCorrect === null ? 'var(--surface-alt)'
                    : p.isCorrect ? 'rgba(40,167,69,0.15)' : 'rgba(220,53,69,0.15)',
                  color: p.isCorrect === null ? 'var(--text-3)'
                    : p.isCorrect ? '#28a745' : '#dc3545',
                }}
              >
                {p.isCorrect === null ? '…' : p.isCorrect ? '✓' : '✕'}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  // ------------------------------------------------------------- questions --
  if (session) {
    const q = session.questions[index];
    const given = answers[q.id];
    const answered = q.type === 'paragraph'
      ? typeof given === 'string' && given.trim() !== ''
      : given !== undefined;
    const last = index === session.questions.length - 1;
    const setAnswer = (v) => setAnswers((a) => ({ ...a, [q.id]: v }));

    return (
      <div className="page-body measure">
        <Alert error={submit.error} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span className="text-sm muted">
            Question {index + 1} of {session.questions.length}
          </span>
          {secondsLeft !== null && (
            <span className={`quiz-timer ${secondsLeft < 60 ? 'urgent' : ''}`}>⏱ {mmss(secondsLeft)}</span>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={q.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }} className="card no-hover" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.15rem', marginBottom: '1.5rem' }}>{q.prompt}</h2>

            {q.type === 'mcq' && (
              <div className="stack">
                {q.options.map((opt, i) => (
                  <button key={opt} type="button"
                          className={`mcq-option ${given === i ? 'selected' : ''}`}
                          onClick={() => setAnswer(i)}>
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {q.type === 'truefalse' && (
              <div className="cluster">
                {[true, false].map((v) => (
                  <button key={String(v)} type="button"
                          className={`tf-option ${given === v ? 'selected' : ''} grow`} onClick={() => setAnswer(v)}>
                    {v ? 'True' : 'False'}
                  </button>
                ))}
              </div>
            )}

            {q.type === 'paragraph' && (
              <>
                <textarea className="input-field" rows={6} aria-label={q.prompt}
                          value={given ?? ''} onChange={(e) => setAnswer(e.target.value)} />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: '0.5rem' }}>
                  Your trainer marks this by hand, so the quiz stays pending until they do.
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
          <button className="btn btn-ghost btn-sm" disabled={index === 0}
                  onClick={() => setIndex((i) => i - 1)}>← Back</button>
          {last ? (
            <button className="btn btn-primary" disabled={!answered || submit.isPending}
                    onClick={finish}>
              {submit.isPending ? 'Submitting…' : 'Finish'}
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!answered}
                    onClick={() => setIndex((i) => i + 1)}>Next →</button>
          )}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------- intro --
  const spent = previous && previous.status !== 'in_progress';
  const pending = previous?.status === 'pending_review';

  return (
    <div className="page-body measure">
      <Alert error={start.error} />
      <div className="card no-hover" style={{ padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', marginBottom: '0.5rem' }}>
          {quiz.title}
        </h1>
        <p style={{ color: 'var(--text-2)', marginBottom: '1.5rem' }}>
          Pass mark {Math.round(quiz.passMark * 100)}%
          {quiz.timeLimitSeconds ? ` · ${Math.floor(quiz.timeLimitSeconds / 60)} minutes` : ''}
        </p>

        {pending ? (
          <p className="muted-2">
            Submitted — awaiting your trainer’s review.
          </p>
        ) : spent ? (
          <>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2.5rem', fontWeight: 700 }}>
              {previous.finalScore ?? previous.autoScore ?? 0}%
            </div>
            <p className="muted-2">
              {previous.passed ? 'Passed' : 'Not passed'} — you have used your attempt.
              {!previous.passed && ' Ask your trainer if you need another.'}
            </p>
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', marginBottom: '1.5rem' }}>
              You get <strong>one attempt</strong>. A trainer has to grant another.
            </p>
            <button className="btn btn-primary btn-lg btn-block"
                    disabled={start.isPending} onClick={begin}>
              {start.isPending ? 'Starting…' : '🚀 Start Quiz'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
