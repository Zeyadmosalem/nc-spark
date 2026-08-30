import { useState } from 'react';
import {
  usePendingReviews, useBlockedAttempts, useOpenRetakeGrants,
  useGradeParagraph, useGrantRetake,
} from '../../hooks/useReview';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import Icon from '../../components/ui/Icon';

/**
 * The two actions only a trainer can take, in one place.
 *
 * One attempt per quiz, must-pass to progress, and paragraphs graded by hand
 * together mean a trainee can be blocked indefinitely with no way to unblock
 * themselves. This page is what makes that recoverable, which is why it ships
 * with the assessment rather than after it.
 */
export default function TrainerReview() {
  const pending = usePendingReviews();
  const blocked = useBlockedAttempts();
  const grants = useOpenRetakeGrants();

  const isLoading = pending.isLoading || blocked.isLoading || grants.isLoading;
  const failure = pending.error ?? blocked.error ?? grants.error;

  if (isLoading) return <PageSkeleton label="Loading the review queue" stats={0} rows={3} />;
  if (failure) {
    return <div className="page-body"><QueryError error={failure} what="the review queue" /></div>;
  }

  const paragraphs = pending.data ?? [];
  const stuck = blocked.data ?? [];
  const granted = new Set((grants.data ?? []).map((g) => `${g.quiz_id}:${g.trainee_id}`));

  return (
    <div className="page-body stack-lg">
      <div>
        <p className="eyebrow">Review</p>
        <h1 className="section-heading">Waiting on You</h1>
        <p className="section-sub">
          Trainees cannot move past these on their own.
        </p>
      </div>

      {paragraphs.length === 0 && stuck.length === 0 ? (
        <EmptyState icon="complete" title="All clear">
          Nothing is waiting on you. Every trainee can keep going.
        </EmptyState>
      ) : (
        <>
          <section className="stack-md">
            <h2 className="u-text-md">
              <Icon name="review" size={16} />
            Paragraphs awaiting a grade ({paragraphs.length})
            </h2>
            {paragraphs.length === 0
              ? <p className="muted u-text-base">None right now.</p>
              : paragraphs.map((a) => <ParagraphCard key={a.attemptId} attempt={a} />)}
          </section>

          <section className="stack-md">
            <h2 className="group-title">
              <Icon name="retry" size={16} />
              Blocked on a retake ({stuck.length})
            </h2>
            {stuck.length === 0
              ? <p className="muted u-text-base">None right now.</p>
              : stuck.map((a) => (
                <RetakeCard
                  key={a.attemptId}
                  attempt={a}
                  alreadyGranted={granted.has(`${a.quizId}:${a.traineeId}`)}
                />
              ))}
          </section>
        </>
      )}
    </div>
  );
}

function ParagraphCard({ attempt }) {
  const grade = useGradeParagraph();
  const first = attempt.paragraphs[0];
  // Held as a string: clearing the field would otherwise put NaN in the value
  // attribute, which React rejects and which leaves the input unusable.
  const [awarded, setAwarded] = useState('0');
  const [comment, setComment] = useState('');

  if (!first) return null;
  const marks = Number(awarded);
  const invalid = awarded.trim() === '' || Number.isNaN(marks)
    || marks < 0 || marks > first.points;

  return (
    <div className="card no-hover stack">
      <div className="u-row u-gap-3 u-wrap">
        <span className="badge-pill u-alt">
          {attempt.traineeAvatar}
        </span>
        <strong>{attempt.traineeName}</strong>
        <span className="text-sm muted">
          {attempt.courseTitle} · {attempt.quizTitle} · auto-marked {attempt.autoScore}%
        </span>
      </div>

      <div style={{ background: 'var(--surface-alt)', padding: '0.75rem', borderRadius: 'var(--r-md)' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', marginBottom: '0.35rem' }}>
          {first.prompt}
        </p>
        <p style={{ whiteSpace: 'pre-wrap' }}>{first.text}</p>
      </div>

      {grade.error && (
        <Alert error={grade.error} />
      )}

      <div className="cluster">
        <label className="u-text-sm muted-2">
          Marks awarded (out of {first.points})
          <input
            className="input-field" type="number" min={0} max={first.points}
            aria-label={`Marks awarded, out of ${first.points}`}
            value={awarded}
            onChange={(e) => setAwarded(e.target.value)}
            style={{ width: 110, display: 'block', marginTop: '0.25rem' }}
          />
        </label>
        <label style={{ flex: 1, minWidth: 200, fontSize: '0.8rem', color: 'var(--text-2)' }}>
          Comment for the trainee
          <input
            className="input-field" aria-label="Comment for the trainee"
            value={comment} onChange={(e) => setComment(e.target.value)}
            style={{ display: 'block', marginTop: '0.25rem', width: '100%' }}
          />
        </label>
        <button
          className="btn btn-primary btn-sm"
          disabled={invalid || grade.isPending}
          onClick={() => grade.mutate({
            attemptId: attempt.attemptId, questionId: first.questionId,
            awarded: marks, comment,
          })}
        >
          {grade.isPending ? 'Saving…' : 'Save grade'}
        </button>
      </div>

      {attempt.paragraphs.length > 1 && (
        <p className="text-xs muted">
          {attempt.paragraphs.length - 1} more paragraph
          {attempt.paragraphs.length > 2 ? 's' : ''} on this attempt; it stays pending until all are marked.
        </p>
      )}
    </div>
  );
}

function RetakeCard({ attempt, alreadyGranted }) {
  const grant = useGrantRetake();
  const [reason, setReason] = useState('');

  return (
    <div className="card no-hover stack">
      <div className="u-row u-gap-3 u-wrap">
        <span className="badge-pill u-alt">
          {attempt.traineeAvatar}
        </span>
        <strong>{attempt.traineeName}</strong>
        <span className="text-sm muted">
          {attempt.courseTitle} · {attempt.quizTitle} ·{' '}
          {attempt.status === 'expired' ? 'ran out of time' : 'did not pass'} at {attempt.score}%
        </span>
      </div>

      {grant.error && (
        <Alert error={grant.error} />
      )}

      {alreadyGranted ? (
        // Without this a trainer keeps clicking and keeps getting a 409.
        <p className="text-sm muted-2">
          ✓ Retake already granted — waiting for the trainee to use it.
        </p>
      ) : (
        <div className="cluster">
          <label style={{ flex: 1, minWidth: 220, fontSize: '0.8rem', color: 'var(--text-2)' }}>
            Reason (kept in the audit log)
            <input
              className="input-field" aria-label="Reason for the retake"
              value={reason} onChange={(e) => setReason(e.target.value)}
              style={{ display: 'block', marginTop: '0.25rem', width: '100%' }}
            />
          </label>
          <button
            className="btn btn-secondary btn-sm"
            disabled={grant.isPending}
            onClick={() => grant.mutate({
              quizId: attempt.quizId, traineeId: attempt.traineeId, reason,
            })}
          >
            {grant.isPending ? 'Granting…' : 'Allow retake'}
          </button>
        </div>
      )}
    </div>
  );
}
