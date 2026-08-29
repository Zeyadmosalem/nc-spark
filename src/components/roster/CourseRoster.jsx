import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useCourseRoster } from '../../hooks/useRoster';
import { useCourseForEditing } from '../../hooks/useAuthoring';
import QueryError from '../shared/QueryError';
import PageSkeleton from '../ui/Skeleton';
import PageHeader from '../ui/PageHeader';
import CourseTabs from '../shared/CourseTabs';
import StatCard from '../ui/StatCard';
import StatusPill from '../ui/StatusPill';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';

/**
 * Who is on a course, and where each of them has got to.
 *
 * The trainer dashboard could show an average and a headcount, so the one
 * question compliance training exists to answer — who has not done it yet —
 * had no screen anywhere in the product. Every policy this needs has been in
 * place since M3.
 *
 * Sorted by least progress first, by default, because that is the actionable
 * order: the top of this list is the work. Alphabetical is available for when
 * somebody is looking up one person rather than chasing a cohort.
 *
 * Mounted by both the trainer and admin routes. enrollments_select_course_staff
 * and profiles_select_my_trainees authorise a trainer for their own courses and
 * an admin for all of them, so the same component is correct for both.
 */

const ORDER = {
  behind: { label: 'Least progress first', sort: (a, b) => a.percent - b.percent },
  ahead: { label: 'Most progress first', sort: (a, b) => b.percent - a.percent },
  name: { label: 'By name', sort: (a, b) => a.name.localeCompare(b.name) },
};

const onDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const mean = (nums) =>
  (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null);

