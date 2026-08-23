import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from '../../components/shared/Sidebar';
import QueryError from '../../components/shared/QueryError';
import { useUsers, usePendingSignups, usePlatformStats, useRecentAudit } from '../../hooks/useAdmin';
import ContentManager from './ContentManager';
import CourseBuilder from '../../components/authoring/CourseBuilder';
import UserManager from './UserManager';

/**
 * The admin dashboard, on real numbers.
 *
 * What is deliberately absent: XP, streaks, badges and the leaderboard. They
 * were the prototype's headline figures, but nothing in the product awards XP
 * yet (backlog B7), so every one of them would read as a confident zero. A
 * dashboard that quietly reports zeros is worse than one that does not claim
 * to measure the thing at all. They come back with the gamification milestone.
 */

const NAV = [
  { to: '/admin', end: true, icon: '🏠', label: 'Dashboard' },
  { to: '/admin/users', icon: '👥', label: 'User Management' },
  { to: '/admin/content', icon: '📚', label: 'Curriculum' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.4, ease: [0.4, 0, 0.2, 1] },
  }),
};

/** Turns an audit row into a sentence. Unknown actions still render usefully. */
function describe(entry) {
  const from = entry.before ?? {};
  const to = entry.after ?? {};
  switch (entry.action) {
    case 'profile.role_changed':
      return `changed a role from ${from.role ?? '?'} to ${to.role ?? '?'}`;
    case 'profile.signup_reviewed':
      return to.status === 'active'
        ? `approved a signup as ${to.role ?? 'trainee'}`
        : `rejected a signup`;
    case 'profile.suspended':
      return 'suspended an account';
    case 'profile.reinstated':
      return 'reinstated an account';
    default:
      return entry.action.replace(/[._]/g, ' ');
  }
}

const when = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

function Metric({ label, value, sub, color }) {
  return (
    <div className="stat-card">
      <div className="stat-card-value" style={{ color }}>{value}</div>
      <div className="stat-card-label">{label}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

// Exported for its test: rendering the whole shell would drag in the sidebar
// and AppContext to assert numbers that have nothing to do with either.
export function Dashboard() {
  const users = useUsers();
  const signups = usePendingSignups();
  const stats = usePlatformStats();
  const audit = useRecentAudit(8);

  if (users.isLoading || stats.isLoading) {
    return <div className="page-body" role="status">Loading the platform overview…</div>;
  }

  const failure = users.error ?? stats.error;
  if (failure) {
    return (
      <div className="page-body">
        <QueryError error={failure} what="the platform overview" />
      </div>
    );
  }

  const all = users.data ?? [];
  const byRole = (role) => all.filter((u) => u.role === role).length;
  const suspended = all.filter((u) => u.status === 'suspended').length;
  const waiting = (signups.data ?? []).length;
  const s = stats.data;

  return (
    <motion.div
      className="page-body"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        variants={fadeUp}
        custom={0}
        className="xp-hero"
        style={{ background: 'linear-gradient(145deg, rgba(0,0,0,0.92), rgba(10,10,18,0.95)), radial-gradient(500px 300px at 10% 10%, rgba(0,163,224,0.2), transparent), radial-gradient(500px 400px at 95% 5%, rgba(107,44,141,0.25), transparent)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Admin Console
            </p>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', color: '#fff', lineHeight: 1.1, marginBottom: '0.5rem' }}>
              Platform Overview
            </h1>
            <div className="level-badge">
              <span>⚙️</span>
              <span>Administrator</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700, color: '#fff' }}>
                {all.length}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Accounts</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700, color: '#fff' }}>
                {s.enrollments.active}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Active Enrolments</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Anything here is a person or a request blocked on an admin. It sits
          above the statistics because statistics are not actionable. */}
      {(waiting > 0 || s.enrollments.pending > 0) && (
        <motion.div variants={fadeUp} custom={1} className="card no-hover"
                    style={{ borderLeft: '4px solid #b8860b' }}>
          <div className="card-title">Waiting on you</div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {waiting > 0 && (
              <Link to="/admin/users" className="btn btn-primary btn-sm">
                {waiting} signup{waiting === 1 ? '' : 's'} to review →
              </Link>
            )}
            {s.enrollments.pending > 0 && (
              <span style={{ color: 'var(--text-2)', fontSize: '0.9rem' }}>
                {s.enrollments.pending} course application
                {s.enrollments.pending === 1 ? '' : 's'} pending a trainer&apos;s decision
              </span>
            )}
          </div>
        </motion.div>
      )}

      <motion.div variants={fadeUp} custom={2} className="stat-grid stat-grid-4">
        <Metric label="Trainees" value={byRole('trainee')} color="var(--brand-primary)" />
        <Metric label="Trainers" value={byRole('trainer')} color="var(--brand-secondary)" />
        <Metric label="Supervisors" value={byRole('supervisor')} color="var(--brand-accent)" />
        <Metric label="Admins" value={byRole('admin')} color="#b8860b" />
      </motion.div>

      <motion.div variants={fadeUp} custom={3} className="stat-grid stat-grid-4">
        <Metric
          label="Courses"
          value={s.courses.total}
          sub={`${s.courses.published} published`}
          color="var(--heading)"
        />
        <Metric label="Active enrolments" value={s.enrollments.active} color="#28a745" />
        <Metric label="Quiz attempts" value={s.attempts.total} color="var(--heading)" />
        <Metric
          label="Awaiting marking"
          value={s.attempts.pendingReview}
          sub="paragraph answers"
          color={s.attempts.pendingReview > 0 ? 'var(--brand-accent)' : 'var(--text-3)'}
        />
      </motion.div>

      {suspended > 0 && (
        <motion.div variants={fadeUp} custom={4} className="card no-hover">
          <div className="card-title">Account health</div>
          <p style={{ color: 'var(--text-2)', margin: 0, fontSize: '0.9rem' }}>
            {suspended} account{suspended === 1 ? ' is' : 's are'} suspended.{' '}
            <Link to="/admin/users" style={{ color: 'var(--brand-primary)' }}>Review them</Link>.
          </p>
        </motion.div>
      )}

      {/* The audit trail is append-only at the database level, enforced for
          every role including service_role. Surfacing it is the only reason it
          is worth writing. */}
      <motion.div variants={fadeUp} custom={5} className="card no-hover">
        <div className="card-title">Recent admin activity</div>
        {audit.error ? (
          <QueryError error={audit.error} what="the audit trail" />
        ) : (audit.data ?? []).length === 0 ? (
          <p style={{ color: 'var(--text-2)', margin: 0, fontSize: '0.9rem' }}>
            Nothing recorded yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {audit.data.map((e) => (
              <div key={e.id} className="student-row" style={{ cursor: 'default' }}>
                <div className="student-row-info">
                  <div className="student-row-name" style={{ fontSize: '0.9rem' }}>
                    {e.actorEmail ?? 'Unknown admin'} {describe(e)}
                  </div>
                  <div className="student-row-meta">{e.entityType} · {e.entityId}</div>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                  {when(e.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// useUsers is shared with UserManager on purpose: same query key, so the
// dashboard and the directory are one fetch and can never disagree.

export default function AdminShell() {
  return (
    <div className="app-shell">
      <Sidebar navItems={NAV} />
      <div className="main-content">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<UserManager />} />
          <Route path="content" element={<ContentManager />} />
          <Route path="content/:courseId" element={<CourseBuilder backTo="/admin/content" />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </div>
  );
}
