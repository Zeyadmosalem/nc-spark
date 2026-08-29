import { useState } from 'react';
import { motion } from 'framer-motion';
import Alert from '../ui/Alert';
import { useToast } from '../ui/toast-context';
import { useDeleteQuizQuestion } from '../../hooks/useAuthoring';
import Icon from '../ui/Icon';
import QuestionForm from './QuestionForm';
import { TYPE_LABEL, TYPE_ICON, BLANK_ANSWER } from './quizFields';

export default function QuestionRow({ question, index, last, quiz, activityId, courseId, onMove, reordering }) {
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
        <div className="cluster grow">
          <span style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0, fontSize: '0.72rem',
            display: 'grid', placeItems: 'center', fontWeight: 700,
            background: 'var(--surface-alt)', color: 'var(--text-2)',
          }}>
            {index + 1}
          </span>
          <span className="row-icon" style={{ width: '1.6rem', height: '1.6rem' }}>
            <Icon name={TYPE_ICON[question.type]} size={14} />
          </span>
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
            <Icon name="up" size={14} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={last || reordering}
                  aria-label={`Move question ${index + 1} down`} onClick={() => onMove(1)}>
            <Icon name="down" size={14} />
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
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
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
