import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '../../hooks/useSession';
import {
  useUsers, usePendingSignups, useSetUserRole, useReviewSignup, useSuspendUser,
} from '../../hooks/useAdmin';
import QueryError from '../../components/shared/QueryError';

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

const STATUS_STYLE = {
  active:    { bg: 'rgba(40,167,69,0.15)',  fg: '#28a745',       label: 'Active' },
  pending:   { bg: 'rgba(232,179,77,0.18)', fg: '#b8860b',       label: 'Pending' },
  suspended: { bg: 'rgba(220,53,69,0.15)',  fg: '#dc3545',       label: 'Suspended' },
  rejected:  { bg: 'var(--surface-alt)',    fg: 'var(--text-3)', label: 'Rejected' },
};

const TABS = [
  { key: 'all',        label: 'Everyone',    match: () => true },
  { key: 'trainee',    label: 'Trainees',    match: (u) => u.role === 'trainee' },
  { key: 'trainer',    label: 'Trainers',    match: (u) => u.role === 'trainer' },
  { key: 'supervisor', label: 'Supervisors', match: (u) => u.role === 'supervisor' },
  { key: 'admin',      label: 'Admins',      match: (u) => u.role === 'admin' },
  { key: 'suspended',  label: 'Suspended',   match: (u) => u.status === 'suspended' },
];

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Module scope, not defined during render: a component declared inside a
// render is a new type on every pass, so React remounts it and any state it
// holds is lost. Neither of these holds state yet, which is exactly why it
// would be a trap for whoever adds some.
function Alert({ error }) {
  if (!error) return null;
  return (
    <p role="alert" style={{ color: 'var(--brand-accent)', fontSize: '0.85rem', margin: '0.5rem 0 0' }}>
      {error.message}
    </p>
  );
}

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.rejected;
  return (
    <span style={{
      background: s.bg, color: s.fg, fontSize: '0.7rem', fontWeight: 700,
      padding: '0.2rem 0.55rem', borderRadius: 999, textTransform: 'uppercase',
      letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

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

export default function UserManager() {
  const { profile } = useSession();
  const users = useUsers();
  const signups = usePendingSignups();

  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  if (users.isLoading) {
    return <div className="page-body" role="status">Loading users...</div>;
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
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>
          Waiting for approval ({queue.length})
        </h2>
        {signups.error && <QueryError error={signups.error} what="the approval queue" />}
        {!signups.error && (queue.length === 0 ? (
          <div className="card no-hover" style={{ padding: '1.5rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-2)', margin: 0 }}>
              Nobody is waiting. Signups from allowlisted domains activate themselves.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <AnimatePresence initial={false}>
              {queue.map((u) => <SignupCard key={u.id} user={u} />)}
            </AnimatePresence>
          </div>
        ))}
      </section>

      <section>
        <div style={{
          display: 'flex', gap: '1rem', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: '1rem',
        }}>
          <div className="tab-navigation" style={{ marginBottom: 0 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`tab-item ${tab === t.key ? 'active' : ''}`}
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
            <p style={{ color: 'var(--text-2)' }}>
              {term ? `Nobody matches "${search}".` : 'No users in this group.'}
            </p>
          ) : (
            shown.map((u) => <UserRow key={u.id} user={u} isSelf={u.id === profile?.id} />)
          )}
        </motion.div>
      </section>
    </div>
  );
}

function SignupCard({ user }) {
  const review = useReviewSignup();
  const [role, setRole] = useState('trainee');
  const [confirmingReject, setConfirmingReject] = useState(false);

  const waited = waitedFor(user.createdAt);

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
          <div className="avatar" style={{ width: 40, height: 40, flexShrink: 0 }}>
            {user.avatar || (user.name ?? '?').charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
              {user.name || 'Unnamed'}
            </h3>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-2)', wordBreak: 'break-all' }}>
              {user.email}
            </div>
            {waited && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>waiting {waited}</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
            onClick={() => review.mutate({ userId: user.id, decision: 'approve', role })}
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
                onClick={() => review.mutate({ userId: user.id, decision: 'reject' })}
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
      <Alert error={review.error} />
    </motion.div>
  );
}

function UserRow({ user, isSelf }) {
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
          <div className="avatar" style={{ width: 40, height: 40, flexShrink: 0 }}>
            {user.avatar || (user.name ?? '?').charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
              {user.name || 'Unnamed'}
              {isSelf && (
                <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: '0.8rem' }}>
                  {' '}- you
                </span>
              )}
            </h3>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-2)', wordBreak: 'break-all' }}>
              {user.email}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
            onChange={(e) => changeRole.mutate({ userId: user.id, role: e.target.value })}
          >
            {ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
          </select>

          {canAct && !isSelf && (
            <button
              type="button"
              className={`btn btn-sm ${isSuspended ? 'btn-primary' : 'btn-danger'}`}
              disabled={busy}
              onClick={() => suspend.mutate({ userId: user.id, suspend: !isSuspended })}
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
