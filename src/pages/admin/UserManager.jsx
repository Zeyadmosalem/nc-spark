import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from '../../hooks/useSession';
import { useUsers, usePendingSignups, useUsageSummary, useDailyActiveUsers } from '../../hooks/useAdmin';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import AllowedDomains from '../../components/admin/AllowedDomains';
import StatCard from '../../components/ui/StatCard';
import TrendChart from '../../components/charts/TrendChart';
import BarChart from '../../components/charts/BarChart';
import { USER_PAGE_LIMIT } from '../../api/admin';
import SignupCard from './SignupCard';
import UserRow from './UserRow';

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

const TABS = [
  { key: 'all',        label: 'Everyone',    match: () => true },
  { key: 'trainee',    label: 'Trainees',    match: (u) => u.role === 'trainee' },
  { key: 'trainer',    label: 'Trainers',    match: (u) => u.role === 'trainer' },
  { key: 'supervisor', label: 'Supervisors', match: (u) => u.role === 'supervisor' },
  { key: 'admin',      label: 'Admins',      match: (u) => u.role === 'admin' },
  { key: 'suspended',  label: 'Suspended',   match: (u) => u.status === 'suspended' },
];

export default function UserManager() {
  const { profile } = useSession();
  const users = useUsers();
  const signups = usePendingSignups();
  const usage = useUsageSummary();
  const dau = useDailyActiveUsers(30);

  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  // Captured at mount: a "days since" that moves between renders of the
  // same data is the instability the purity rule exists to catch, and hours
  // of staleness cannot change a figure measured in days.
  const [now] = useState(() => Date.now());

  // Usage, derived once. "Active" is a person seen in the last seven days,
  // which is the only definition used anywhere on this screen.
  //
  // In a memo because it reads the clock: called straight from the render
  // body, "days since" changes between two renders of the same data, which is
  // exactly the instability the purity rule is about.
  const { activeThisWeek, neverSeen, totalVisits, leastActive, seenBy } = useMemo(() => {
    const list = usage.data ?? [];
    const daysAway = (r) => (r.lastSeenAt
      ? Math.floor((now - new Date(r.lastSeenAt).getTime()) / 86400000)
      : 9999);

    return {
      activeThisWeek: list.filter(
        (r) => r.lastSeenAt && now - new Date(r.lastSeenAt).getTime() < 7 * 86400000).length,
      neverSeen: list.filter((r) => !r.lastSeenAt).length,
      totalVisits: list.reduce((n, r) => n + (r.visits30 ?? 0), 0),
      // Who has stopped using it. Accounts never signed into are EXCLUDED:
      // they have no elapsed time to compare, so every one of them rendered a
      // full-width bar reading "Never" and the chart said nothing the tile
      // beside it did not already say. Their count is that tile.
      leastActive: [...list]
        .filter((r) => r.status === 'active' && r.lastSeenAt)
        .sort((a, b) => daysAway(b) - daysAway(a))
        .slice(0, 6)
        .map((r) => ({ id: r.userId, label: r.name || r.email, value: daysAway(r) })),
      seenBy: new Map(list.map((r) => [r.userId, r.lastSeenAt])),
    };
  }, [usage.data, now]);


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
    <div className="page-body stack-lg">
      <div>
        <p className="eyebrow">User Management</p>
        <h1 className="section-heading" style={{ marginBottom: '0.35rem' }}>People</h1>
        <p className="section-sub">
          {all.length} account{all.length === 1 ? '' : 's'} on the platform.
        </p>
        {/* The directory fetches one bounded page. Saying so beats showing a
            partial list as though it were everybody — which is what an
            unbounded query would eventually have done on its own. */}
        {all.length >= USER_PAGE_LIMIT && (
          <Alert tone="info">
            Showing the {USER_PAGE_LIMIT} most recent accounts. Search covers
            only these.
          </Alert>
        )}
      </div>

      {/* Usage, which nothing recorded until now. audit_log answers "what was
          done to the system"; this answers "is anybody using it", which is the
          question an administrator of a training programme actually has. */}
      <section className="card no-hover stack-md">
        <div className="section-header" style={{ marginBottom: 0 }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Platform use</h2>
          <span className="section-count">last 30 days</span>
        </div>

        {usage.error ? (
          <QueryError error={usage.error} what="usage" />
        ) : (
          <>
            <div className="stat-grid stat-grid-3">
              <StatCard
                label="Active this week"
                value={activeThisWeek}
                icon="users"
                color="var(--brand-primary)"
              />
              <StatCard
                label="Never signed in"
                value={neverSeen}
                sub={neverSeen > 0 ? 'Accounts that have not been used' : 'Everybody has been in'}
                icon="waiting"
                color="var(--warn)"
              />
              <StatCard
                label="Visits (30 days)"
                value={totalVisits}
                icon="trend"
                color="var(--brand-accent)"
              />
            </div>

            {(dau.data ?? []).some((d) => d.points > 0) && (
              <TrendChart
                data={dau.data}
                label="People using the platform"
                formatValue={(n) => `${n} ${n === 1 ? 'person' : 'people'}`}
              />
            )}

            {leastActive.length > 0 && (
              <div>
                <h3 className="text-sm" style={{ margin: '0 0 0.5rem' }}>
                  Longest since signing in
                </h3>
                <BarChart
                  rows={leastActive}
                  formatValue={(n) => (n === 0 ? 'Today' : `${n}d ago`)}
                  emptyLabel="Everybody has been in recently."
                />
              </div>
            )}
          </>
        )}
      </section>

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
          <EmptyState icon="complete" title="Nobody is waiting">
            Signups from allowlisted domains activate themselves. Anyone else lands
            here for you to review.
          </EmptyState>
        ) : (
          <div className="grid-sm">
            <AnimatePresence initial={false}>
              {queue.map((u) => <SignupCard key={u.id} user={u} />)}
            </AnimatePresence>
          </div>
        ))}
      </section>

      {/* Directly above the directory, and directly below the queue it
          controls: allowlisting a domain is what stops signups landing there
          in the first place. */}
      <section>
        <div className="section-header" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Who skips approval</h2>
        </div>
        <AllowedDomains />
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

        <motion.div className="grid-sm"
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {shown.length === 0 ? (
            <EmptyState icon="search" title={term ? 'No matches' : 'Nobody here'}>
              {term
                ? `Nobody matches "${search}". Try part of a name or an email domain.`
                : 'No users in this group yet.'}
            </EmptyState>
          ) : (
            shown.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === profile?.id}
                lastSeenAt={seenBy.get(u.id)}
              />
            ))
          )}
        </motion.div>
      </section>
    </div>
  );
}

