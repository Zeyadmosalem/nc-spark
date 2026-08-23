import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '../../hooks/useSession';
import {
  useUsers, usePendingSignups, useSetUserRole, useReviewSignup, useSuspendUser,
} from '../../hooks/useAdmin';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';
import StatusPill from '../../components/ui/StatusPill';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/toast-context';

/**
 * The admin console's reason to exist.
 *
 * Signup auto-activates allowlisted email domains and queues everything else
 * as `pending`. Until this screen existed nothing in the app called
 * admin-review-signup, so anyone who signed up from an unlisted domain stayed
 * pending forever and the only way in was a script run against the database.
 *
 * Every write goes through an Edge Function, never a table update, because
 * role changes and suspensions are validated and audited server-side. The
 * refusals that matter (last active admin, reviewing a non-pending user) are
 * enforced there; this page surfaces them rather than trying to predict them.
 */

const ROLES = ['trainee', 'trainer', 'supervisor', 'admin'];

const TABS = [
  { key: 'all',        label: 'Everyone',    match: () => true },
  { key: 'trainee',    label: 'Trainees',    match: (u) => u.role === 'trainee' },
  { key: 'trainer',    label: 'Trainers',    match: (u) => u.role === 'trainer' },
  { key: 'supervisor', label: 'Supervisors', match: (u) => u.role === 'supervisor' },
  { key: 'admin',      label: 'Admins',      match: (u) => u.role === 'admin' },
  { key: 'suspended',  label: 'Suspended',   match: (u) => u.status === 'suspended' },
];

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** How long somebody has been waiting on a human. */
function waitedFor(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

const displayName = (user) => user.name || 'Unnamed';
const initial = (user) => user.avatar || (user.name ?? '?').charAt(0).toUpperCase();

export default function UserManager() {
  const { profile } = useSession();
  const users = useUsers();
  const signups = usePendingSignups();

  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  if (users.isLoading) {
    return <PageSkeleton label="Loading users" stats={0} rows={5} />;
  }
  if (users.error) {
    return (
      <div className="page-body">
        <QueryError error={users.error} what="the user directory" />
      </div>
    );
  }

  const all = users.data ?? [];
  const queue = signups.data ?? [];
  const term = search.trim().toLowerCase();
  const activeTab = TABS.find((t) => t.key === tab) ?? TABS[0];

  const shown = all
    .filter(activeTab.match)
    .filter((u) => !term
      || (u.name ?? '').toLowerCase().includes(term)
      || (u.email ?? '').toLowerCase().includes(term));

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <p className="eyebrow">User Management</p>
        <h1 className="section-heading" style={{ marginBottom: '0.35rem' }}>People</h1>
        <p className="section-sub">
          {all.length} account{all.length === 1 ? '' : 's'} on the platform.
        </p>
      </div>

      {/* The queue comes first and unprompted. A pending user cannot sign in,
          and nothing else in the product tells anyone they are waiting. */}
      <section>
        <div className="section-header" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Waiting for approval</h2>
          {queue.length > 0 && (
            <span className="section-count">
              {queue.length} {queue.length === 1 ? 'person' : 'people'}
            </span>
          )}
        </div>
        {signups.error && <QueryError error={signups.error} what="the approval queue" />}
        {!signups.error && (queue.length === 0 ? (
          <EmptyState icon="✅" title="Nobody is waiting">
            Signups from allowlisted domains activate themselves. Anyone else lands
            here for you to review.
          </EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <AnimatePresence initial={false}>
              {queue.map((u) => <SignupCard key={u.id} user={u} />)}
            </AnimatePresence>
          </div>
        ))}
      </section>

      <section>
        <div className="section-header" style={{ marginBottom: '1rem' }}>
          <div className="tab-navigation" style={{ marginBottom: 0 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`tab-item ${tab === t.key ? 'active' : ''}`}
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                {t.label} ({all.filter(t.match).length})
              </button>
            ))}
          </div>
          <input
            className="input-field"
            style={{ maxWidth: 260 }}
            type="search"
            aria-label="Search users by name or email"
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'grid', gap: '0.75rem' }}
        >
          {shown.length === 0 ? (
            <EmptyState icon="🔍" title={term ? 'No matches' : 'Nobody here'}>
              {term
                ? `Nobody matches "${search}". Try part of a name or an email domain.`
                : 'No users in this group yet.'}
            </EmptyState>
          ) : (
            shown.map((u) => <UserRow key={u.id} user={u} isSelf={u.id === profile?.id} />)
          )}
        </motion.div>
      </section>
    </div>
  );
}

function SignupCard({ user }) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
          <div className="avatar" style={{ width: 40, height: 40, flexShrink: 0 }} aria-hidden="true">
            {initial(user)}
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 className="data-row-title" style={{ fontSize: '1rem', margin: 0 }}>
              {displayName(user)}
            </h3>
            <div className="data-row-meta">{user.email}</div>
            {waited && <div className="data-row-meta">waiting {waited}</div>}
          </div>
        </div>

        <div className="data-row-actions">
          <label className="input-label" style={{ margin: 0 }} htmlFor={`role-${user.id}`}>
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

function UserRow({ user, isSelf }) {
  const { notify } = useToast();
  const changeRole = useSetUserRole();
  const suspend = useSuspendUser();

  const busy = changeRole.isPending || suspend.isPending;
  const isSuspended = user.status === 'suspended';
  const canAct = user.status === 'active' || isSuspended;

  return (
    <div className="card no-hover">
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        justifyContent: 'space-between', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
          <div className="avatar" style={{ width: 40, height: 40, flexShrink: 0 }} aria-hidden="true">
            {initial(user)}
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 className="data-row-title" style={{ fontSize: '1rem', margin: 0 }}>
              {displayName(user)}
              {isSelf && (
                <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: '0.8rem' }}>
                  {' '}- you
                </span>
              )}
            </h3>
            <div className="data-row-meta">{user.email}</div>
          </div>
        </div>

        <div className="data-row-actions">
          <StatusPill status={user.status} />

          {/* Acting on yourself is how an admin locks themselves out mid-session.
              The server refuses only the LAST active admin; this also refuses
              you demoting or suspending yourself while others remain, which the
              server permits but nobody means to do. */}
          <select
            className="input-field"
            style={{ width: 'auto', padding: '0.4rem 0.6rem' }}
            aria-label={`Role for ${user.name || user.email}`}
            value={user.role}
            disabled={busy || isSelf || !canAct}
            onChange={(e) => changeRole.mutate(
              { userId: user.id, role: e.target.value },
              { onSuccess: () => notify(`${displayName(user)} is now a ${e.target.value}.`) },
            )}
          >
            {ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
          </select>

          {canAct && !isSelf && (
            <button
              type="button"
              className={`btn btn-sm ${isSuspended ? 'btn-primary' : 'btn-danger'}`}
              disabled={busy}
              onClick={() => suspend.mutate(
                { userId: user.id, suspend: !isSuspended },
                {
                  onSuccess: () => notify(
                    isSuspended
                      ? `${displayName(user)} can sign in again.`
                      : `${displayName(user)} is suspended.`,
                  ),
                },
              )}
            >
              {busy ? 'Working...' : isSuspended ? 'Reinstate' : 'Suspend'}
            </button>
          )}
        </div>
      </div>
      <Alert error={changeRole.error ?? suspend.error} />
    </div>
  );
}
