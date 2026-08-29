import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import RoleShell from '../../components/shared/RoleShell';
import QueryError from '../../components/shared/QueryError';
import { useUsers, usePendingSignups, usePlatformStats, useRecentAudit } from '../../hooks/useAdmin';
import PageSkeleton from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';
import ContentManager from './ContentManager';
import CourseBuilder from '../../components/authoring/CourseBuilder';
import CourseRoster from '../../components/roster/CourseRoster';
import CourseChatPage from '../../components/shared/CourseChatPage';
import SupportInbox from '../../components/support/SupportInbox';
import { useSupportUnread } from '../../hooks/useSupport';
import UserManager from './UserManager';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import { fadeUp, stagger, item } from '../../lib/motion';
import AccountPage from '../shared/AccountPage';

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
  { to: '/admin', end: true, icon: 'dashboard', label: 'Dashboard' },
  { to: '/admin/users', icon: 'users', label: 'User Management' },
  { to: '/admin/content', icon: 'curriculum', label: 'Curriculum' },
  { to: '/admin/support', icon: 'support', label: 'Support' },
  { section: 'Account' },
  { to: '/admin/account', icon: 'account', label: 'My Account' },
];

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
        : 'rejected a signup';
    case 'profile.suspended':
      return 'suspended an account';
    case 'profile.reinstated':
      return 'reinstated an account';
    case 'course.published':
      return 'published a course';
    case 'course.unpublished':
      return 'returned a course to draft';
    case 'quiz.created':
      return 'created a quiz';
    case 'quiz.question_added':
      return 'added a quiz question';
    case 'quiz.question_updated':
      return 'edited a quiz question';
    case 'quiz.question_removed':
      return 'removed a quiz question';
    case 'allowed_domain.added':
      return `allowlisted ${entry.entityId}`;
    case 'allowed_domain.removed':
      return `removed ${entry.entityId} from the allowlist`;
    default:
      return entry.action.replace(/[._]/g, ' ');
  }
}

/** Which icon an audit entry gets, from the first segment of its action. */
const AUDIT_ICON = {
  profile: 'users',
  course: 'courses',
  quiz: 'quiz',
  quiz_question: 'quiz',
  allowed_domain: 'verified',
};

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

