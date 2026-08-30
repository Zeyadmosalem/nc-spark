import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Alert from '../ui/Alert';
import EmptyState from '../ui/EmptyState';
import { useToast } from '../ui/toast-context';
import { useReorderQuizQuestions } from '../../hooks/useAuthoring';
import QuestionForm from './QuestionForm';
import QuestionRow from './QuestionRow';
import { BLANK } from './quizFields';

export default function QuestionList({ quiz, questions, activityId, courseId }) {
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
    <div className="stack">
      {questions.length === 0 ? (
        <EmptyState icon="warning" title="No questions yet">
          A quiz with no questions cannot be passed — every pass mark is above
          zero and an empty quiz scores zero. The course will not publish until
          this has at least one.
        </EmptyState>
      ) : (
        <>
          <p className="u-text-sm muted-2 u-m0">
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
