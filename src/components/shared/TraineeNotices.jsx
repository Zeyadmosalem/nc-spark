import { Link } from 'react-router-dom';
import { useMyNotices } from '../../hooks/useNotices';

/**
 * What changed for this trainee while they were away.
 *
 * One attempt per quiz, must-pass to progress, and hand-marked paragraphs mean
 * a trainee's next move often depends on something a trainer did. Without this
 * they would have to guess, or re-open a quiz to find out.
 *
 * It renders nothing at all when there is nothing to say — including when the
 * query fails. A notices strip is not worth breaking the dashboard it sits on.
 */
export default function TraineeNotices() {
  const { data, isLoading, error } = useMyNotices();

  if (isLoading || error || !data || data.total === 0) return null;

  const { awaitingReview, retakesReady, recentlyGraded } = data;

  return (
    <div className="stack">
      {retakesReady.map((n) => (
        <Notice key={n.grantId} tone="#0d6efd" icon="retry">
          <strong>Your trainer granted a retake</strong> for {n.quizTitle}
          {n.courseTitle ? ` (${n.courseTitle})` : ''}.
          {n.reason && <em style={{ display: 'block', color: 'var(--text-3)' }}>“{n.reason}”</em>}
          {n.quizId && (
            <Link to={`/trainee/quiz/${n.quizId}`} className="btn btn-primary btn-sm"
                  style={{ marginTop: '0.5rem', display: 'inline-block' }}>
              Take it now
            </Link>
          )}
        </Notice>
      ))}

      {recentlyGraded.map((n) => (
        <Notice key={n.attemptId} tone={n.passed ? '#28a745' : '#dc3545'} icon={n.passed ? 'complete' : 'review'}>
          <strong>{n.quizTitle} has been marked</strong> — {n.score}%,{' '}
          {n.passed ? 'passed' : 'not passed'}.
          {!n.passed && ' Ask your trainer if you need another attempt.'}
        </Notice>
      ))}

      {awaitingReview.map((n) => (
        <Notice key={n.attemptId} tone="var(--text-3)" icon="⏳">
          <strong>{n.quizTitle}</strong> is awaiting your trainer’s review.
          You can carry on with other courses meanwhile.
        </Notice>
      ))}
    </div>
  );
}

function Notice({ tone, icon, children }) {
  return (
    <div className="card no-hover" role="status"
         style={{ display: 'flex', gap: '0.75rem', padding: '1rem', borderLeft: `4px solid ${tone}` }}>
      <span style={{ fontSize: '1.2rem' }}>{icon}</span>
      <div style={{ fontSize: '0.9rem' }}>{children}</div>
    </div>
  );
}
