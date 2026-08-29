import { useState } from 'react';
import { motion } from 'framer-motion';
import { useReviewSignup } from '../../hooks/useAdmin';
import Alert from '../../components/ui/Alert';
import { useToast } from '../../components/ui/toast-context';
import { ROLES, titleCase, displayName, waitedFor } from './userDisplay';
import { initialOf } from '../../lib/format';

export default function SignupCard({ user }) {
  const { notify } = useToast();
  const review = useReviewSignup();
  const [role, setRole] = useState('trainee');
  const [confirmingReject, setConfirmingReject] = useState(false);

  const waited = waitedFor(user.createdAt);

  // Approving removes the row. Without a word somewhere, that is
  // indistinguishable from a click that did nothing.
  function decide(decision) {
    review.mutate(
      { userId: user.id, decision, ...(decision === 'approve' ? { role } : {}) },
      {
        onSuccess: () => notify(
          decision === 'approve'
            ? `${displayName(user)} approved as ${role}.`
            : `${displayName(user)} was rejected.`,
        ),
      },
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className="card no-hover"
      style={{ borderLeft: '4px solid #b8860b' }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
        justifyContent: 'space-between',
      }}>
        <div className="cluster grow">
          <div className="avatar" style={{ width: 40, height: 40, flexShrink: 0 }} aria-hidden="true">
            {initialOf(user)}
          </div>
          <div className="grow">
            <h3 className="data-row-title" style={{ fontSize: '1rem', margin: 0 }}>
              {displayName(user)}
            </h3>
            <div className="data-row-meta">{user.email}</div>
            {waited && <div className="data-row-meta">waiting {waited}</div>}
          </div>
        </div>

        <div className="data-row-actions">
          <label className="input-label m-0" htmlFor={`role-${user.id}`}>
            Join as
          </label>
          <select
            id={`role-${user.id}`}
            className="input-field"
            style={{ width: 'auto', padding: '0.45rem 0.6rem' }}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={review.isPending}
          >
            {ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
          </select>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={review.isPending}
            onClick={() => decide('approve')}
          >
            {review.isPending ? 'Working...' : 'Approve'}
          </button>

          {/* Two-step rather than a browser confirm(). Rejection is a one-way
              door: admin-review-signup refuses anyone who is not pending, so a
              rejected user cannot then be approved. */}
          {confirmingReject ? (
            <>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={review.isPending}
                onClick={() => decide('reject')}
              >
                Confirm reject
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmingReject(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={review.isPending}
              onClick={() => setConfirmingReject(true)}
            >
              Reject
            </button>
          )}
        </div>
      </div>
      {confirmingReject && (
        <Alert tone="warning">
          Rejecting is permanent — a rejected account cannot be approved later,
          only recreated.
        </Alert>
      )}
      <Alert error={review.error} />
    </motion.div>
  );
}