export default function CourseRoster({ backTo = '/trainer/courses' }) {
  const { courseId } = useParams();
  const roster = useCourseRoster(courseId);
  const course = useCourseForEditing(courseId);
  const [order, setOrder] = useState('behind');

  if (roster.isLoading || course.isLoading) {
    return <PageSkeleton label="Loading the roster" rows={4} />;
  }

  const failure = roster.error ?? course.error;
  if (failure) {
    return (
      <div className="page-body">
        <QueryError error={failure} what="this course roster" />
      </div>
    );
  }

  const activities = (course.data?.modules ?? []).flatMap((m) =>
    m.activities.map((a) => ({ ...a, moduleTitle: m.title })));

  const people = [...(roster.data ?? [])];
  const active = people.filter((p) => p.status === 'active' || p.status === 'completed');
  const finished = people.filter((p) => p.status === 'completed');
  const waiting = people.filter((p) => p.status === 'pending');
  const notStarted = active.filter((p) => p.percent === 0);
  const averageProgress = mean(active.map((p) => p.percent));

  // Anything a trainer has to mark before a trainee can move on.
  const toMark = people.reduce(
    (n, p) => n + p.attempts.filter((a) => a.status === 'pending_review').length, 0);

  const sorted = people.sort(ORDER[order].sort);

  return (
    <div className="page-body">
      <PageHeader
        eyebrow={course.data?.title ?? 'Course'}
        icon="users"
        title="Who is on this course"
        subtitle={`${people.length} ${people.length === 1 ? 'person' : 'people'}, across `
          + `${activities.length} activit${activities.length === 1 ? 'y' : 'ies'}.`}
        backTo={backTo}
        backLabel="Back to courses"
      />

      <CourseTabs base={`${backTo}/${courseId}`} />

      {people.length === 0 ? (
        <EmptyState icon="users" title="Nobody is enrolled yet">
          Trainees enrol from the catalog, and a published course is the only
          kind they can see. Applications appear on your dashboard for approval.
        </EmptyState>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Enrolled" value={active.length} icon="users" color="var(--brand-primary)" />
            <StatCard
              label="Not started"
              value={notStarted.length}
              sub={notStarted.length ? 'no activity completed' : 'everyone has begun'}
              icon="waiting"
              color={notStarted.length ? 'var(--brand-accent)' : 'var(--text-3)'}
            />
            <StatCard
              label="Finished"
              value={finished.length}
              sub={averageProgress === null ? '' : `${averageProgress}% average progress`}
              icon="complete"
              color="#1a7f37"
            />
            <StatCard
              label="Awaiting your marking"
              value={toMark}
              sub={toMark ? 'blocking those trainees' : 'nothing waiting'}
              icon="review"
              color={toMark ? 'var(--warn)' : 'var(--text-3)'}
            />
          </div>

          {waiting.length > 0 && (
            <div className="card no-hover card-accent card-warn">
              <p className="text-sm" style={{ margin: 0, color: 'var(--text-2)' }}>
                <strong>{waiting.length}</strong> application
                {waiting.length === 1 ? '' : 's'} on this course{' '}
                {waiting.length === 1 ? 'is' : 'are'} still waiting for a decision.
                They cannot start until then.
              </p>
            </div>
          )}

          <div className="cluster">
            <label className="input-label m-0" htmlFor="roster-order">
              Order
            </label>
            <select
              id="roster-order" className="input-field field-auto"
              value={order} onChange={(e) => setOrder(e.target.value)}
            >
              {Object.entries(ORDER).map(([value, { label }]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="stack">
            {sorted.map((person) => (
              <PersonRow key={person.id} person={person} activities={activities} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PersonRow({ person, activities }) {
  const [open, setOpen] = useState(false);
  const done = person.completedActivities;
  const doneCount = activities.filter((a) => done.has(a.id)).length;
  const stuck = person.attempts.filter((a) => a.status === 'pending_review').length;

  return (
    <motion.div layout className="card no-hover" style={{ padding: '0.75rem 1rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap',
      }}>
        <div className="avatar" aria-hidden="true" style={{ flexShrink: 0 }}>
          {person.avatar || person.name.charAt(0).toUpperCase()}
        </div>
        <div className="grow-field">
          <div className="semibold">{person.name}</div>
          <div className="text-xs muted">
            {doneCount} of {activities.length} activit
            {activities.length === 1 ? 'y' : 'ies'}
            {person.completedAt && ` · finished ${onDate(person.completedAt)}`}
          </div>
        </div>

        <div style={{ width: 160, minWidth: 120 }}>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${person.percent}%` }} />
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.2rem' }}>
            {person.percent}%
          </div>
        </div>

        {stuck > 0 && (
          <span className="chip accent">
            <Icon name="review" size={12} />
            {stuck} to mark
          </span>
        )}
        <StatusPill status={person.status} />

        <button type="button" className="btn btn-ghost btn-sm"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Detail'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
              Activities
            </div>
            {activities.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-3)', margin: 0 }}>
                This course has no activities yet.
              </p>
            ) : (
              <div className="stack-xs">
                {activities.map((a) => {
                  const at = done.get(a.id);
                  return (
                    <div key={a.id} style={{
                      display: 'flex', gap: '0.5rem', alignItems: 'baseline',
                      fontSize: '0.82rem',
                      color: at ? 'var(--text-2)' : 'var(--text-3)',
                    }}>
                      <Icon name={at ? 'complete' : 'empty'} size={14}
                            style={{ color: at ? '#1a7f37' : 'var(--text-3)' }} />
                      <Icon name={a.type} size={14} />
                      <span className="grow">
                        {a.title}
                        <span className="muted"> · {a.moduleTitle}</span>
                      </span>
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {at ? onDate(at) : 'not done'}
                      </span>
                      {/* Said in words as well as with a tick: a colour and a
                          glyph alone are not a status to someone reading with
                          a screen reader. */}
                      <span className="sr-only">
                        {at ? 'completed' : 'not completed'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {person.attempts.length > 0 && (
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                Quiz attempts
              </div>
              <div className="stack-xs">
                {person.attempts.map((a) => (
                  <div key={a.id} className="data-row" style={{ padding: '0.35rem 0.5rem' }}>
                    <div className="data-row-main">
                      <div className="data-row-title" style={{ fontSize: '0.85rem' }}>
                        {a.quizTitle}
                      </div>
                      <div className="data-row-meta">
                        {a.submittedAt ? onDate(a.submittedAt) : ''}
                        {a.attemptNo > 1 ? ` · attempt ${a.attemptNo}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                      {/* A dash, not a zero. An unmarked paragraph has no
                          score yet, and 0% reads as a fail. */}
                      <span className="bold">
                        {typeof a.score === 'number' ? `${a.score}%` : '—'}
                      </span>
                      <StatusPill status={a.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