// Exported for its test: rendering the whole shell would drag in the sidebar
// to assert numbers that have nothing to do with it.
export function Dashboard() {
  const users = useUsers();
  const signups = usePendingSignups();
  const stats = usePlatformStats();
  const audit = useRecentAudit(8);

  if (users.isLoading || stats.isLoading) {
    return <PageSkeleton label="Loading the platform overview" />;
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
    <motion.div className="page-body" variants={stagger()} initial="hidden" animate="visible">
      <motion.section className="hero" variants={fadeUp} custom={0}>
        <div className="hero-inner">
          <div className="grow">
            <p className="hero-eyebrow">
              <Icon name="settings" size={12} />
              Admin console
            </p>
            <h1 className="hero-title">Platform overview</h1>
            <p className="hero-sub">
              {all.length} account{all.length === 1 ? '' : 's'}, {s.courses.total} course
              {s.courses.total === 1 ? '' : 's'}, {s.enrollments.active} active enrolment
              {s.enrollments.active === 1 ? '' : 's'}.
            </p>
          </div>
          {waiting > 0 && (
            <Button to="/admin/users" variant="primary" iconAfter="forward">
              Review {waiting} signup{waiting === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      </motion.section>

      {/* Anything here is a person or a request blocked on an admin. It sits
          above the statistics because statistics are not actionable. */}
      {s.enrollments.pending > 0 && (
        <motion.div className="card no-hover card-accent card-warn" variants={item}>
          <p className="text-sm" style={{ margin: 0, color: 'var(--text-2)' }}>
            <strong>{s.enrollments.pending}</strong> course application
            {s.enrollments.pending === 1 ? '' : 's'} waiting on a trainer&apos;s decision.
            Nobody in that queue can start until it is decided.
          </p>
        </motion.div>
      )}

      <motion.div className="stat-grid" variants={stagger(0.045, 0.06)}>
        <StatCard label="Trainees" value={byRole('trainee')} icon="users" color="var(--brand-primary)" />
        <StatCard label="Trainers" value={byRole('trainer')} icon="teaching" color="var(--brand-accent)" />
        <StatCard label="Supervisors" value={byRole('supervisor')} icon="team" color="#6b46c1" />
        <StatCard label="Admins" value={byRole('admin')} icon="settings" color="var(--warn)" />
      </motion.div>

      <motion.div className="stat-grid" variants={stagger(0.045, 0.06)}>
        <StatCard
          label="Courses" value={s.courses.total} icon="courses"
          sub={`${s.courses.published} published`} color="var(--heading)"
        />
        <StatCard label="Active enrolments" value={s.enrollments.active} icon="trend" color="#1a7f37" />
        <StatCard label="Quiz attempts" value={s.attempts.total} icon="quiz" color="var(--brand-secondary)" />
        <StatCard
          label="Awaiting marking"
          value={s.attempts.pendingReview}
          icon="waiting"
          sub="written answers"
          color={s.attempts.pendingReview > 0 ? 'var(--brand-accent)' : 'var(--text-3)'}
          tone={s.attempts.pendingReview > 0 ? 'attention' : undefined}
        />
      </motion.div>

      {suspended > 0 && (
        <motion.div className="card no-hover" variants={item}>
          <h2 className="card-title"><Icon name="blocked" size={16} />Account health</h2>
          <p className="text-sm" style={{ color: 'var(--text-2)', margin: 0 }}>
            {suspended} account{suspended === 1 ? ' is' : 's are'} suspended.{' '}
            <Link className="brand" to="/admin/users">Review them</Link>.
          </p>
        </motion.div>
      )}

      {/* The audit trail is append-only at the database level, enforced for
          every role including service_role. Surfacing it is the only reason it
          is worth writing. */}
      <motion.section className="card no-hover" variants={item}>
        <h2 className="card-title"><Icon name="inbox" size={16} />Recent admin activity</h2>
        {audit.error ? (
          <QueryError error={audit.error} what="the audit trail" />
        ) : (audit.data ?? []).length === 0 ? (
          <p className="text-sm muted m-0">Nothing recorded yet.</p>
        ) : (
          <div className="stack">
            {audit.data.map((e) => (
              <div key={e.id} className="data-row">
                <span className="row-icon">
                  <Icon name={AUDIT_ICON[e.entityType] ?? 'info'} size={15} />
                </span>
                <div className="data-row-main">
                  {/*
                    The action leads. This row used to open with the actor's
                    email in bold and carry a raw uuid underneath it — so the
                    least useful thing on the line was the most prominent, and
                    the identifier was one no human can resolve.
                  */}
                  <div className="data-row-title" style={{ fontWeight: 500 }}>
                    {describe(e)}
                  </div>
                  <div className="data-row-meta">{e.actorEmail ?? 'Unknown admin'}</div>
                </div>
                <span className="text-xs muted" style={{ whiteSpace: 'nowrap' }}>
                  {when(e.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}

// useUsers is shared with UserManager on purpose: same query key, so the
// dashboard and the directory are one fetch and can never disagree.

export default function AdminShell() {
  // Same reasoning as the trainer's rail: a queue nobody is told about is a
  // queue nobody empties.
  // Counts threads with something the reader has not seen, rather than ones
  // "awaiting staff" — a reply you have already read is not a notification.
  const asking = useSupportUnread();

  const nav = NAV.map((item) =>
    (item.to === '/admin/support' ? { ...item, badge: asking } : item));

  return (
    <RoleShell navItems={nav} title="NC Spark Admin">
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="users" element={<UserManager />} />
        <Route path="content" element={<ContentManager />} />
        <Route path="content/:courseId" element={<CourseBuilder backTo="/admin/content" />} />
        <Route path="content/:courseId/people" element={<CourseRoster backTo="/admin/content" />} />
        <Route path="content/:courseId/chat" element={<CourseChatPage backTo="/admin/content" />} />
        {/* An admin sees every thread, including the ones naming a course. */}
        <Route path="support" element={(
          <SupportInbox
            eyebrow="Support"
            title="Support requests"
            subtitle="Every support request from trainees and staff."
            emptyTitle="Nothing to answer"
            emptyBody="No support requests have been filed yet."
          />
        )} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </RoleShell>
  );
}
