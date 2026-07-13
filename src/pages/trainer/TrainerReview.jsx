import { useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function TrainerReview() {
  const { quizzes, reviewSubmission } = useApp();
  const submissions = Object.values(quizzes).flatMap((q) => (q.submissions || []).map((s) => ({ ...s, quizId: q.id, quizTitle: q.title })));
  const pending = submissions.filter((s) => s.status === 'pending');
  const [selected, setSelected] = useState(null);

  function handleApprove(sub) {
    reviewSubmission(sub.quizId, sub.id, { status: 'reviewed', feedback: 'Approved.' });
    setSelected(null);
  }

  function handleFeedback(sub, text) {
    reviewSubmission(sub.quizId, sub.id, { status: 'reviewed', feedback: text });
    setSelected(null);
  }

  return (
    <div className="page-body">
      <p className="eyebrow">Review Submissions</p>
      <h1 className="section-heading">Paragraph Responses</h1>
      <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          {pending.length === 0 ? <div className="card no-hover">No pending paragraph responses.</div> : pending.map((s) => (
            <div key={s.id} className="card no-hover" style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{s.traineeName} — {s.quizTitle}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-2)' }}>{new Date(s.createdAt).toLocaleString()}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={() => setSelected(s)}>Open</button>
                <button className="btn btn-secondary" onClick={() => handleApprove(s)}>Mark Reviewed</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ width: 520 }}>
          {selected ? (
            <div className="card">
              <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{selected.traineeName} — {selected.quizTitle}</div>
              <div style={{ fontSize: '0.95rem', color: 'var(--text-2)', marginBottom: '0.75rem' }}>
                {Object.entries(selected.answers).map(([qid, ans]) => (
                  <div key={qid} style={{ marginBottom: '0.5rem' }}><strong>{qid}:</strong> {String(ans)}</div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={() => handleFeedback(selected, 'Thanks — good answer.')}>Approve + Feedback</button>
                <button className="btn btn-secondary" onClick={() => handleFeedback(selected, 'Please elaborate on point 2.')}>Request Revision</button>
                <button className="btn btn-ghost" onClick={() => setSelected(null)}>Close</button>
              </div>
            </div>
          ) : (
            <div className="card no-hover small-note">Select a submission to review its paragraph answers and leave feedback.</div>
          )}
        </div>
      </div>
    </div>
  );
}
